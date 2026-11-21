import Redis from 'ioredis';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { expectResponseMatchesOpenApi } from './helpers/contracts';
import type { TestApp } from './helpers/create-test-app';
import { INFRA_TEST_SCHEMA, readRootEnv } from './helpers/infra';

/**
 * API nội bộ GET /internal/users/:id/bank-account (test 11) với Postgres + Redis + RabbitMQ THẬT.
 * Body phải khớp contracts/openapi/identity-internal.v1.yaml (schema có additionalProperties:false).
 * Cùng cách dựng với bank-account.infra-spec.ts.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const redisPrefix = `identity-test:${randomUUID().slice(0, 8)}:`;
const PASSWORD = 'Mat-khau-du-dai-1';
const SPEC = 'identity-internal.v1.yaml';
const SPEC_PATH = '/internal/users/{id}/bank-account';
const ENV_NAMES = [
  'REDIS_URL',
  'REFRESH_TOKEN_REDIS_PREFIX',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
  'JWT_ISSUER',
  'OUTBOX_RELAY_ENABLED',
];

describe('API nội bộ tài khoản nhận tiền với hạ tầng thật', () => {
  let t: TestApp;
  let pg: Client;
  let redis: Redis;
  const queries: string[] = [];

  const internal = (id: string) => t.http().get(`/internal/users/${id}/bank-account`);
  async function newUser(): Promise<{ userId: string; token: string }> {
    const email = `internal-${randomUUID().slice(0, 8)}@example.com`;
    const reg = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'Trần Thị Bình', role: 'TENANT' });
    await pg.query(
      `UPDATE users SET status = 'ACTIVE', email_verified_at = now() WHERE lower(email) = lower($1)`,
      [email],
    );
    const res = await t.http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return { userId: reg.body.data.id, token: res.body.data.accessToken };
  }
  const declare = (token: string, over: Record<string, unknown> = {}) =>
    t
      .http()
      .put('/api/v1/users/me/bank-account')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankName: 'Vietcombank',
        accountNumber: '0123456789012',
        accountHolder: 'TRAN THI BINH',
        ...over,
      });

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
    });
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp();
    const ds = t.app.get(DataSource);
    await ds.runMigrations();
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

  it('đã khai -> 200, đúng 4 trường userId, bankName, accountHolder, accountNumber; khớp hợp đồng', async () => {
    const { userId, token } = await newUser();
    await declare(token, { accountNumber: '9876543210123', accountHolder: '  NGUYEN VAN AN ' });

    const res = await internal(userId); // không token: @Public(), tin mạng nội bộ
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      userId,
      bankName: 'Vietcombank',
      accountHolder: 'NGUYEN VAN AN',
      accountNumber: '9876543210123', // số đầy đủ đã giải mã
    });
    expect(Object.keys(res.body.data).sort()).toEqual([
      'accountHolder',
      'accountNumber',
      'bankName',
      'userId',
    ]);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(() => expectResponseMatchesOpenApi(SPEC, 'GET', SPEC_PATH, 200, res.body)).not.toThrow();
  });

  it('chưa khai -> 404 IDENTITY_BANK_ACCOUNT_NOT_FOUND, khớp hợp đồng; người dùng không tồn tại cũng vậy', async () => {
    const { userId } = await newUser();
    for (const id of [userId, randomUUID()]) {
      const res = await internal(id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('IDENTITY_BANK_ACCOUNT_NOT_FOUND');
      expect(() =>
        expectResponseMatchesOpenApi(SPEC, 'GET', SPEC_PATH, 404, res.body),
      ).not.toThrow();
    }
  });

  it.each(['khong-phai-uuid', '123', 'abc-def'])(
    'id "%s" không phải UUID -> 400 VALIDATION_FAILED, khớp hợp đồng, không truy vấn DB',
    async (bad) => {
      queries.length = 0;
      const res = await internal(bad);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'id phải là UUID',
      });
      expect(() =>
        expectResponseMatchesOpenApi(SPEC, 'GET', SPEC_PATH, 400, res.body),
      ).not.toThrow();
      expect(queries).toHaveLength(0);
    },
  );

  it('đúng 1 truy vấn DB cho mỗi lần gọi', async () => {
    const { userId, token } = await newUser();
    await declare(token);
    queries.length = 0;
    await internal(userId);
    expect(queries).toHaveLength(1);
  });

  it('access log không chứa số tài khoản', async () => {
    const { userId, token } = await newUser();
    const number = '5550123456789';
    await declare(token, { accountNumber: number });
    t.logs.length = 0;
    const res = await internal(userId);
    expect(res.status).toBe(200);
    expect(res.body.data.accountNumber).toBe(number);
    await sleep(50);

    expect(t.logs.length).toBeGreaterThan(0);
    expect(t.logs.join('\n')).not.toContain(number);
  });

  describe('bản mã hỏng -> 500, không lộ số và chi tiết', () => {
    const number = '4440123456789';
    const expectGeneric500 = (res: { status: number; body: unknown }) => {
      expect(res.status).toBe(500);
      const body = res.body as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(number);
      expect(text).not.toMatch(/stack|decrypt|auth|cipher|gcm/i);
    };

    it('sửa một byte của ciphertext trong DB', async () => {
      const { userId, token } = await newUser();
      await declare(token, { accountNumber: number });
      await pg.query(
        `UPDATE bank_accounts
            SET account_number_encrypted =
                set_byte(account_number_encrypted, 30, get_byte(account_number_encrypted, 30) # 1)
          WHERE user_id = $1`,
        [userId],
      );
      t.logs.length = 0;
      const res = await internal(userId);
      await sleep(50);

      expectGeneric500(res);
      // log có lỗi (level error) nhưng không có số tài khoản
      expect(t.logs.some((l) => /"level":"error"/.test(l))).toBe(true);
      expect(t.logs.join('\n')).not.toContain(number);
    });

    it('dòng của người này chép sang người khác (sai AAD)', async () => {
      const a = await newUser();
      const b = await newUser();
      await declare(a.token, { accountNumber: number });
      await pg.query(
        `INSERT INTO bank_accounts
           (user_id, bank_name, account_holder, account_number_encrypted, account_last4)
         SELECT $2, bank_name, account_holder, account_number_encrypted, account_last4
           FROM bank_accounts WHERE user_id = $1`,
        [a.userId, b.userId],
      );
      t.logs.length = 0;
      const res = await internal(b.userId);
      await sleep(50);

      expectGeneric500(res);
      expect(t.logs.join('\n')).not.toContain(number);
      // dòng gốc của A vẫn đọc được
      expect((await internal(a.userId)).body.data.accountNumber).toBe(number);
    });

    it('dữ liệu bị cắt cụt (ngắn hơn iv + tag)', async () => {
      const { userId, token } = await newUser();
      await declare(token, { accountNumber: number });
      await pg.query(
        `UPDATE bank_accounts SET account_number_encrypted = '\\x0102'::bytea WHERE user_id = $1`,
        [userId],
      );
      expectGeneric500(await internal(userId));
    });
  });
});
