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
