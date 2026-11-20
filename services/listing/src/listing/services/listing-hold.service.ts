import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ChangeStatusDto,
  ChangeStatusResultDto,
  HoldListingDto,
  HoldResultDto,
} from '../dto/internal-listing.dto';
import { ListingStatus } from '../entities/listing.enums';
import {
  listingInvalidStatus,
  listingNotAvailable,
  listingNotFound,
} from '../errors/listing.errors';
import { decideWhenNoMatch, HoldState, sourcesFor } from './listing-hold.rules';
import { rowsOf } from './listing.sql';

interface HoldRow extends HoldState {
  heldUntil: Date | null;
}

/**
 * Giữ chỗ và đổi trạng thái BĐS theo đơn đặt cọc (API nội bộ cho rental, `RE.LISTING/API_Spec.md §2`).
 *
 * Quyết định "còn trống hay không" nằm ở MỘT câu `UPDATE ... WHERE <trạng thái mong đợi>` (BR-05,
 * BR-06): Postgres khóa dòng, lệnh thứ hai chờ rồi đánh giá lại `WHERE`. Không khóa ứng dụng, không
 * transaction nhiều câu, không gọi service khác. 0 dòng thì đọc lại đúng một lần để chọn `404`/`200`/`409`.
 */
@Injectable()
export class ListingHoldService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Giữ chỗ (API_Spec §2.1). Chỉ tin đã duyệt, chưa xóa, đang `AVAILABLE` — hoặc đang `HELD` nhưng đã
   * quá `held_until` (A9: chỗ giữ của đơn không tạo được tự hết hiệu lực).
   * 1 truy vấn; thêm 1 khi 0 dòng (gọi lại cùng đơn, hoặc `404`/`409`).
   */
  async hold(id: string, dto: HoldListingDto): Promise<HoldResultDto> {
    const [held] = rowsOf<{ heldUntil: Date }>(
      await this.dataSource.query(
        `UPDATE listings
            SET status = 'HELD', held_until = $3, held_by_deposit_id = $2,
                version = version + 1, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND approval_status = 'APPROVED'
            AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < now()))
          RETURNING held_until AS "heldUntil"`,
        [id, dto.depositId, new Date(dto.heldUntil)],
      ),
    );
    if (held) return this.heldResult(id, dto.depositId, held.heldUntil);

    const current = await this.read(id);
    if (!current) throw listingNotFound();
    // Gọi lại cùng đơn khi chỗ giữ còn hiệu lực: 200, không đổi gì (test 8)
    if (
      current.status === 'HELD' &&
      current.heldByDepositId === dto.depositId &&
      current.heldUntil
    ) {
      return this.heldResult(id, dto.depositId, current.heldUntil);
    }
    throw listingNotAvailable();
  }

  /**
   * Đổi trạng thái theo đơn (API_Spec §2.2). Mỗi đích có tập nguồn hợp lệ (`sourcesFor`) và điều kiện
   * chung `held_by_deposit_id = depositId`; về `AVAILABLE` xóa `held_until`, `held_by_deposit_id`.
   * 1 truy vấn; thêm 1 khi 0 dòng.
   */
  async changeStatus(id: string, dto: ChangeStatusDto): Promise<ChangeStatusResultDto> {
    // Mảnh SQL chọn từ hằng số theo đích, không nối giá trị người dùng
    const clearHold =
      dto.status === 'AVAILABLE' ? ', held_until = NULL, held_by_deposit_id = NULL' : '';
    const [changed] = rowsOf<{ status: ListingStatus }>(
      await this.dataSource.query(
        `UPDATE listings
            SET status = $3${clearHold}, version = version + 1, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND held_by_deposit_id = $2
            AND status = ANY($4::text[])
          RETURNING status`,
        [id, dto.depositId, dto.status, sourcesFor(dto.status)],
      ),
    );
    if (changed) return { listingId: id, status: changed.status };

    const current = await this.read(id);
    if (!current) throw listingNotFound();
    if (decideWhenNoMatch(current, dto.status, dto.depositId) === 'IDEMPOTENT') {
      return { listingId: id, status: current.status };
    }
    throw listingInvalidStatus({ current: current.status, target: dto.status });
  }

  /** Đọc lại trạng thái giữ chỗ khi `UPDATE` không khớp dòng nào (tin đã xóa mềm coi như không có). */
  private async read(id: string): Promise<HoldRow | undefined> {
    const [row] = await this.dataSource.query<HoldRow[]>(
      `SELECT status, held_by_deposit_id AS "heldByDepositId", held_until AS "heldUntil"
         FROM listings WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return row;
  }

  private heldResult(listingId: string, depositId: string, heldUntil: Date): HoldResultDto {
    return { listingId, depositId, status: 'HELD', heldUntil: heldUntil.toISOString() };
  }
}
