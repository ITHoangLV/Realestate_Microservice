import { EmailVerificationService } from './email-verification.service';
import { IdentityError } from '../errors/identity.errors';
import type { OtpAttempt, OtpStore } from '../stores/otp.store';
import { hashToken } from '../stores/redis-refresh-token.store';
import type { User } from '../entities/user.entity';

/** Store giả trong bộ nhớ, cùng luật với Lua của RedisOtpStore (script thật test ở otp.store.infra-spec.ts). */
class FakeOtpStore implements OtpStore {
  otps = new Map<string, { hash: string; attempts: number; ttl: number }>();
  cooldowns = new Set<string>();
  lastCooldown = 0;
  fail = false;
  down = false;

  async assertReady(): Promise<void> {
    if (this.down) throw new Error('redis not ready');
  }

  async save(userId: string, hash: string, ttl: number, cooldown: number): Promise<void> {
    if (this.fail) throw new Error('redis down');
    this.otps.set(userId, { hash, attempts: 0, ttl });
    this.lastCooldown = cooldown;
    if (cooldown > 0) this.cooldowns.add(userId);
  }

  async tryStartCooldown(userId: string): Promise<boolean> {
    if (this.cooldowns.has(userId)) return false;
    this.cooldowns.add(userId);
    return true;
  }

  async attempt(userId: string, max: number): Promise<OtpAttempt> {
    const o = this.otps.get(userId);
    if (!o) return { status: 'none' };
    o.attempts += 1;
    if (o.attempts > max) {
      this.otps.delete(userId);
      return { status: 'none' };
    }
    return { status: 'pending', hash: o.hash, attempts: o.attempts };
  }

  async remove(userId: string): Promise<void> {
    this.otps.delete(userId);
  }
}

const PENDING = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'an@example.com',
  role: 'TENANT',
  status: 'PENDING_VERIFICATION',
} as User;

const CONFIG = { otpTtlSeconds: 300, otpMaxAttempts: 5, otpResendCooldownSeconds: 60 };

function setup(user: User | null = PENDING, affected = 1) {
  const store = new FakeOtpStore();
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue({ affected }),
  };
  const mail = { sendOtp: jest.fn() };
  const service = new EmailVerificationService(users as never, store, mail as never, CONFIG);
  /** Mã vừa được gửi. */
  const sentOtp = (): string => mail.sendOtp.mock.calls.at(-1)?.[1] as string;
  return { service, store, users, mail, sentOtp };
}

describe('EmailVerificationService.ensureAvailable', () => {
  it('chuyển cho store: Redis sẵn sàng thì xong, không sẵn sàng thì ném lỗi', async () => {
    const { service, store } = setup();
    await expect(service.ensureAvailable()).resolves.toBeUndefined();
    store.down = true;
    await expect(service.ensureAvailable()).rejects.toThrow('redis not ready');
  });
});

describe('EmailVerificationService.issue', () => {
  it('sinh OTP 6 chữ số, lưu BĂM kèm userId (không lưu mã thật), gửi mail đúng mã', async () => {
    const { service, store, mail, sentOtp } = setup();
    await service.issue(PENDING.id, PENDING.email);

    expect(sentOtp()).toMatch(/^\d{6}$/);
    expect(mail.sendOtp).toHaveBeenCalledWith(PENDING.email, sentOtp());
    const saved = store.otps.get(PENDING.id)!;
    expect(saved.hash).toBe(hashToken(`${PENDING.id}:${sentOtp()}`));
    expect(saved.hash).not.toContain(sentOtp());
    expect(saved.ttl).toBe(300);
    expect(store.lastCooldown).toBe(60);
  });

  it('Redis lỗi: ném lỗi và KHÔNG gửi mail (không gửi mã không ai kiểm được)', async () => {
    const { service, store, mail } = setup();
    store.fail = true;
    await expect(service.issue(PENDING.id, PENDING.email)).rejects.toThrow('redis down');
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });
});

describe('EmailVerificationService.verify', () => {
  it('OTP đúng: ACTIVE bằng một UPDATE có điều kiện trạng thái, xóa OTP, trả user', async () => {
    const { service, store, users, sentOtp } = setup();
    await service.issue(PENDING.id, PENDING.email);

    const user = await service.verify(PENDING.email, sentOtp());

    expect(user).toMatchObject({ id: PENDING.id, role: 'TENANT', status: 'ACTIVE' });
    expect(store.otps.has(PENDING.id)).toBe(false);
    expect(users.update).toHaveBeenCalledTimes(1);
    const [where, set] = users.update.mock.calls[0];
    expect(where).toEqual({ id: PENDING.id, status: 'PENDING_VERIFICATION' });
    expect(set.status).toBe('ACTIVE');
    expect(typeof set.emailVerifiedAt).toBe('function'); // now() của DB
  });

  it('OTP sai: IDENTITY_OTP_INVALID, mã đúng vẫn dùng được khi chưa quá số lần', async () => {
    const { service, sentOtp } = setup();
    await service.issue(PENDING.id, PENDING.email);
    const wrong = sentOtp() === '000000' ? '111111' : '000000';

    await expect(service.verify(PENDING.email, wrong)).rejects.toMatchObject({
      code: IdentityError.OTP_INVALID,
      status: 400,
    });
    await expect(service.verify(PENDING.email, sentOtp())).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('test 16: sai 5 lần thì lần 5 xóa mã; mã đúng sau đó vẫn 400', async () => {
    const { service, store, users, sentOtp } = setup();
    await service.issue(PENDING.id, PENDING.email);
    const wrong = sentOtp() === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await expect(service.verify(PENDING.email, wrong)).rejects.toMatchObject({
        code: IdentityError.OTP_INVALID,
      });
    }
    expect(store.otps.has(PENDING.id)).toBe(false);
    await expect(service.verify(PENDING.email, sentOtp())).rejects.toMatchObject({
      code: IdentityError.OTP_INVALID,
    });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('không có tài khoản, hoặc không còn chờ xác minh: cùng IDENTITY_OTP_INVALID, không chạm Redis hay UPDATE', async () => {
    const cases = [
      null,
      { ...PENDING, status: 'ACTIVE' } as User,
      { ...PENDING, status: 'LOCKED' } as User,
    ];
    for (const user of cases) {
      const { service, users, store } = setup(user);
      store.otps.set(PENDING.id, { hash: 'x', attempts: 0, ttl: 1 });
      await expect(service.verify(PENDING.email, '123456')).rejects.toMatchObject({
        code: IdentityError.OTP_INVALID,
      });
      expect(users.update).not.toHaveBeenCalled();
      expect(store.otps.get(PENDING.id)!.attempts).toBe(0);
    }
  });

  it('UPDATE không đổi dòng nào (đã bị xác minh song song): IDENTITY_OTP_INVALID', async () => {
    const { service, sentOtp } = setup(PENDING, 0);
    await service.issue(PENDING.id, PENDING.email);
    await expect(service.verify(PENDING.email, sentOtp())).rejects.toMatchObject({
      code: IdentityError.OTP_INVALID,
    });
  });

  it('mã sai độ dài vẫn trả OTP_INVALID, không ném lỗi so sánh', async () => {
    const { service } = setup();
    await service.issue(PENDING.id, PENDING.email);
    await expect(service.verify(PENDING.email, '1')).rejects.toMatchObject({
      code: IdentityError.OTP_INVALID,
    });
  });
});

describe('EmailVerificationService.resend', () => {
  it('email không tồn tại hoặc đã xác minh: im lặng, không gửi (không lộ email)', async () => {
    for (const user of [null, { ...PENDING, status: 'ACTIVE' } as User]) {
      const { service, mail, store } = setup(user);
      await expect(service.resend(PENDING.email)).resolves.toBeUndefined();
      expect(mail.sendOtp).not.toHaveBeenCalled();
      expect(store.otps.size).toBe(0);
    }
  });

  it('test 17: còn trong thời gian chờ thì 429 IDENTITY_OTP_RESEND_TOO_SOON', async () => {
    const { service, store, mail } = setup();
    await service.issue(PENDING.id, PENDING.email); // đăng ký đã bắt đầu thời gian chờ
    mail.sendOtp.mockClear();
    expect(store.cooldowns.has(PENDING.id)).toBe(true);

    await expect(service.resend(PENDING.email)).rejects.toMatchObject({
      code: IdentityError.OTP_RESEND_TOO_SOON,
      status: 429,
    });
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('hết thời gian chờ: sinh OTP mới thay mã cũ (đặt lại số lần sai) và gửi', async () => {
    const { service, store, mail, sentOtp } = setup();
    await service.issue(PENDING.id, PENDING.email);
    store.otps.get(PENDING.id)!.attempts = 3;
    store.cooldowns.clear(); // coi như đã qua 60 giây

    await service.resend(PENDING.email);

    expect(mail.sendOtp).toHaveBeenCalledTimes(2);
    expect(store.otps.get(PENDING.id)!.attempts).toBe(0);
    expect(store.otps.get(PENDING.id)!.hash).toBe(hashToken(`${PENDING.id}:${sentOtp()}`));
  });
});
