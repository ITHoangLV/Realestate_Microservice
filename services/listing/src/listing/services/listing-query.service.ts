import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Paginated } from '../../common/response/response-meta';
import { ListingDto } from '../dto/listing.dto';
import { ListingSnapshotDto } from '../dto/internal-listing.dto';
import { ListingSummaryDto } from '../dto/listing-summary.dto';
import { ListMineQuery } from '../dto/list-mine.query';
import { SearchListingsQuery } from '../dto/search-listings.query';
import { listingNotFound } from '../errors/listing.errors';
import { buildSearchSql, SearchRow } from './listing-search.sql';
import { ListingPresenter } from './listing.presenter';
import { listingColumns, ListingRow } from './listing.sql';

/**
 * Đọc tin (`RE.LISTING/API_Spec.md §1, §2`): `findPublic` (route 12), `findMine` (route 6) từ T2.2;
 * `search` (route 11, PostGIS) và `snapshot` (API nội bộ cho rental) từ T2.3.
 */
@Injectable()
export class ListingQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presenter: ListingPresenter,
  ) {}

  /**
   * Route 11: tìm kiếm công khai (`API_Spec.md §1.3`). Câu SQL do `buildSearchSql` dựng; `count` và `data`
   * dùng cùng WHERE. 2 truy vấn (đếm, dữ liệu có ảnh bìa qua `LEFT JOIN LATERAL`), 1 khi không có kết quả.
   * Ảnh bìa ký URL cục bộ, không thêm truy vấn.
   */
  async search(query: SearchListingsQuery): Promise<Paginated<ListingSummaryDto>> {
    const built = buildSearchSql(query);
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      built.countSql,
      built.countParams,
    );
    if (total === 0) return new Paginated([], query.page, query.pageSize, 0);
    const rows = await this.dataSource.query<SearchRow[]>(built.dataSql, built.dataParams);
    return new Paginated(
      await this.presenter.presentSummaries(rows),
      query.page,
      query.pageSize,
      total,
    );
  }

  /**
   * API nội bộ `GET /internal/listings/:id` (rental, S1): bản chụp để tạo đơn. Trả cả tin `HIDDEN` và chưa
   * duyệt (rental tự xử lý); chỉ tin không có hoặc đã xóa mềm → `404`. 1 truy vấn.
   */
  async snapshot(id: string): Promise<ListingSnapshotDto> {
    const [row] = await this.dataSource.query<ListingSnapshotDto[]>(
      `SELECT id, owner_id AS "ownerId", title, deposit_amount_vnd::float8 AS "depositAmountVnd",
              status, approval_status AS "approvalStatus"
         FROM listings WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!row) throw listingNotFound();
    return row;
  }

  /**
   * Route 12: chi tiết công khai. `404` khi không có, chưa duyệt hoặc đã xóa. Tin `HIDDEN` vẫn trả
   * (chỉ tìm kiếm loại tin ẩn, `API_Spec.md §1.4`). 2 truy vấn (tin + ảnh).
   */
  async findPublic(id: string): Promise<ListingDto> {
    const [row] = await this.dataSource.query<ListingRow[]>(
      `SELECT ${listingColumns('l')} FROM listings l
        WHERE l.id = $1 AND l.deleted_at IS NULL AND l.approval_status = 'APPROVED'`,
      [id],
    );
    if (!row) throw listingNotFound();
    return (await this.presenter.present([row]))[0];
  }

  /**
   * Route 6: tin của tôi, mọi trạng thái duyệt (kèm `HIDDEN`), không gồm tin đã xóa. Sắp xếp tường minh
   * `created_at DESC, id DESC` (khóa phụ ổn định). 3 truy vấn: đếm, dữ liệu, ảnh của cả trang.
   */
  async findMine(ownerId: string, query: ListMineQuery): Promise<Paginated<ListingDto>> {
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM listings WHERE owner_id = $1 AND deleted_at IS NULL`,
      [ownerId],
    );
    const rows = await this.dataSource.query<ListingRow[]>(
      `SELECT ${listingColumns('l')} FROM listings l
        WHERE l.owner_id = $1 AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $2 OFFSET $3`,
      [ownerId, query.pageSize, query.skip],
    );
    return new Paginated(await this.presenter.present(rows), query.page, query.pageSize, total);
  }
}
