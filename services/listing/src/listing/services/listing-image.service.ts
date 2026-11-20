import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import { StorageService } from '../../storage/storage.service';
import { LISTING_IMAGES_BUCKET } from '../config/listing.env';
import { ListingImageDto } from '../dto/listing.dto';
import { UploadUrlResponseDto } from '../dto/upload-url.dto';
import {
  listingImageInvalid,
  listingImageLimitReached,
  listingNotFound,
  listingNotOwner,
} from '../errors/listing.errors';
import { resubmits } from './listing-edit.rules';
import { buildImageKey, checkUploadedImage, isKeyOfListing } from './listing-image.rules';
import { ListingPresenter } from './listing.presenter';
import { isUniqueViolation } from './listing.sql';

interface OwnershipRow {
  ownerId: string;
  imageCount: number;
  existingImageId: string | null;
  existingSortOrder: number | null;
}

/**
 * Tải ảnh tin đăng bằng presigned PUT (`RE.LISTING/API_Spec.md §1`, route 7–8; `Processing_Flow.md §2`).
 * Ảnh đi thẳng từ trình duyệt lên S3, service không nhận byte nào. Service đặt key; kích thước chỉ
 * kiểm được bằng `HeadObject` sau khi tải xong (presigned PUT không giới hạn được, `gotchas.md`).
 */
@Injectable()
export class ListingImageService {
  private readonly maxBytes: number;
  private readonly maxCount: number;
  private readonly types: string[];
  private readonly presignTtl: number;

  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly presenter: ListingPresenter,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ListingImageService.name);
    this.maxBytes = config.get('LISTING_IMAGE_MAX_BYTES', { infer: true });
    this.maxCount = config.get('LISTING_IMAGE_MAX_COUNT', { infer: true });
    this.types = config.get('LISTING_IMAGE_TYPES', { infer: true });
    this.presignTtl = config.get('S3_PRESIGN_TTL_SECONDS', { infer: true });
  }

  /** Route 7: cấp presigned PUT với key do service đặt, `Content-Type` đã ký vào URL. */
  async createUploadUrl(
    ownerId: string,
    id: string,
    contentType: string,
  ): Promise<UploadUrlResponseDto> {
    const info = await this.loadOwnership(id, ownerId, null);
    if (!this.types.includes(contentType)) {
      throw listingImageInvalid('TYPE_NOT_ALLOWED');
    }
    if (info.imageCount >= this.maxCount) throw listingImageLimitReached(this.maxCount);

    const key = buildImageKey(id, contentType);
    const uploadUrl = await this.storage.presignPut(LISTING_IMAGES_BUCKET, key, contentType);
    return { uploadUrl, key, expiresInSeconds: this.presignTtl };
  }

  /**
   * Route 8: xác nhận ảnh đã tải. Trả `created = false` khi `key` đã có (gọi lại: `200`, không đổi gì).
   *
   * Thứ tự: chủ sở hữu → key đã có → key đúng dạng → `HeadObject` (ngoài transaction) → transaction
   * ngắn (khóa tin, đếm, thêm ảnh, đưa tin về `PENDING_REVIEW` nếu cần). Ảnh không hợp lệ thì xóa object
   * trên S3; xóa lỗi chỉ ghi log (tech-debt: ảnh không bao giờ được xác nhận vẫn nằm lại).
   */
  async confirm(
    ownerId: string,
    id: string,
    key: string,
  ): Promise<{ image: ListingImageDto; created: boolean }> {
    const info = await this.loadOwnership(id, ownerId, key);
    if (info.existingImageId) {
      return {
        image: await this.presenter.imageDto(
          info.existingImageId,
          key,
          info.existingSortOrder ?? 0,
        ),
        created: false,
      };
    }

    if (!isKeyOfListing(id, key)) throw listingImageInvalid('KEY_NOT_OF_LISTING');

    const head = await this.storage.headObject(LISTING_IMAGES_BUCKET, key);
    const problem = checkUploadedImage(head, { maxBytes: this.maxBytes, types: this.types });
    if (problem) {
      if (problem !== 'NOT_FOUND') await this.discard(key);
      throw listingImageInvalid(problem);
    }

    try {
      const saved = await this.insertImage(id, key);
      return {
        image: await this.presenter.imageDto(saved.id, key, saved.sortOrder),
        created: true,
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Hai lần xác nhận cùng key đồng thời: bên thua trả ảnh đã có, như gọi lại
      const again = await this.loadOwnership(id, ownerId, key);
      if (!again.existingImageId) throw err;
      return {
        image: await this.presenter.imageDto(
          again.existingImageId,
          key,
          again.existingSortOrder ?? 0,
        ),
        created: false,
      };
    }
  }

  /** Khóa dòng tin, kiểm giới hạn, thêm ảnh, đổi trạng thái duyệt: một transaction, không gọi mạng bên trong. */
  private insertImage(id: string, key: string): Promise<{ id: string; sortOrder: number }> {
    return this.dataSource.transaction(async (manager) => {
      // Khóa dòng tin TRƯỚC, đếm ảnh bằng câu SAU. Không gộp: ở READ COMMITTED, subquery đếm trong
      // cùng câu `FOR UPDATE` dùng snapshot cũ nên bên chờ khóa vẫn thấy số ảnh trước khi bên kia
      // commit, và hai request cùng vượt giới hạn (test 16).
      const [row] = await manager.query<
        Array<{ approvalStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' }>
      >(
        `SELECT l.approval_status AS "approvalStatus"
           FROM listings l
          WHERE l.id = $1 AND l.deleted_at IS NULL
            FOR UPDATE OF l`,
        [id],
      );
      if (!row) throw listingNotFound();
      const [{ imageCount }] = await manager.query<Array<{ imageCount: number }>>(
        `SELECT count(*)::int AS "imageCount" FROM listing_images WHERE listing_id = $1`,
        [id],
      );
      if (imageCount >= this.maxCount) throw listingImageLimitReached(this.maxCount);

      const [image] = await manager.query<Array<{ id: string; sortOrder: number }>>(
        `INSERT INTO listing_images (listing_id, object_key, sort_order)
         VALUES ($1, $2, $3) RETURNING id, sort_order AS "sortOrder"`,
        [id, key, imageCount],
      );
      if (resubmits(row.approvalStatus, { changed: ['images'], display: true })) {
        await manager.query(
          `UPDATE listings
              SET approval_status = 'PENDING_REVIEW', reject_reason = NULL, reviewed_by = NULL,
                  reviewed_at = NULL, version = version + 1, updated_at = now()
            WHERE id = $1`,
          [id],
        );
      }
      return image;
    });
  }

  /** Tin tồn tại, của người gọi; kèm số ảnh hiện có và ảnh trùng `key` (nếu có). Một truy vấn. */
  private async loadOwnership(
    id: string,
    ownerId: string,
    key: string | null,
  ): Promise<OwnershipRow> {
    const [row] = await this.dataSource.query<OwnershipRow[]>(
      `SELECT l.owner_id AS "ownerId",
              (SELECT count(*)::int FROM listing_images i WHERE i.listing_id = l.id) AS "imageCount",
              (SELECT i.id FROM listing_images i
                WHERE i.listing_id = l.id AND i.object_key = $2) AS "existingImageId",
              (SELECT i.sort_order FROM listing_images i
                WHERE i.listing_id = l.id AND i.object_key = $2) AS "existingSortOrder"
         FROM listings l
        WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id, key],
    );
    if (!row) throw listingNotFound();
    if (row.ownerId !== ownerId) throw listingNotOwner();
    return row;
  }

  /** Xóa object ảnh không hợp lệ; lỗi xóa chỉ ghi log, không đổi kết quả `400`. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(LISTING_IMAGES_BUCKET, key);
    } catch (err) {
      this.logger.warn({ err, key }, 'Không xóa được ảnh không hợp lệ trên S3');
    }
  }
}
