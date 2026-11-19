import Redis from 'ioredis';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import type { TestApp } from './helpers/create-test-app';
import { INFRA_TEST_SCHEMA, readRootEnv } from './helpers/infra';

/**
 * Tài khoản nhận tiền (route 6, 7) với Postgres + Redis + RabbitMQ THẬT (pnpm test:infra).
 * Cùng cách dựng với auth.infra-spec.ts: schema Postgres riêng, tiền tố key Redis ngẫu nhiên,
 * khóa RSA và khóa mã hóa tạo tạm trong bộ nhớ, relay outbox tắt.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const redisPrefix = `identity-test:${randomUUID().slice(0, 8)}:`;
const PASSWORD = 'Mat-khau-du-dai-1';
const ENV_NAMES = [
  'REDIS_URL',
  'REFRESH_TOKEN_REDIS_PREFIX',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
  'JWT_ISSUER',
  'OUTBOX_RELAY_ENABLED',
  'BANK_ACCOUNT_ENCRYPTION_KEY',
];

describe('Tài khoản nhận tiền với hạ tầng thật', () => {
  let t: TestApp;
  let pg: Client;
  let redis: Redis;
  let ds: DataSource;
  const queries: string[] = [];

  const body = (over: Record<string, unknown> = {}) => ({
    bankName: 'Vietcombank',
    accountNumber: '0123456789012',
    accountHolder: 'TRAN THI BINH',
    ...over,
  });
  const bank = (token?: string) => ({
    get: () => {
      const r = t.http().get('/api/v1/users/me/bank-account');
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    put: (payload: Record<string, unknown>) => {
      const r = t.http().put('/api/v1/users/me/bank-account').send(payload);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
  });
  /** Đăng ký rồi đăng nhập; trả userId và accessToken. */
  async function newUser(role: 'TENANT' | 'LANDLORD' = 'TENANT') {
    const email = `bank-${randomUUID().slice(0, 8)}@example.com`;
    const reg = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'Trần Thị Bình', role });
    const res = await t.http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return { userId: reg.body.data.id as string, token: res.body.data.accessToken as string };
  }
  const dbRows = async (userId: string) =>
    (await pg.query(`SELECT * FROM bank_accounts WHERE user_id = $1`, [userId])).rows;

  beforeAll(async () => {
    const root = readRootEnv();
    pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    await pg.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`);
    await pg.query(`CREATE SCHEMA ${INFRA_TEST_SCHEMA}`);
    const redisUrl = `redis://:${encodeURIComponent(root.REDIS_PASSWORD as string)}@localhost:${root.REDIS_PORT ?? '6379'}`;
    redis = new Redis(redisUrl);
    Object.assign(process.env, {
      REDIS_URL: redisUrl,
      REFRESH_TOKEN_REDIS_PREFIX: redisPrefix,
      JWT_PRIVATE_KEY: privateKey,
      JWT_PUBLIC_KEY: publicKey,
      JWT_ISSUER: 'realestate-identity-test',
      OUTBOX_RELAY_ENABLED: 'false',
      BANK_ACCOUNT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp();
    ds = t.app.get(DataSource);
    await ds.runMigrations();
    // Đếm mọi câu SQL TypeORM gửi đi (kiểm số truy vấn mỗi route)
    const noop = () => undefined;
    (ds as unknown as { logger: unknown }).logger = {
      logQuery: (q: string) => queries.push(q),
      logQueryError: noop,
      logQuerySlow: noop,
      logSchemaBuild: noop,
      logMigration: noop,
      log: noop,
    };
  });

  afterAll(async () => {
    await t?.app.close();
    const keys = await redis.keys(`${redisPrefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
    await pg?.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`).catch(() => undefined);
    await pg?.end();
    for (const name of ENV_NAMES) delete process.env[name];
  });

  it('không có token -> 401 cho cả GET và PUT', async () => {
    expect((await bank().get()).status).toBe(401);
    expect((await bank().put(body())).status).toBe(401);
  });

  it('GET trước khi khai -> 404 IDENTITY_BANK_ACCOUNT_NOT_FOUND', async () => {
    const { token } = await newUser();
    const res = await bank(token).get();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('IDENTITY_BANK_ACCOUNT_NOT_FOUND');
  });

  describe('PUT lần đầu (test 9)', () => {
    it('200: response đúng 4 trường, chỉ bốn số cuối; DB chỉ có bytea mã hóa, không có số rõ', async () => {
      const { userId, token } = await newUser();
      const payload = body({ accountNumber: '9876543210123', accountHolder: '  TRAN THI BINH  ' });
      const res = await bank(token).put(payload);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'accountHolder',
        'accountLast4',
        'bankName',
        'updatedAt',
      ]);
      expect(res.body.data).toMatchObject({
        bankName: 'Vietcombank',
        accountHolder: 'TRAN THI BINH', // đã cắt khoảng trắng
        accountLast4: '0123',
      });
      expect(new Date(res.body.data.updatedAt).toISOString()).toBe(res.body.data.updatedAt);
      expect(JSON.stringify(res.body)).not.toContain('9876543210123');

      const rows = await dbRows(userId);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Buffer.isBuffer(row.account_number_encrypted)).toBe(true);
      expect(row.account_number_encrypted.length).toBe(12 + 16 + 13); // iv + tag + 13 chữ số
      expect(row.account_last4.trim()).toBe('0123');
      // không cột nào chứa số rõ (dạng chuỗi hay byte)
      expect(JSON.stringify(row)).not.toContain('9876543210123');
      expect(row.account_number_encrypted.toString('latin1')).not.toContain('9876543210123');
      expect(row.account_holder).toBe('TRAN THI BINH');
    });

    it('log của PUT không chứa số tài khoản đầy đủ (test 9)', async () => {
      const { token } = await newUser();
      const number = '5550123456789';
      t.logs.length = 0;
      const res = await bank(token).put(body({ accountNumber: number }));
      expect(res.status).toBe(200);
      await sleep(50); // access log ghi sau sự kiện 'finish'

      expect(t.logs.length).toBeGreaterThan(0);
      expect(t.logs.join('\n')).not.toContain(number);
    });

    it('log của PUT bị từ chối (400) cũng không chứa số tài khoản', async () => {
      const { token } = await newUser();
      const number = '5550123456789';
      t.logs.length = 0;
      const res = await bank(token).put(body({ accountNumber: number, accountHolder: '   ' }));
      expect(res.status).toBe(400);
      await sleep(50);
      expect(t.logs.join('\n')).not.toContain(number);
      expect(JSON.stringify(res.body)).not.toContain(number);
    });
  });

  describe('PUT ghi đè', () => {
    it('lần hai ghi đè bản cũ, vẫn một dòng, updatedAt tăng, createdAt giữ nguyên', async () => {
      const { userId, token } = await newUser();
      const first = await bank(token).put(body());
      const rowBefore = (await dbRows(userId))[0];
      await sleep(30);
      const second = await bank(token).put(
        body({
          bankName: 'ACB',
          accountNumber: '1111222233334444',
          accountHolder: 'NGUYEN VAN AN',
        }),
      );

      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({
        bankName: 'ACB',
        accountHolder: 'NGUYEN VAN AN',
        accountLast4: '4444',
      });
      expect(new Date(second.body.data.updatedAt).getTime()).toBeGreaterThan(
        new Date(first.body.data.updatedAt).getTime(),
      );

      const rows = await dbRows(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(rowBefore.id);
      expect(rows[0].created_at.getTime()).toBe(rowBefore.created_at.getTime());
      expect(rows[0].updated_at.getTime()).toBeGreaterThan(rowBefore.updated_at.getTime());
      expect(rows[0].account_number_encrypted.equals(rowBefore.account_number_encrypted)).toBe(
        false,
      );
    });

    it('hai PUT đồng thời: cả hai 200, vẫn một dòng', async () => {
      const { userId, token } = await newUser();
      const results = await Promise.all([
        bank(token).put(body({ accountNumber: '1000000000001' })),
        bank(token).put(body({ accountNumber: '2000000000002' })),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await dbRows(userId)).toHaveLength(1);
    });
  });

  it('GET sau PUT trả cùng dạng với PUT; người khác không thấy và không bị ảnh hưởng', async () => {
    const a = await newUser();
    const b = await newUser('LANDLORD');
    const put = await bank(a.token).put(body());
    const get = await bank(a.token).get();

    expect(get.status).toBe(200);
    expect(get.body.data).toEqual(put.body.data);
    expect((await bank(b.token).get()).status).toBe(404);
    expect(await dbRows(b.userId)).toHaveLength(0);
  });

  it('không tin userId trong body: trường thừa -> 400, không ghi gì', async () => {
    const a = await newUser();
    const b = await newUser();
    const res = await bank(a.token).put(body({ userId: b.userId }));
    expect(res.status).toBe(400);
    expect(await dbRows(b.userId)).toHaveLength(0);
    expect(await dbRows(a.userId)).toHaveLength(0);
  });

  it.each([
    ['accountNumber 5 chữ số', { accountNumber: '12345' }],
    ['accountNumber 20 chữ số', { accountNumber: '1'.repeat(20) }],
    ['accountNumber có chữ', { accountNumber: '12345678ab' }],
    ['accountNumber là số', { accountNumber: 123456789 }],
    ['accountHolder toàn khoảng trắng', { accountHolder: '    ' }],
    ['accountHolder 201 ký tự', { accountHolder: 'A'.repeat(201) }],
    ['bankName 1 ký tự', { bankName: 'V' }],
    ['thiếu bankName', { bankName: undefined }],
  ])('400 VALIDATION_FAILED: %s', async (_name, over) => {
    const { userId, token } = await newUser();
    const res = await bank(token).put(body(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await dbRows(userId)).toHaveLength(0);
  });

  describe('số truy vấn', () => {
    it('route 6 (GET) = 1 truy vấn, route 7 (PUT) = 1 truy vấn', async () => {
      const { token } = await newUser();

      queries.length = 0;
      await bank(token).put(body());
      const putQueries = [...queries];
      queries.length = 0;
      await bank(token).get();
      const getQueries = [...queries];

      expect(putQueries).toHaveLength(1);
      expect(getQueries).toHaveLength(1);
      expect(putQueries[0]).toMatch(/ON CONFLICT/i);
    });
  });
});
