import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Paginated } from '../../common/response/response-meta';
import { ListingDto } from '../dto/listing.dto';
import { ListMineQuery } from '../dto/list-mine.query';
import { listingNotFound } from '../errors/listing.errors';
import { ListingPresenter } from './listing.presenter';
import { listingColumns, ListingRow } from './listing.sql';

/**
 * Đọc tin (`RE.LISTING/API_Spec.md §1`). T2.2 có `findPublic` (route 12) và `findMine` (route 6);
 * tìm kiếm PostGIS (route 11) và bản chụp cho rental làm ở T2.3.
 */
@Injectable()
export class ListingQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presenter: ListingPresenter,
  ) {}

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
