import { QueryFailedError } from 'typeorm';
import { ProfileService } from './profile.service';
import { IdentityError } from '../errors/identity.errors';
import type { User } from '../entities/user.entity';

const ID = '11111111-1111-4111-8111-111111111111';
const ROW = {
  id: ID,
  email: 'an@example.com',
  fullName: 'Trần Thị Bình',
  role: 'TENANT',
  status: 'ACTIVE',
  phone: '0912345678',
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
} as User;

function setup(opts: { affected?: number; row?: User | null } = {}) {
  const users = {
    update: jest.fn().mockResolvedValue({ affected: opts.affected ?? 1 }),
    findOneBy: jest.fn().mockResolvedValue('row' in opts ? opts.row : ROW),
  };
  return { service: new ProfileService(users as never), users };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'khong-loi',
    (e: { code?: string }) => e.code,
  );

describe('ProfileService.update (route 15)', () => {
  it('chỉ ghi trường có mặt; trả UserDto mới', async () => {
    const { service, users } = setup();
    const result = await service.update(ID, { fullName: 'Trần Thị Bình' });

    expect(users.update).toHaveBeenCalledWith({ id: ID }, { fullName: 'Trần Thị Bình' });
    expect(result).toMatchObject({ id: ID, fullName: 'Trần Thị Bình', phone: '0912345678' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('phone: null xóa số', async () => {
    const { service, users } = setup({ row: { ...ROW, phone: null } as User });
    const result = await service.update(ID, { phone: null });
    expect(users.update).toHaveBeenCalledWith({ id: ID }, { phone: null });
    expect(result.phone).toBeNull();
  });

  it('vắng mặt thì giữ nguyên: phone không nằm trong UPDATE khi chỉ sửa fullName', async () => {
    const { service, users } = setup();
    await service.update(ID, { fullName: 'An' });
    expect(users.update.mock.calls[0][1]).not.toHaveProperty('phone');
  });

  it('body không có trường nào -> 400 VALIDATION_FAILED, không chạm DB', async () => {
    const { service, users } = setup();
    expect(await codeOf(service.update(ID, {}))).toBe('VALIDATION_FAILED');
    expect(users.update).not.toHaveBeenCalled();
  });

  it('test 23: phone trùng người khác (UQ_users_phone) -> 409 IDENTITY_PHONE_TAKEN', async () => {
    const { service, users } = setup();
    users.update.mockRejectedValueOnce(
      new QueryFailedError(
        'UPDATE',
        [],
        Object.assign(new Error('dup'), { code: '23505', constraint: 'UQ_users_phone' }),
      ),
    );
    expect(await codeOf(service.update(ID, { phone: '0912345678' }))).toBe(
      IdentityError.PHONE_TAKEN,
    );
  });

  it('lỗi DB khác -> ném nguyên', async () => {
    const { service, users } = setup();
    const boom = new QueryFailedError(
      'UPDATE',
      [],
      Object.assign(new Error('x'), { code: '08006' }),
    );
    users.update.mockRejectedValueOnce(boom);
    await expect(service.update(ID, { fullName: 'An' })).rejects.toBe(boom);
  });

  it('token còn hạn nhưng user đã bị xóa (UPDATE 0 dòng) -> 401 AUTH_TOKEN_INVALID, như /me', async () => {
    const { service } = setup({ affected: 0 });
    expect(await codeOf(service.update(ID, { fullName: 'An' }))).toBe('AUTH_TOKEN_INVALID');
  });
});
