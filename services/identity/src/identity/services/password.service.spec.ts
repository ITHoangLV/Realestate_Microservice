import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hash ra chuỗi argon2id có tham số và không chứa mật khẩu gốc', async () => {
    const h = await service.hash('Mat-khau-1234');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(h).not.toContain('Mat-khau-1234');
  });

  it('verify đúng mật khẩu -> true, sai -> false', async () => {
    const h = await service.hash('Mat-khau-1234');
    await expect(service.verify(h, 'Mat-khau-1234')).resolves.toBe(true);
    await expect(service.verify(h, 'mat-khau-1234')).resolves.toBe(false);
    await expect(service.verify(h, '')).resolves.toBe(false);
  });

  it('cùng mật khẩu hash hai lần ra hai chuỗi khác nhau (salt ngẫu nhiên) nhưng đều verify được', async () => {
    const a = await service.hash('Mat-khau-1234');
    const b = await service.hash('Mat-khau-1234');
    expect(a).not.toBe(b);
    await expect(service.verify(a, 'Mat-khau-1234')).resolves.toBe(true);
    await expect(service.verify(b, 'Mat-khau-1234')).resolves.toBe(true);
  });

  it('hash hỏng -> false, không ném lỗi', async () => {
    await expect(service.verify('khong-phai-hash', 'x')).resolves.toBe(false);
    await expect(service.verify('', 'x')).resolves.toBe(false);
  });

  it('hỗ trợ mật khẩu có tiếng Việt và rất dài', async () => {
    const pw = 'Mật khẩu có dấu ' + 'x'.repeat(500);
    const h = await service.hash(pw);
    await expect(service.verify(h, pw)).resolves.toBe(true);
  });

  it('verifyDummy chạy được và không ném lỗi', async () => {
    await expect(service.verifyDummy('bất kỳ')).resolves.toBeUndefined();
  });
});
