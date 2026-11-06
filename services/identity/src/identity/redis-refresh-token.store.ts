import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { RefreshTokenStore, RotateResult } from './refresh-token.store';

/** SHA-256 dạng hex. Token ngẫu nhiên 256 bit nên không cần hash chậm như mật khẩu. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Đổi token cũ lấy token mới, chạy TRỌN VẸN bên trong Redis (một script Lua không bị lệnh nào chen giữa).
 * Nếu làm bằng nhiều lệnh từ Node, hai request refresh đồng thời cùng thấy "chưa dùng" và cùng thành công,
 * khiến một token cấp ra hai token con, mất khả năng phát hiện đánh cắp.
 *
 * KEYS[1] = key token cũ        KEYS[2] = key token mới
 * ARGV[1] = ttl (giây)          ARGV[2] = tiền tố key "revoked:" (ghép thêm familyId)
 *
 * Lưu ý: key `revoked:<familyId>` được ghép bên trong script nên KHÔNG chạy được trên Redis Cluster
 * (mọi key phải khai báo trước). Hạ tầng hiện tại là một instance Redis đơn.
 */
const ROTATE_LUA = `
local d = redis.call('HMGET', KEYS[1], 'userId', 'familyId', 'used')
if not d[1] then return {'invalid'} end
local revokedKey = ARGV[2] .. d[2]
if d[3] == '1' then
  redis.call('SET', revokedKey, '1', 'EX', ARGV[1])
  return {'reuse', d[1], d[2]}
end
if redis.call('EXISTS', revokedKey) == 1 then return {'invalid'} end
redis.call('HSET', KEYS[1], 'used', '1')
redis.call('HSET', KEYS[2], 'userId', d[1], 'familyId', d[2], 'used', '0')
redis.call('EXPIRE', KEYS[2], ARGV[1])
return {'ok', d[1], d[2]}
`;

/**
 * Lưu refresh token trong Redis (quyết định thiết kế: ưu tiên hết hạn tự động bằng TTL).
 *
 *   <prefix>rt:<sha256(token)>        hash { userId, familyId, used: '0'|'1' }   TTL = ttlSeconds
 *   <prefix>revoked:<familyId>        '1' khi cả họ bị thu hồi                    TTL = ttlSeconds
 *
 * Token đã dùng KHÔNG bị xóa mà chỉ đánh dấu used=1 (giữ đến khi hết hạn), để khi nó bị gửi lại
 * còn nhận ra là "dùng lại" thay vì "không tồn tại".
 */
export class RedisRefreshTokenStore implements RefreshTokenStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
    private readonly prefix: string,
  ) {
    this.redis.defineCommand('identityRotateRefreshToken', { numberOfKeys: 2, lua: ROTATE_LUA });
  }

  private tokenKey(token: string): string {
    return `${this.prefix}rt:${hashToken(token)}`;
  }

  async create(token: string, userId: string, familyId: string): Promise<void> {
    const key = this.tokenKey(token);
    // multi: ghi dữ liệu và đặt TTL cùng lúc, không để lại key không có hạn nếu sập giữa chừng
    await this.redis
      .multi()
      .hset(key, { userId, familyId, used: '0' })
      .expire(key, this.ttlSeconds)
      .exec();
  }

  async rotate(oldToken: string, newToken: string): Promise<RotateResult> {
    const run = (
      this.redis as unknown as {
        identityRotateRefreshToken(...args: Array<string | number>): Promise<string[]>;
      }
    ).identityRotateRefreshToken;
    const [status, userId, familyId] = await run.call(
      this.redis,
      this.tokenKey(oldToken),
      this.tokenKey(newToken),
      this.ttlSeconds,
      `${this.prefix}revoked:`,
    );
    if (status === 'ok') return { status, userId, familyId };
    if (status === 'reuse') return { status, userId, familyId };
    return { status: 'invalid' };
  }

  async revokeFamilyOf(token: string): Promise<boolean> {
    const familyId = await this.redis.hget(this.tokenKey(token), 'familyId');
    if (!familyId) return false;
    await this.redis.set(`${this.prefix}revoked:${familyId}`, '1', 'EX', this.ttlSeconds);
    return true;
  }
}
