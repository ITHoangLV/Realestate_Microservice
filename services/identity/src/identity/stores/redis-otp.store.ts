import type Redis from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { OtpAttempt, OtpStore } from './otp.store';

/**
 * Một lần thử OTP, nguyên tử trong Redis.
 *
 * KEYS[1] = key OTP (hash {otpHash, attempts})   ARGV[1] = số lần tối đa
 * Không có OTP thì KHÔNG được `HINCRBY` (sẽ tạo hash chỉ có `attempts`, không TTL, không bao giờ hết).
 * Tăng số lần rồi mới trả hash: kể cả 20 request song song, chỉ đúng `max` request đầu thấy hash.
 */
const ATTEMPT_LUA = `
local hash = redis.call('HGET', KEYS[1], 'otpHash')
if not hash then return {0} end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts > tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return {0}
end
return {attempts, hash}
`;

/**
 * OTP trong Redis (`Component_Class_Design §3`):
 *
 *   <prefix>otp:<userId>           hash { otpHash, attempts }   TTL = OTP_TTL_SECONDS
 *   <prefix>otp-cooldown:<userId>  '1'                          TTL = OTP_RESEND_COOLDOWN_SECONDS
 */
export class RedisOtpStore implements OtpStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {
    this.redis.defineCommand('identityOtpAttempt', { numberOfKeys: 1, lua: ATTEMPT_LUA });
  }

  private otpKey(userId: string): string {
    return `${this.prefix}otp:${userId}`;
  }

  private cooldownKey(userId: string): string {
    return `${this.prefix}otp-cooldown:${userId}`;
  }

  async assertReady(): Promise<void> {
    // Client chưa `ready` (đang kết nối lại) thì lệnh nằm trong hàng đợi chờ rất lâu: báo 503 ngay
    let ok = this.redis.status === 'ready';
    if (ok) {
      try {
        ok = (await this.redis.ping()) === 'PONG';
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      throw new AppException(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        'Hệ thống phụ thuộc tạm thời không khả dụng, vui lòng thử lại sau',
        503,
      );
    }
  }

  async save(
    userId: string,
    otpHash: string,
    ttlSeconds: number,
    cooldownSeconds: number,
  ): Promise<void> {
    const key = this.otpKey(userId);
    // multi: ghi và đặt TTL cùng lúc, không để lại key không có hạn nếu sập giữa chừng
    const tx = this.redis
      .multi()
      .del(key)
      .hset(key, { otpHash, attempts: '0' })
      .expire(key, ttlSeconds);
    if (cooldownSeconds > 0) tx.set(this.cooldownKey(userId), '1', 'EX', cooldownSeconds);
    await tx.exec();
  }

  async tryStartCooldown(userId: string, cooldownSeconds: number): Promise<boolean> {
    if (cooldownSeconds <= 0) return true;
    return (
      (await this.redis.set(this.cooldownKey(userId), '1', 'EX', cooldownSeconds, 'NX')) === 'OK'
    );
  }

  async attempt(userId: string, maxAttempts: number): Promise<OtpAttempt> {
    const run = (
      this.redis as unknown as {
        identityOtpAttempt(...args: Array<string | number>): Promise<Array<string | number>>;
      }
    ).identityOtpAttempt;
    const [attempts, hash] = await run.call(this.redis, this.otpKey(userId), maxAttempts);
    if (!hash) return { status: 'none' };
    return { status: 'pending', hash: String(hash), attempts: Number(attempts) };
  }

  async remove(userId: string): Promise<void> {
    await this.redis.del(this.otpKey(userId));
  }
}
