import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { RedisOtpStore } from '../src/identity/stores/redis-otp.store';
import { readRootEnv } from './helpers/infra';

/**
 * RedisOtpStore với Redis THẬT (`pnpm infra:up`, rồi `pnpm test:infra`): script Lua đếm lần thử,
 * TTL, thời gian chờ gửi lại. Tiền tố key ngẫu nhiên, xóa sạch ở cuối.
 */
describe('RedisOtpStore với Redis thật', () => {
  const prefix = `identity-test:${randomUUID().slice(0, 8)}:`;
  let redis: Redis;
  let store: RedisOtpStore;
  const newUser = () => randomUUID();

  beforeAll(() => {
    const root = readRootEnv();
    redis = new Redis(
      `redis://:${encodeURIComponent(root.REDIS_PASSWORD as string)}@localhost:${root.REDIS_PORT ?? '6379'}`,
    );
    store = new RedisOtpStore(redis, prefix);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('save: lưu hash (hash Redis {otpHash, attempts=0}), có TTL, bắt đầu thời gian chờ', async () => {
    const userId = newUser();
    await store.save(userId, 'hash-1', 300, 60);

    expect(await redis.hgetall(`${prefix}otp:${userId}`)).toEqual({
      otpHash: 'hash-1',
      attempts: '0',
    });
    expect(await redis.ttl(`${prefix}otp:${userId}`)).toBeGreaterThan(290);
    expect(await redis.ttl(`${prefix}otp-cooldown:${userId}`)).toBeGreaterThan(50);
  });

  it('save lần hai thay mã cũ và đặt lại số lần sai', async () => {
    const userId = newUser();
    await store.save(userId, 'hash-cu', 300, 60);
    await store.attempt(userId, 5);
    await store.attempt(userId, 5);

    await store.save(userId, 'hash-moi', 300, 60);

    expect(await redis.hgetall(`${prefix}otp:${userId}`)).toEqual({
      otpHash: 'hash-moi',
      attempts: '0',
    });
  });

  it('attempt: trả hash và số lần thử tính cả lần này', async () => {
    const userId = newUser();
    await store.save(userId, 'h', 300, 60);

    expect(await store.attempt(userId, 5)).toEqual({ status: 'pending', hash: 'h', attempts: 1 });
    expect(await store.attempt(userId, 5)).toEqual({ status: 'pending', hash: 'h', attempts: 2 });
  });

  it('attempt khi không có OTP: none, và KHÔNG tạo key mới không có TTL', async () => {
    const userId = newUser();
    expect(await store.attempt(userId, 5)).toEqual({ status: 'none' });
    expect(await redis.exists(`${prefix}otp:${userId}`)).toBe(0);
  });

  it('quá số lần tối đa: lần thứ max+1 xóa OTP và trả none', async () => {
    const userId = newUser();
    await store.save(userId, 'h', 300, 60);
    for (let i = 1; i <= 5; i += 1) {
      expect(await store.attempt(userId, 5)).toMatchObject({ status: 'pending', attempts: i });
    }
    expect(await store.attempt(userId, 5)).toEqual({ status: 'none' });
    expect(await redis.exists(`${prefix}otp:${userId}`)).toBe(0);
  });

  it('20 lần thử SONG SONG chỉ có đúng max lần được thấy hash (không né được giới hạn)', async () => {
    const userId = newUser();
    await store.save(userId, 'h', 300, 60);

    const results = await Promise.all(Array.from({ length: 20 }, () => store.attempt(userId, 5)));

    expect(results.filter((r) => r.status === 'pending')).toHaveLength(5);
    const seen = results
      .filter(
        (r): r is { status: 'pending'; hash: string; attempts: number } => r.status === 'pending',
      )
      .map((r) => r.attempts)
      .sort();
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('remove xóa OTP; attempt sau đó là none', async () => {
    const userId = newUser();
    await store.save(userId, 'h', 300, 60);
    await store.remove(userId);
    expect(await store.attempt(userId, 5)).toEqual({ status: 'none' });
  });

  it('tryStartCooldown: lần đầu true, lần hai false; hết hạn thì true lại', async () => {
    const userId = newUser();
    expect(await store.tryStartCooldown(userId, 1)).toBe(true);
    expect(await store.tryStartCooldown(userId, 1)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await store.tryStartCooldown(userId, 1)).toBe(true);
  });

  it('tryStartCooldown đồng thời: đúng một bên thắng', async () => {
    const userId = newUser();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.tryStartCooldown(userId, 60)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('cooldown 0 giây: không đặt key chờ, tryStartCooldown luôn true', async () => {
    const userId = newUser();
    await store.save(userId, 'h', 300, 0);
    expect(await redis.exists(`${prefix}otp-cooldown:${userId}`)).toBe(0);
    expect(await store.tryStartCooldown(userId, 0)).toBe(true);
    expect(await store.tryStartCooldown(userId, 0)).toBe(true);
  });

  it('assertReady: Redis sống thì xong; client chưa kết nối thì 503 DEPENDENCY_UNAVAILABLE, không treo', async () => {
    await expect(store.assertReady()).resolves.toBeUndefined();

    const dead = new Redis({
      host: '127.0.0.1',
      port: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    dead.on('error', () => undefined);
    const deadStore = new RedisOtpStore(dead, prefix);
    await expect(deadStore.assertReady()).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 503,
    });
    dead.disconnect();
  });
});
