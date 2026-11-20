import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { LISTING_IMAGES_BUCKET } from '../config/listing.env';
import { ListingDto, ListingImageDto } from '../dto/listing.dto';
import { ListingSummaryDto } from '../dto/listing-summary.dto';
import { SearchRow } from './listing-search.sql';
import { ListingRow } from './listing.sql';

interface ImageRow {
  id: string;
  listingId: string;
  objectKey: string;
  sortOrder: number;
}

/**
 * Đổi `ListingRow` thành `ListingDto`: thêm ảnh bằng MỘT truy vấn cho cả trang (`listing_id = ANY`),
 * không truy vấn theo từng tin (`non-functional-standards.md §1`). URL ảnh là presigned GET, ký ở
 * máy (không gọi mạng S3).
 */
@Injectable()
export class ListingPresenter {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async present(rows: ListingRow[]): Promise<ListingDto[]> {
    if (rows.length === 0) return [];
    const images = await this.dataSource.query<ImageRow[]>(
      `SELECT id, listing_id AS "listingId", object_key AS "objectKey", sort_order AS "sortOrder"
         FROM listing_images
        WHERE listing_id = ANY($1::uuid[])
        ORDER BY sort_order, created_at, id`,
      [rows.map((r) => r.id)],
    );
    const dtos = await Promise.all(
      images.map((i) => this.imageDto(i.id, i.objectKey, i.sortOrder)),
    );
    const byListing = new Map<string, ListingImageDto[]>();
    images.forEach((image, index) => {
      const list = byListing.get(image.listingId) ?? [];
      list.push(dtos[index]);
      byListing.set(image.listingId, list);
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      images: byListing.get(row.id) ?? [],
    }));
  }

  /**
   * Đổi kết quả tìm kiếm thành `ListingSummaryDto`. KHÔNG truy vấn DB: ảnh bìa đã nằm trong dòng
   * (`LEFT JOIN LATERAL`), chỉ ký URL cục bộ. `distanceM` chỉ có khi dòng có khoảng cách.
   */
  async presentSummaries(rows: SearchRow[]): Promise<ListingSummaryDto[]> {
    return Promise.all(
      rows.map(async ({ coverKey, distanceM, createdAt, ...rest }) => ({
        ...rest,
        ...(distanceM === undefined || distanceM === null ? {} : { distanceM }),
        coverImageUrl: coverKey === null ? null : await this.imageUrl(coverKey),
        createdAt: createdAt.toISOString(),
      })),
    );
  }

  /** Ảnh với URL xem tạm (hết hạn sau `S3_PRESIGN_TTL_SECONDS`). */
  async imageDto(id: string, objectKey: string, sortOrder: number): Promise<ListingImageDto> {
    return { id, url: await this.imageUrl(objectKey), sortOrder };
  }

  /** Presigned GET của ảnh trong bucket `listing-images` (ký ở máy, không gọi mạng). */
  private imageUrl(objectKey: string): Promise<string> {
    return this.storage.presignGet(LISTING_IMAGES_BUCKET, objectKey);
  }
}
