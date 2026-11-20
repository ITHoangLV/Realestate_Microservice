import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { SearchListingsQuery } from '../dto/search-listings.query';
import { ListingQueryService } from './listing-query.service';
import { ListingPresenter } from './listing.presenter';

const search = (plain: Record<string, unknown> = {}) => plainToInstance(SearchListingsQuery, plain);

function make(...results: unknown[]) {
  const query = jest.fn();
  for (const r of results) query.mockResolvedValueOnce(r);
  const presentSummaries = jest.fn(async (rows: Array<{ id: string }>) =>
    rows.map((r) => ({ id: r.id, coverImageUrl: null })),
  );
  const service = new ListingQueryService(
    { query } as unknown as DataSource,
    { presentSummaries } as unknown as ListingPresenter,
  );
  return { service, query, presentSummaries };
}

describe('ListingQueryService.search (route 11)', () => {
  it('có kết quả: đúng 2 truy vấn (count rồi data), phân trang theo query', async () => {
    const { service, query, presentSummaries } = make([{ total: 41 }], [{ id: 'a' }, { id: 'b' }]);
    const page = await service.search(search({ page: '2', pageSize: '2', minPrice: '1000' }));

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('count(*)');
    expect(query.mock.calls[1][0]).toContain('LIMIT');
    // count dùng đúng tham số của WHERE, data thêm LIMIT, OFFSET
    expect(query.mock.calls[0][1]).toEqual([1000]);
    expect(query.mock.calls[1][1]).toEqual([1000, 2, 2]);
    expect(presentSummaries).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }]);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 41 });
    expect(page.items).toEqual([
      { id: 'a', coverImageUrl: null },
      { id: 'b', coverImageUrl: null },
    ]);
  });

  it('total = 0: chỉ 1 truy vấn, không đọc data, không ký URL', async () => {
    const { service, query, presentSummaries } = make([{ total: 0 }]);
    const page = await service.search(search());
    expect(query).toHaveBeenCalledTimes(1);
    expect(presentSummaries).not.toHaveBeenCalled();
    expect(page).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});

describe('ListingQueryService.snapshot (API nội bộ a)', () => {
  const snap = {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    ownerId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    title: 'Phòng 25m2',
    depositAmountVnd: 3000000,
    status: 'HIDDEN',
    approvalStatus: 'PENDING_REVIEW',
  };

  it('trả bản chụp (kể cả tin ẩn, chưa duyệt) bằng đúng 1 truy vấn, không lọc approval_status', async () => {
    const { service, query } = make([snap]);
    await expect(service.snapshot(snap.id)).resolves.toEqual(snap);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([snap.id]);
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).not.toMatch(/approval_status\s*=/);
  });

  it('không có hoặc đã xóa mềm: 404 LISTING_NOT_FOUND', async () => {
    const { service } = make([]);
    const err = await service.snapshot(snap.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('LISTING_NOT_FOUND');
    expect((err as AppException).getStatus()).toBe(404);
  });
});
