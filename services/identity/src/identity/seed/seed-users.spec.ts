import { SEED_USERS } from './seed-users.data';
import { SEED_USER_PASSWORD_MIN_LENGTH, seedUsers, SeedUsersError } from './seed-users';

describe('SEED_USERS: dữ liệu seed', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it('có đúng 3 chủ trọ và 5 người thuê, không có ADMIN', () => {
    expect(SEED_USERS.filter((u) => u.role === 'LANDLORD')).toHaveLength(3);
    expect(SEED_USERS.filter((u) => u.role === 'TENANT')).toHaveLength(5);
    expect(SEED_USERS).toHaveLength(8);
  });

  it('id là UUID hợp lệ và duy nhất', () => {
    const ids = SEED_USERS.map((u) => u.id);
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('email hợp lệ, chữ thường, duy nhất', () => {
    const emails = SEED_USERS.map((u) => u.email);
    for (const email of emails) {
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(email).toBe(email.toLowerCase());
    }
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('id cố định đúng quy ước đã chốt (Postman, k6 và Docker guide §5 dựa vào đây)', () => {
    expect(SEED_USERS.filter((u) => u.role === 'LANDLORD').map((u) => u.id)).toEqual([
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000003',
    ]);
    expect(SEED_USERS.filter((u) => u.role === 'TENANT').map((u) => u.id)).toEqual([
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000003',
      'b0000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000005',
    ]);
  });

  it('họ tên dài 1 đến 200 ký tự', () => {
    for (const u of SEED_USERS) {
      expect(u.fullName.length).toBeGreaterThanOrEqual(1);
      expect(u.fullName.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('seedUsers: kiểm tra đầu vào (chưa chạm DB)', () => {
  // dataSource giả: nếu code chạm tới thì test thất bại
  const dataSource = {
    transaction: () => {
      throw new Error('không được chạm DB khi đầu vào sai');
    },
  };
  const hasher = { hash: async () => 'h' };
  const run = (password: string) => seedUsers(dataSource as never, { password }, hasher as never);

  it('mật khẩu tối thiểu là 12 ký tự', () => {
    expect(SEED_USER_PASSWORD_MIN_LENGTH).toBe(12);
  });

  it.each([
    ['rỗng', '', /ít nhất 12/],
    ['ngắn hơn 12', 'ngan-11-chu', /ít nhất 12/],
    ['quá dài', 'x'.repeat(129), /tối đa 128/],
  ])('mật khẩu %s -> SeedUsersError', async (_name, password, message) => {
    const promise = run(password);
    await expect(promise).rejects.toBeInstanceOf(SeedUsersError);
    await expect(promise).rejects.toThrow(message);
  });

  it('thông báo lỗi nhắc đúng tên biến SEED_USER_PASSWORD', async () => {
    await expect(run('ngan')).rejects.toThrow(/SEED_USER_PASSWORD/);
  });
});
