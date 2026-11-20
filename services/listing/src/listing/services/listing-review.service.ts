import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ListingDto } from '../dto/listing.dto';
import { listingAlreadyReviewed, listingNotFound } from '../errors/listing.errors';
import { ListingPresenter } from './listing.presenter';
import { listingColumns, ListingRow, rowsOf } from './listing.sql';

/**
 * Quản trị viên duyệt hoặc từ chối tin (`RE.LISTING/API_Spec.md §1`, route 9–10).
 * Chỉ tin `PENDING_REVIEW` chưa xóa được duyệt; hai quản trị viên bấm cùng lúc thì một người thắng
 * (`UPDATE ... WHERE approval_status = 'PENDING_REVIEW'`), người kia nhận `409 LISTING_ALREADY_REVIEWED`.
 * Quản trị viên là `sub` trong JWT, ghi vào `reviewed_by`.
 */
@Injectable()
export class ListingReviewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presenter: ListingPresenter,
  ) {}

  approve(adminId: string, id: string): Promise<ListingDto> {
    return this.review(adminId, id, 'APPROVED', null);
  }

  reject(adminId: string, id: string, reason: string): Promise<ListingDto> {
    return this.review(adminId, id, 'REJECTED', reason);
  }

  private async review(
    adminId: string,
    id: string,
    result: 'APPROVED' | 'REJECTED',
    rejectReason: string | null,
  ): Promise<ListingDto> {
    const [row] = rowsOf<ListingRow>(
      await this.dataSource.query(
        `UPDATE listings AS l
            SET approval_status = $3, reject_reason = $4, reviewed_by = $2, reviewed_at = now(),
                updated_at = now(), version = version + 1
          WHERE l.id = $1 AND l.deleted_at IS NULL AND l.approval_status = 'PENDING_REVIEW'
          RETURNING ${listingColumns('l')}`,
        [id, adminId, result, rejectReason],
      ),
    );
    if (row) return (await this.presenter.present([row]))[0];

    const exists = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM listings WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    throw exists.length === 0 ? listingNotFound() : listingAlreadyReviewed();
  }
}
