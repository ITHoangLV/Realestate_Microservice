import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { ListingHoldService } from './listing-hold.service';

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const DEP_A = '3f9a1c2e-8b4d-4e6f-a1b2-c3d4e5f60718';
const DEP_B = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const HELD_UNTIL = '2026-11-20T08:10:00.000Z';

/** `UPDATE ... RETURNING` của TypeORM + pg trả `[dòng, số dòng]`; `SELECT` trả mảng dòng. */
const updated = (rows: unknown[]) => [rows, rows.length];

function make(...results: unknown[]) {
  const query = jest.fn();
  for (const r of results) query.mockResolvedValueOnce(r);
  return { service: new ListingHoldService({ query } as unknown as DataSource), query };
}

async function expectApp(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppException);
  expect((err as AppException).code).toBe(code);
  expect((err as AppException).getStatus()).toBe(status);
  return err as AppException;
}

describe('ListingHoldService.hold (API_Spec §2.1)', () => {
  const dto = { depositId: DEP_A, heldUntil: '2026-11-20T08:10:00Z' };

  it('UPDATE khớp 1 dòng: 200 HELD, đúng 1 truy vấn, tham số (id, depositId, heldUntil)', async () => {
    const { service, query } = make(updated([{ heldUntil: new Date(HELD_UNTIL) }]));
    await expect(service.hold(ID, dto)).resolves.toEqual({
      listingId: ID,
      depositId: DEP_A,
      status: 'HELD',
      heldUntil: HELD_UNTIL,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([ID, DEP_A, new Date(HELD_UNTIL)]);
    expect(sql).toContain(`approval_status = 'APPROVED'`);
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain(`status = 'AVAILABLE' OR (status = 'HELD' AND held_until < now())`);
    expect(sql).toContain('version = version + 1');
  });

  it('SELECT thẳng (không bọc [rows, n]) cũng được nhận: rowsOf', async () => {
    const { service } = make([{ heldUntil: new Date(HELD_UNTIL) }]);
    await expect(service.hold(ID, dto)).resolves.toMatchObject({ status: 'HELD' });
  });

  it('0 dòng, HELD bởi CHÍNH đơn này: 200 với held_until đang lưu (test 8), 2 truy vấn', async () => {
    const stored = new Date('2026-11-20T08:09:00.000Z');
    const { service, query } = make(updated([]), [
      { status: 'HELD', heldByDepositId: DEP_A, heldUntil: stored },
    ]);
    await expect(service.hold(ID, dto)).resolves.toEqual({
      listingId: ID,
      depositId: DEP_A,
      status: 'HELD',
      heldUntil: stored.toISOString(),
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('0 dòng, HELD bởi đơn KHÁC còn hạn: 409 LISTING_NOT_AVAILABLE (test 6)', async () => {
    const { service } = make(updated([]), [
      { status: 'HELD', heldByDepositId: DEP_B, heldUntil: new Date() },
    ]);
    await expectApp(service.hold(ID, dto), 409, 'LISTING_NOT_AVAILABLE');
  });

  it.each(['HIDDEN', 'DEPOSITED', 'RENTED', 'AVAILABLE'] as const)(
    '0 dòng, tin %s (không giữ được, ví dụ chưa duyệt): 409 LISTING_NOT_AVAILABLE',
    async (status) => {
      const { service } = make(updated([]), [{ status, heldByDepositId: null, heldUntil: null }]);
      await expectApp(service.hold(ID, dto), 409, 'LISTING_NOT_AVAILABLE');
    },
  );

  it('0 dòng, không có tin hoặc đã xóa: 404 LISTING_NOT_FOUND', async () => {
    const { service } = make(updated([]), []);
    await expectApp(service.hold(ID, dto), 404, 'LISTING_NOT_FOUND');
  });
});

describe('ListingHoldService.changeStatus (API_Spec §2.2)', () => {
  it('HELD → DEPOSITED: 1 truy vấn, nguồn [HELD], không xóa giữ chỗ', async () => {
    const { service, query } = make(updated([{ status: 'DEPOSITED' }]));
    await expect(
      service.changeStatus(ID, { depositId: DEP_A, status: 'DEPOSITED' }),
    ).resolves.toEqual({
      listingId: ID,
      status: 'DEPOSITED',
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([ID, DEP_A, 'DEPOSITED', ['HELD']]);
    expect(sql).toContain('held_by_deposit_id = $2');
    expect(sql).toContain('status = ANY($4::text[])');
    expect(sql).not.toContain('held_until = NULL');
  });

  it('đích AVAILABLE: nguồn [HELD, DEPOSITED] và xóa held_until, held_by_deposit_id', async () => {
    const { service, query } = make(updated([{ status: 'AVAILABLE' }]));
    await service.changeStatus(ID, { depositId: DEP_A, status: 'AVAILABLE' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect((params[3] as string[]).slice().sort()).toEqual(['DEPOSITED', 'HELD']);
    expect(sql).toContain('held_until = NULL, held_by_deposit_id = NULL');
  });

  it('đích RENTED: nguồn [DEPOSITED]', async () => {
    const { service, query } = make(updated([{ status: 'RENTED' }]));
    await service.changeStatus(ID, { depositId: DEP_A, status: 'RENTED' });
    expect((query.mock.calls[0] as [string, unknown[]])[1][3]).toEqual(['DEPOSITED']);
  });

  it('0 dòng, đã ở đích cùng đơn: 200 không đổi (test 10), 2 truy vấn', async () => {
    const { service, query } = make(updated([]), [
      { status: 'DEPOSITED', heldByDepositId: DEP_A, heldUntil: null },
    ]);
    await expect(
      service.changeStatus(ID, { depositId: DEP_A, status: 'DEPOSITED' }),
    ).resolves.toEqual({
      listingId: ID,
      status: 'DEPOSITED',
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('0 dòng, đích AVAILABLE mà tin đã AVAILABLE: 200 với mọi depositId', async () => {
    const { service } = make(updated([]), [
      { status: 'AVAILABLE', heldByDepositId: null, heldUntil: null },
    ]);
    await expect(
      service.changeStatus(ID, { depositId: DEP_B, status: 'AVAILABLE' }),
    ).resolves.toEqual({
      listingId: ID,
      status: 'AVAILABLE',
    });
  });

  it('0 dòng, tin thuộc đơn khác: 409 LISTING_INVALID_STATUS kèm details {current, target} (test 11)', async () => {
    const { service } = make(updated([]), [
      { status: 'HELD', heldByDepositId: DEP_B, heldUntil: new Date() },
    ]);
    const err = await expectApp(
      service.changeStatus(ID, { depositId: DEP_A, status: 'AVAILABLE' }),
      409,
      'LISTING_INVALID_STATUS',
    );
    expect(err.details).toEqual({ current: 'HELD', target: 'AVAILABLE' });
  });

  it('0 dòng, cặp ngoài bảng (AVAILABLE → DEPOSITED): 409 kèm details', async () => {
    const { service } = make(updated([]), [
      { status: 'AVAILABLE', heldByDepositId: null, heldUntil: null },
    ]);
    const err = await expectApp(
      service.changeStatus(ID, { depositId: DEP_A, status: 'DEPOSITED' }),
      409,
      'LISTING_INVALID_STATUS',
    );
    expect(err.details).toEqual({ current: 'AVAILABLE', target: 'DEPOSITED' });
  });

  it('0 dòng, không có tin hoặc đã xóa: 404 LISTING_NOT_FOUND', async () => {
    const { service } = make(updated([]), []);
    await expectApp(
      service.changeStatus(ID, { depositId: DEP_A, status: 'AVAILABLE' }),
      404,
      'LISTING_NOT_FOUND',
    );
  });
});
