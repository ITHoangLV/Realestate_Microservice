import { seedAdmin, SeedAdminError } from './seed-admin';

describe('seedAdmin: kiểm tra đầu vào (chưa chạm DB)', () => {
  // dataSource giả: nếu code chạm tới thì test thất bại
  const dataSource = {
    transaction: () => {
      throw new Error('không được chạm DB khi đầu vào sai');
    },
  };
  const run = (input: { email: string; password: string; fullName?: string }) =>
    seedAdmin(dataSource as never, input, { hash: async () => 'h' } as never);

  it.each([
    ['email sai', { email: 'khong-phai-email', password: 'mat-khau-rat-dai-1' }, /email hợp lệ/],
    ['mật khẩu ngắn hơn 12', { email: 'a@x.com', password: 'ngan-11-chu' }, /ít nhất 12/],
    ['mật khẩu quá dài', { email: 'a@x.com', password: 'x'.repeat(129) }, /tối đa 128/],
    [
      'tên rỗng',
      { email: 'a@x.com', password: 'mat-khau-rat-dai-1', fullName: '   ' },
      /SEED_ADMIN_NAME/,
    ],
  ])('%s -> SeedAdminError', async (_name, input, message) => {
    const promise = run(input);
    await expect(promise).rejects.toBeInstanceOf(SeedAdminError);
    await expect(promise).rejects.toThrow(message);
  });
});
