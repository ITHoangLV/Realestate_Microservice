import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { expectEventMatchesContract } from './helpers/contracts';
import type { TestApp } from './helpers/create-test-app';
import { INFRA_TEST_SCHEMA, readRootEnv } from './helpers/infra';

/**
 * Luồng xác thực đầy đủ với Postgres + Redis + RabbitMQ THẬT (pnpm infra:up, rồi pnpm test:infra).
 *
 * - DB: schema riêng của test trong identity_db (tạo đầu test, xóa cuối test).
 * - Redis: tiền tố key ngẫu nhiên, xóa sạch cuối test.
 * - Khóa RSA tạo tạm trong bộ nhớ, không dùng thư mục secrets/.
 * - OUTBOX_RELAY_ENABLED=false: event identity.registered chỉ được GHI vào outbox, không gửi lên
 *   RabbitMQ, nên không rơi vào queue notification.events thật. Việc relay gửi đã có test ở
 *   messaging.infra-spec.ts.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const redisPrefix = `identity-test:${randomUUID().slice(0, 8)}:`;

const PASSWORD = 'Mat-khau-du-dai-1';
const register = (t: TestApp, body: Record<string, unknown>) =>
  t.http().post('/api/v1/auth/register').send(body);
const login = (t: TestApp, email: string, password = PASSWORD) =>
  t.http().post('/api/v1/auth/login').send({ email, password });
const refresh = (t: TestApp, refreshToken: string) =>
  t.http().post('/api/v1/auth/refresh').send({ refreshToken });

describe('Luồng xác thực với hạ tầng thật', () => {
  let t: TestApp;
  let pg: Client;
  let redis: Redis;
  const uniqueEmail = () => `user-${randomUUID().slice(0, 8)}@example.com`;
  const newUser = (over: Record<string, unknown> = {}) => ({
    email: uniqueEmail(),
    password: PASSWORD,
    fullName: 'Nguyễn Văn An',
    role: 'TENANT',
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
    t = await createTestApp([], [], { swagger: true });
    await t.app.get(DataSource).runMigrations();
  });

  afterAll(async () => {
    await t?.app.close();
    const keys = await redis.keys(`${redisPrefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
    await pg?.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`).catch(() => undefined);
    await pg?.end();
    for (const name of [
      'REDIS_URL',
      'REFRESH_TOKEN_REDIS_PREFIX',
      'JWT_PRIVATE_KEY',
      'JWT_PUBLIC_KEY',
      'JWT_ISSUER',
      'OUTBOX_RELAY_ENABLED',
    ]) {
      delete process.env[name];
    }
  });

  it('/health: db, redis, rabbitmq đều "up"', async () => {
    const res = await t.http().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ db: 'up', redis: 'up', rabbitmq: 'up' });
  });

  describe('register', () => {
    it('201: trả thông tin user, KHÔNG có mật khẩu; DB lưu hash argon2id; email chữ thường', async () => {
      const email = `Mixed.Case-${randomUUID().slice(0, 6)}@Example.COM`;
      const res = await register(
        t,
        newUser({ email, fullName: '  Trần Thị Bình  ', role: 'LANDLORD' }),
      );
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        email: email.toLowerCase(),
        fullName: 'Trần Thị Bình',
        role: 'LANDLORD',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

      const row = (
        await pg.query(`SELECT email, password_hash FROM users WHERE id = $1`, [res.body.data.id])
      ).rows[0];
      expect(row.email).toBe(email.toLowerCase());
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });

    it('ghi event identity.registered vào outbox, khớp contract, chưa gửi vì relay tắt', async () => {
      const body = newUser({ role: 'LANDLORD' });
      const res = await register(t, body);
      const rows = (
        await pg.query(
          `SELECT envelope, published_at FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
          [res.body.data.id],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      const event = rows[0].envelope;
      expect(event).toMatchObject({
        eventType: 'identity.registered',
        payload: {
          userId: res.body.data.id,
          email: body.email,
          fullName: body.fullName,
          role: 'LANDLORD',
        },
      });
      // producer trong test là SERVICE_NAME của test; contract yêu cầu 'identity' nên ghi đè khi kiểm tra
      expect(() => expectEventMatchesContract({ ...event, producer: 'identity' })).not.toThrow();
      expect(rows[0].published_at).toBeNull();
    });

    it('trùng email (kể cả khác hoa/thường) -> 409 IDENTITY_EMAIL_TAKEN và KHÔNG sinh thêm event', async () => {
      const body = newUser();
      expect((await register(t, body)).status).toBe(201);
      const again = await register(t, { ...body, email: body.email.toUpperCase() });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('IDENTITY_EMAIL_TAKEN');

      const events = await pg.query(
        `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'email' = $1`,
        [body.email],
      );
      expect(events.rowCount).toBe(1);
    });

    it('5 request đăng ký CÙNG LÚC cùng email: đúng một cái 201, còn lại 409, chỉ một event', async () => {
      const body = newUser();
      const results = await Promise.all(Array.from({ length: 5 }, () => register(t, body)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      const events = await pg.query(
        `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'email' = $1`,
        [body.email],
      );
      expect(events.rowCount).toBe(1);
    });

    it('không cho tự đăng ký ADMIN, mật khẩu ngắn, email sai, trường thừa -> 400 VALIDATION_FAILED', async () => {
      const cases = [
        newUser({ role: 'ADMIN' }),
        newUser({ password: 'ngan' }),
        newUser({ email: 'khong-phai-email' }),
        newUser({ isAdmin: true }),
        newUser({ fullName: '   ' }),
      ];
      for (const body of cases) {
        const res = await register(t, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('khung response', () => {
    it('thành công là { data, meta }, lỗi là { error, meta }, correlationId khớp header', async () => {
      const body = newUser();
      const ok = await t
        .http()
        .post('/api/v1/auth/register')
        .set('X-Request-ID', 'reg-1')
        .send(body);
      expect(ok.status).toBe(201);
      expect(Object.keys(ok.body).sort()).toEqual(['data', 'meta']);
      expect(ok.body.meta).toEqual({ correlationId: 'reg-1', timestamp: expect.any(String) });
      expect(ok.headers['x-request-id']).toBe('reg-1');

      const fail = await t
        .http()
        .post('/api/v1/auth/login')
        .set('X-Request-ID', 'login-1')
        .send({ email: body.email, password: 'Sai-mat-khau-1' });
      expect(fail.status).toBe(401);
      expect(Object.keys(fail.body).sort()).toEqual(['error', 'meta']);
      expect(fail.body.error).toEqual({
        code: 'IDENTITY_INVALID_CREDENTIALS',
        message: expect.any(String),
      });
      expect(fail.body.meta.correlationId).toBe('login-1');
    });

    it('logout 204 không có body; /health giữ body phẳng', async () => {
      const out = await t.http().post('/api/v1/auth/logout').send({ refreshToken: 'bat-ky-token' });
      expect(out.status).toBe(204);
      expect(out.text).toBe('');
      const health = await t.http().get('/health');
      expect(health.body).not.toHaveProperty('data');
    });

    it('Swagger mô tả response của auth theo { data, meta }', async () => {
      const doc = (await t.http().get('/api/docs-json')).body;
      const login =
        doc.paths['/api/v1/auth/login'].post.responses['200'].content['application/json'].schema;
      expect(login.properties.data).toEqual({ $ref: '#/components/schemas/AuthTokensDto' });
      expect(login.properties.meta).toEqual({ $ref: '#/components/schemas/ResponseMetaDto' });
    });
  });

  describe('login, me', () => {
    it('đúng mật khẩu -> access token RS256 kiểm tra được bằng khóa công khai, /me trả đúng user', async () => {
      const body = newUser({ role: 'LANDLORD' });
      const user = (await register(t, body)).body.data;

      const res = await login(t, body.email.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(res.body.data.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const payload = await new JwtService().verifyAsync(res.body.data.accessToken, {
        publicKey,
        algorithms: ['RS256'],
        issuer: 'realestate-identity-test',
      });
      expect(payload).toMatchObject({ sub: user.id, roles: ['LANDLORD'] });

      const me = await t
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data).toMatchObject({ id: user.id, email: body.email, role: 'LANDLORD' });
      expect(JSON.stringify(me.body)).not.toMatch(/password|argon2/i);
    });

    it('sai mật khẩu và email không tồn tại trả Y HỆT nhau (không lộ email nào đã đăng ký)', async () => {
      const body = newUser();
      await register(t, body);
      const wrongPassword = await login(t, body.email, 'Sai-mat-khau-1');
      const unknownEmail = await login(t, uniqueEmail());
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe('IDENTITY_INVALID_CREDENTIALS');
      expect(unknownEmail.body.error.code).toBe('IDENTITY_INVALID_CREDENTIALS');
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });

    it('/me: thiếu token, token giả, token ký bằng khóa lạ -> 401', async () => {
      expect((await t.http().get('/api/v1/auth/me')).status).toBe(401);
      expect(
        (await t.http().get('/api/v1/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status,
      ).toBe(401);

      const other = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      const forged = await new JwtService().signAsync(
        { sub: randomUUID(), roles: ['ADMIN'] },
        {
          algorithm: 'RS256',
          privateKey: other.privateKey,
          issuer: 'realestate-identity-test',
          expiresIn: 60,
        },
      );
      const res = await t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('refresh, logout', () => {
    const session = async () => {
      const body = newUser();
      await register(t, body);
      return (await login(t, body.email)).body.data as {
        accessToken: string;
        refreshToken: string;
      };
    };

    it('refresh cấp cặp mới; access token mới dùng được; dùng lại token cũ -> 401 và cả họ bị khóa', async () => {
      const first = await session();
      const second = await refresh(t, first.refreshToken);
      expect(second.status).toBe(200);
      expect(second.body.data.refreshToken).not.toBe(first.refreshToken);
      expect(
        (
          await t
            .http()
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${second.body.data.accessToken}`)
        ).status,
      ).toBe(200);

      const replay = await refresh(t, first.refreshToken);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('IDENTITY_INVALID_REFRESH_TOKEN');
      // token mới nhất cùng họ cũng chết
      expect((await refresh(t, second.body.data.refreshToken)).status).toBe(401);
      // và có log cảnh báo bị dùng lại
      expect(t.logRecords().some((r) => String(r.msg).includes('bị dùng lại'))).toBe(true);
    });

    it('hai lần đăng nhập là hai họ độc lập: khóa họ này không ảnh hưởng họ kia', async () => {
      const body = newUser();
      await register(t, body);
      const a = (await login(t, body.email)).body.data;
      const b = (await login(t, body.email)).body.data;
      await t.http().post('/api/v1/auth/logout').send({ refreshToken: a.refreshToken });
      expect((await refresh(t, a.refreshToken)).status).toBe(401);
      expect((await refresh(t, b.refreshToken)).status).toBe(200);
    });

    it('logout -> 204, refresh sau đó -> 401; logout token lạ vẫn 204', async () => {
      const s = await session();
      const out = await t.http().post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken });
      expect(out.status).toBe(204);
      expect((await refresh(t, s.refreshToken)).status).toBe(401);

      const unknown = await t
        .http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'khong-co-token-nay' });
      expect(unknown.status).toBe(204);
    });

    it('10 refresh ĐỒNG THỜI cùng một token: đúng một cái 200', async () => {
      const s = await session();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => refresh(t, s.refreshToken)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(9);
    });

    it('refresh/logout thiếu hoặc sai kiểu refreshToken -> 400', async () => {
      expect((await t.http().post('/api/v1/auth/refresh').send({})).status).toBe(400);
      expect((await t.http().post('/api/v1/auth/logout').send({ refreshToken: 123 })).status).toBe(
        400,
      );
    });

    it('refresh token trong Redis chỉ là hash, không có token gốc', async () => {
      const s = await session();
      const keys = await redis.keys(`${redisPrefix}*`);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.some((k) => k.includes(s.refreshToken))).toBe(false);
    });
  });
});
