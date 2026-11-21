import { PasswordResetService } from './password-reset.service';
import { IdentityError } from '../errors/identity.errors';
import { hashToken } from '../stores/redis-refresh-token.store';
import type { User } from '../entities/user.entity';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'an@example.com',
  status: 'ACTIVE',
} as User;

const CONFIG = { ttlSeconds: 900, resetUrl: 'http://localhost:3000/reset-password' };
const PREFIX = 'identity:';

/** Redis giả: chỉ `set ... EX` và `getdel` (GETDEL thật là nguyên tử, test ở password-reset.infra-spec.ts). */
class FakeRedis {
  data = new Map<string, { value: string; ttl: number }>();
  fail = false;
  async set(key: string, value: string, mode: 'EX', ttl: number): Promise<'OK'> {
    if (this.fail) throw new Error('redis down');
    expect(mode).toBe('EX');
    this.data.set(key, { value, ttl });
    return 'OK';
  }
  async getdel(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    this.data.delete(key);
    return entry?.value ?? null;
  }
}

function setup(user: User | null = USER, affected = 1) {
  const redis = new FakeRedis();
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue({ affected }),
  };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-moi') };
  const refreshTokens = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
  const mail = { sendPasswordReset: jest.fn() };
  const service = new PasswordResetService(
    users as never,
    redis as never,
    PREFIX,
    passwords as never,
    refreshTokens as never,
    mail as never,
    CONFIG,
  );
  /** Token trong link của thư vừa gửi. */
  const sentToken = (): string => {
    const link = mail.sendPasswordReset.mock.calls.at(-1)?.[1] as string;
    return new URL(link).searchParams.get('token') as string;
  };
  return { service, redis, users, passwords, refreshTokens, mail, sentToken };
}

describe('PasswordResetService.request', () => {
  it('có tài khoản: lưu SHA-256 của token -> userId với TTL, gửi link PASSWORD_RESET_URL?token=...', async () => {
    const { service, redis, mail, sentToken } = setup();
    await service.request('an@example.com');

    const token = sentToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 byte base64url
    const stored = redis.data.get(`${PREFIX}pwreset:${hashToken(token)}`);
    expect(stored).toEqual({ value: USER.id, ttl: 900 });
    expect([...redis.data.keys()].join()).not.toContain(token);
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      'an@example.com',
      `http://localhost:3000/reset-password?token=${token}`,
    );
  });

  it('mỗi lần yêu cầu ra một token khác', async () => {
    const { service, sentToken } = setup();
    await service.request('an@example.com');
    const first = sentToken();
    await service.request('an@example.com');
    expect(sentToken()).not.toBe(first);
  });

  it('PASSWORD_RESET_URL đã có query thì giữ nguyên và thêm token', async () => {
    const redis = new FakeRedis();
    const mail = { sendPasswordReset: jest.fn() };
    const service = new PasswordResetService(
      { findOne: jest.fn().mockResolvedValue(USER) } as never,
      redis as never,
      PREFIX,
      {} as never,
      {} as never,
      mail as never,
      { ttlSeconds: 900, resetUrl: 'https://app.example.com/reset?lang=vi' },
    );
    await service.request('an@example.com');
    const url = new URL(mail.sendPasswordReset.mock.calls[0][1] as string);
    expect(url.searchParams.get('lang')).toBe('vi');
    expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('test 18: email không tồn tại -> xong êm, KHÔNG token, KHÔNG thư', async () => {
    const { service, redis, mail } = setup(null);
    await expect(service.request('khong-co@example.com')).resolves.toBeUndefined();
    expect(redis.data.size).toBe(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('tài khoản bị khóa -> xong êm, KHÔNG token, KHÔNG thư', async () => {
    const { service, redis, mail } = setup({ ...USER, status: 'LOCKED' } as User);
    await expect(service.request('an@example.com')).resolves.toBeUndefined();
    expect(redis.data.size).toBe(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('tài khoản chưa xác minh vẫn được đặt lại mật khẩu (chủ email chứng minh bằng thư)', async () => {
    const { service, mail } = setup({ ...USER, status: 'PENDING_VERIFICATION' } as User);
    await service.request('an@example.com');
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('Redis lỗi: ném lỗi và KHÔNG gửi thư chứa token không ai dùng được', async () => {
    const { service, redis, mail } = setup();
    redis.fail = true;
    await expect(service.request('an@example.com')).rejects.toThrow('redis down');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService.reset', () => {
  it('test 19: token hợp lệ -> UPDATE password_hash, thu hồi MỌI phiên, token chỉ dùng một lần', async () => {
    const { service, users, passwords, refreshTokens, sentToken } = setup();
    await service.request('an@example.com');
    const token = sentToken();

    await expect(service.reset(token, 'Mat-khau-moi-1')).resolves.toBeUndefined();

    expect(passwords.hash).toHaveBeenCalledWith('Mat-khau-moi-1');
    expect(users.update).toHaveBeenCalledWith({ id: USER.id }, { passwordHash: 'hash-moi' });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER.id);

    await expect(service.reset(token, 'Mat-khau-khac-2')).rejects.toMatchObject({
      code: IdentityError.RESET_TOKEN_INVALID,
      status: 400,
    });
    expect(users.update).toHaveBeenCalledTimes(1);
  });

  it('token lạ -> 400 IDENTITY_RESET_TOKEN_INVALID, không băm mật khẩu, không đổi gì', async () => {
    const { service, users, passwords, refreshTokens } = setup();
    await expect(service.reset('token-la', 'Mat-khau-moi-1')).rejects.toMatchObject({
      code: IdentityError.RESET_TOKEN_INVALID,
    });
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('user đã bị xóa sau khi cấp token (UPDATE 0 dòng) -> cùng lỗi, không thu hồi phiên', async () => {
    const { service, refreshTokens, sentToken } = setup(USER, 0);
    await service.request('an@example.com');
    await expect(service.reset(sentToken(), 'Mat-khau-moi-1')).rejects.toMatchObject({
      code: IdentityError.RESET_TOKEN_INVALID,
    });
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('thu hồi phiên chạy SAU khi mật khẩu đã đổi', async () => {
    const { service, users, refreshTokens, sentToken } = setup();
    await service.request('an@example.com');
    await service.reset(sentToken(), 'Mat-khau-moi-1');
    expect(users.update.mock.invocationCallOrder[0]).toBeLessThan(
      refreshTokens.revokeAllForUser.mock.invocationCallOrder[0],
    );
  });
});
