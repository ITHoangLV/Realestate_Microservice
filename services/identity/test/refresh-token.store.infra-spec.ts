import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  hashToken,
  RedisRefreshTokenStore,
} from '../src/identity/stores/redis-refresh-token.store';
import { readRootEnv } from './helpers/infra';

/**
 * RedisRefreshTokenStore với Redis THẬT (pnpm infra:up, rồi pnpm test:infra).
 * Dùng tiền tố key ngẫu nhiên và xóa sạch ở cuối, không đụng dữ liệu của service thật.
 */
describe('RedisRefreshTokenStore với Redis thật', () => {
  const prefix = `identity-test:${randomUUID().slice(0, 8)}:`;
  const TTL = 60;
  let redis: Redis;
  let store: RedisRefreshTokenStore;

  const newToken = () => randomUUID() + randomUUID();

  beforeAll(() => {
    const root = readRootEnv();
    redis = new Redis(
      `redis://:${encodeURIComponent(root.REDIS_PASSWORD as string)}@localhost:${root.REDIS_PORT ?? '6379'}`,
    );
    store = new RedisRefreshTokenStore(redis, TTL, prefix);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('create lưu HASH của token (không lưu token gốc) kèm TTL', async () => {
    const token = newToken();
    const userId = randomUUID();
    const familyId = randomUUID();
    await store.create(token, userId, familyId);

    const key = `${prefix}rt:${hashToken(token)}`;
    expect(await redis.hgetall(key)).toEqual({ userId, familyId, used: '0' });
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL);
    // Không có key nào chứa token gốc
    const all = await redis.keys(`${prefix}*`);
    expect(all.some((k) => k.includes(token))).toBe(false);
  });

  it('rotate thành công: trả userId/familyId, token cũ đánh dấu đã dùng, token mới dùng được tiếp', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const r1 = newToken();
    const r2 = newToken();
    const r3 = newToken();
    await store.create(r1, userId, familyId);

    expect(await store.rotate(r1, r2)).toEqual({ status: 'ok', userId, familyId });
    expect(await redis.hget(`${prefix}rt:${hashToken(r1)}`, 'used')).toBe('1');
    expect(await redis.hget(`${prefix}rt:${hashToken(r2)}`, 'familyId')).toBe(familyId);
    expect(await redis.ttl(`${prefix}rt:${hashToken(r2)}`)).toBeGreaterThan(0);

    expect(await store.rotate(r2, r3)).toEqual({ status: 'ok', userId, familyId });
  });

  it('dùng lại token đã dùng -> reuse, thu hồi cả họ (kể cả token mới nhất)', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const r1 = newToken();
    const r2 = newToken();
    await store.create(r1, userId, familyId);
    await store.rotate(r1, r2);

    expect(await store.rotate(r1, newToken())).toEqual({ status: 'reuse', userId, familyId });
    expect(await redis.exists(`${prefix}revoked:${familyId}`)).toBe(1);
    // r2 chưa từng dùng nhưng cùng họ nên cũng chết
    expect(await store.rotate(r2, newToken())).toEqual({ status: 'invalid' });
  });

  it('token không tồn tại -> invalid và không tạo key nào', async () => {
    const before = (await redis.keys(`${prefix}*`)).length;
    const fresh = newToken();
    expect(await store.rotate(newToken(), fresh)).toEqual({ status: 'invalid' });
    expect(await redis.exists(`${prefix}rt:${hashToken(fresh)}`)).toBe(0);
    expect((await redis.keys(`${prefix}*`)).length).toBe(before);
  });

  it('revokeFamilyOf: thu hồi cả họ; rotate sau đó -> invalid (không phải reuse); token lạ -> false', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const r1 = newToken();
    await store.create(r1, userId, familyId);

    expect(await store.revokeFamilyOf(r1)).toBe(true);
    expect(await store.rotate(r1, newToken())).toEqual({ status: 'invalid' });
    expect(await store.revokeFamilyOf(newToken())).toBe(false);
  });

  describe('revokeAllForUser', () => {
    const setKey = (userId: string) => `${prefix}user-families:${userId}`;

    it('create ghi họ vào set của user, set có TTL', async () => {
      const userId = randomUUID();
      const familyA = randomUUID();
      const familyB = randomUUID();
      await store.create(newToken(), userId, familyA);
      await store.create(newToken(), userId, familyB);

      expect((await redis.smembers(setKey(userId))).sort()).toEqual([familyA, familyB].sort());
      const ttl = await redis.ttl(setKey(userId));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(TTL);
    });

    it('thu hồi mọi họ của user, trả số họ; họ của user khác còn dùng được', async () => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const a1 = newToken();
      const b1 = newToken();
      const other1 = newToken();
      const familyA = randomUUID();
      const familyB = randomUUID();
      const otherFamily = randomUUID();
      await store.create(a1, userId, familyA);
      await store.create(b1, userId, familyB);
      await store.create(other1, otherUserId, otherFamily);

      expect(await store.revokeAllForUser(userId)).toBe(2);

      expect(await redis.exists(`${prefix}revoked:${familyA}`)).toBe(1);
      expect(await redis.exists(`${prefix}revoked:${familyB}`)).toBe(1);
      expect(await redis.exists(`${prefix}revoked:${otherFamily}`)).toBe(0);
      expect(await redis.exists(setKey(userId))).toBe(0);
      // phiên bị thu hồi: rotate -> invalid (không phải reuse); phiên user khác vẫn ok
      expect(await store.rotate(a1, newToken())).toEqual({ status: 'invalid' });
      expect(await store.rotate(b1, newToken())).toEqual({ status: 'invalid' });
      expect(await store.rotate(other1, newToken())).toEqual({
        status: 'ok',
        userId: otherUserId,
        familyId: otherFamily,
      });
    });

    it('họ đã xoay vòng nhiều lần vẫn bị thu hồi (token mới nhất cũng chết)', async () => {
      const userId = randomUUID();
      const familyId = randomUUID();
      const r1 = newToken();
      const r2 = newToken();
      await store.create(r1, userId, familyId);
      await store.rotate(r1, r2);

      expect(await store.revokeAllForUser(userId)).toBe(1);
      expect(await store.rotate(r2, newToken())).toEqual({ status: 'invalid' });
    });

    it('user chưa có họ nào -> 0 và không tạo key', async () => {
      const userId = randomUUID();
      expect(await store.revokeAllForUser(userId)).toBe(0);
      expect(await redis.exists(setKey(userId))).toBe(0);
    });

    it('gọi hai lần: lần hai trả 0', async () => {
      const userId = randomUUID();
      await store.create(newToken(), userId, randomUUID());
      expect(await store.revokeAllForUser(userId)).toBe(1);
      expect(await store.revokeAllForUser(userId)).toBe(0);
    });

    it('rotate gia hạn TTL của set (họ sống lâu hơn set thì vẫn thu hồi được)', async () => {
      const userId = randomUUID();
      const r1 = newToken();
      await store.create(r1, userId, randomUUID());
      await redis.expire(setKey(userId), 5); // giả lập set sắp hết hạn
      await store.rotate(r1, newToken());

      expect(await redis.ttl(setKey(userId))).toBeGreaterThan(5);
    });

    it('phiên cũ (tạo trước khi có set): chưa refresh thì 0; refresh rồi thì tự vào set và thu hồi được', async () => {
      const userId = randomUUID();
      const r1 = newToken();
      const r2 = newToken();
      const familyId = randomUUID();
      // giả lập phiên cũ: chỉ có token, không có set
      await redis.hset(`${prefix}rt:${hashToken(r1)}`, { userId, familyId, used: '0' });
      await redis.expire(`${prefix}rt:${hashToken(r1)}`, TTL);

      // chưa refresh: không có trong set nên không thu hồi được (hạn chế đã ghi ở thiết kế)
      expect(await store.revokeAllForUser(userId)).toBe(0);
      expect(await redis.exists(`${prefix}revoked:${familyId}`)).toBe(0);

      // refresh lần kế tiếp: họ tự vào set, TTL set được đặt
      expect(await store.rotate(r1, r2)).toMatchObject({ status: 'ok', familyId });
      expect(await redis.smembers(setKey(userId))).toEqual([familyId]);
      expect(await redis.ttl(setKey(userId))).toBeGreaterThan(0);

      // từ đó thu hồi được, token mới của họ chết
      expect(await store.revokeAllForUser(userId)).toBe(1);
      expect(await store.rotate(r2, newToken())).toEqual({ status: 'invalid' });
    });

    it('rotate token đã dùng (reuse) không thêm họ vào set', async () => {
      const userId = randomUUID();
      const r1 = newToken();
      const familyId = randomUUID();
      await redis.hset(`${prefix}rt:${hashToken(r1)}`, { userId, familyId, used: '1' });
      await redis.expire(`${prefix}rt:${hashToken(r1)}`, TTL);

      expect(await store.rotate(r1, newToken())).toMatchObject({ status: 'reuse' });
      expect(await redis.exists(setKey(userId))).toBe(0);
    });
  });

  it('hai refresh ĐỒNG THỜI cùng một token: đúng một cái thành công', async () => {
    const userId = randomUUID();
    const familyId = randomUUID();
    const r1 = newToken();
    await store.create(r1, userId, familyId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.rotate(r1, newToken())),
    );
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    // 9 cái còn lại bị coi là dùng lại
    expect(results.filter((r) => r.status === 'reuse')).toHaveLength(9);
  });
});
