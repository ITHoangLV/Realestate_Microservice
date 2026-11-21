import { Not } from 'typeorm';
import { UserAdminService } from './user-admin.service';
import { IdentityError } from '../errors/identity.errors';
import type { User } from '../entities/user.entity';

const ADMIN = '99999999-9999-4999-8999-999999999999';
const TARGET = '11111111-1111-4111-8111-111111111111';
const ROW = {
  id: TARGET,
  email: 'an@example.com',
  fullName: 'An',
  role: 'TENANT',
  status: 'LOCKED',
  phone: null,
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
} as User;

function setup(opts: { affected?: number; row?: User | null } = {}) {
  const users = {
    update: jest.fn().mockResolvedValue({ affected: opts.affected ?? 1 }),
    findOneBy: jest.fn().mockResolvedValue('row' in opts ? opts.row : ROW),
  };
  const refreshTokens = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
  const service = new UserAdminService(users as never, refreshTokens as never);
  return { service, users, refreshTokens };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'khong-loi',
    (e: { code?: string }) => e.code,
  );

describe('UserAdminService.lock (test 22)', () => {
  it('một UPDATE có điều kiện status <> LOCKED ghi LOCKED, locked_by, lý do; rồi thu hồi MỌI phiên', async () => {
    const { service, users, refreshTokens } = setup();
    const result = await service.lock(ADMIN, TARGET, 'Nghi ngờ lừa đảo');

    expect(users.update).toHaveBeenCalledTimes(1);
    const [where, set] = users.update.mock.calls[0];
    expect(where).toEqual({ id: TARGET, status: Not('LOCKED') });
    expect(set).toMatchObject({
      status: 'LOCKED',
      lockedBy: ADMIN,
      lockReason: 'Nghi ngờ lừa đảo',
    });
    expect(typeof set.lockedAt).toBe('function'); // now() của DB
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(TARGET);
    expect(result).toMatchObject({ id: TARGET, status: 'LOCKED' });
  });

  it('trạng thái LOCKED được commit TRƯỚC khi thu hồi phiên (chặn đăng nhập mới trước)', async () => {
    const { service, users, refreshTokens } = setup();
    await service.lock(ADMIN, TARGET, 'x');
    expect(users.update.mock.invocationCallOrder[0]).toBeLessThan(
      refreshTokens.revokeAllForUser.mock.invocationCallOrder[0],
    );
  });

  it('khóa lần hai (UPDATE 0 dòng vì đã LOCKED): vẫn thu hồi phiên và trả 200 (idempotent), giữ lý do cũ', async () => {
    const { service, refreshTokens } = setup({ affected: 0 });
    await expect(service.lock(ADMIN, TARGET, 'lý do mới')).resolves.toMatchObject({
      status: 'LOCKED',
    });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(TARGET);
  });

  it('người dùng không tồn tại -> 404 IDENTITY_USER_NOT_FOUND, không thu hồi gì', async () => {
    const { service, refreshTokens } = setup({ affected: 0, row: null });
    expect(await codeOf(service.lock(ADMIN, TARGET, 'x'))).toBe(IdentityError.USER_NOT_FOUND);
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('khóa chính mình -> 409 IDENTITY_CANNOT_LOCK_SELF, không chạm DB hay Redis', async () => {
    const { service, users, refreshTokens } = setup();
    expect(await codeOf(service.lock(ADMIN, ADMIN, 'x'))).toBe(IdentityError.CANNOT_LOCK_SELF);
    expect(users.update).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('Redis lỗi khi thu hồi -> lỗi ném ra (503), nhưng UPDATE LOCKED đã chạy; gọi lại khóa sẽ thu hồi tiếp', async () => {
    const { service, users, refreshTokens } = setup();
    const down = Object.assign(new Error('redis down'), { code: 'ECONNREFUSED' });
    refreshTokens.revokeAllForUser.mockRejectedValueOnce(down);
    await expect(service.lock(ADMIN, TARGET, 'x')).rejects.toBe(down);
    expect(users.update).toHaveBeenCalledTimes(1);

    refreshTokens.revokeAllForUser.mockResolvedValueOnce(1);
    await expect(service.lock(ADMIN, TARGET, 'x')).resolves.toBeDefined();
  });

  it('có thể khóa một ADMIN khác (thiết kế chỉ cấm tự khóa)', async () => {
    const { service } = setup({ row: { ...ROW, role: 'ADMIN' } as User });
    await expect(service.lock(ADMIN, TARGET, 'x')).resolves.toMatchObject({ role: 'ADMIN' });
  });
});

describe('UserAdminService.unlock (test 22a)', () => {
  it('một UPDATE có điều kiện status = LOCKED: về ACTIVE nếu email đã xác minh, ngược lại PENDING_VERIFICATION; xóa locked_*', async () => {
    const { service, users } = setup({ row: { ...ROW, status: 'ACTIVE' } as User });
    const result = await service.unlock(TARGET);

    expect(users.update).toHaveBeenCalledTimes(1);
    const [where, set] = users.update.mock.calls[0];
    expect(where).toEqual({ id: TARGET, status: 'LOCKED' });
    expect(set).toMatchObject({ lockedAt: null, lockedBy: null, lockReason: null });
    expect(typeof set.status).toBe('function');
    const sql = (set.status as () => string)();
    expect(sql).toContain('email_verified_at IS NOT NULL');
    expect(sql).toContain("'ACTIVE'");
    expect(sql).toContain("'PENDING_VERIFICATION'");
    expect(result.status).toBe('ACTIVE');
  });

  it('không tồn tại -> 404 IDENTITY_USER_NOT_FOUND', async () => {
    const { service } = setup({ affected: 0, row: null });
    expect(await codeOf(service.unlock(TARGET))).toBe(IdentityError.USER_NOT_FOUND);
  });

  it('tài khoản không bị khóa (UPDATE 0 dòng): 200, không đổi gì', async () => {
    const { service } = setup({ affected: 0, row: { ...ROW, status: 'ACTIVE' } as User });
    await expect(service.unlock(TARGET)).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('mở khóa KHÔNG đụng phiên đăng nhập (người dùng đăng nhập lại như thường)', async () => {
    const { service, refreshTokens } = setup({ row: { ...ROW, status: 'ACTIVE' } as User });
    await service.unlock(TARGET);
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});
