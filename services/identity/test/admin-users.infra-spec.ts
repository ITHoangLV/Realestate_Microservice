import Redis from 'ioredis';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/identity/services/password.service';
import type { TestApp } from './helpers/create-test-app';
import { INFRA_TEST_SCHEMA, readRootEnv } from './helpers/infra';

/**
 * GET /api/v1/admin/users (route 8) với Postgres + Redis + RabbitMQ THẬT.
 * Dữ liệu: 1 ADMIN, 3 TENANT, 2 LANDLORD (tổng 6), hai người cố ý trùng created_at để thấy khóa phụ id DESC.
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
];

interface Seeded {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

describe('Danh sách người dùng cho quản trị viên với hạ tầng thật', () => {
  let t: TestApp;
  let pg: Client;
  let redis: Redis;
  let hash: string;
  const queries: string[] = [];
  const seeded: Seeded[] = [];
  const tokens: Record<'ADMIN' | 'TENANT' | 'LANDLORD', string> = {
    ADMIN: '',
    TENANT: '',
    LANDLORD: '',
  };

  /** Thứ tự đúng: created_at DESC, id DESC (so sánh chuỗi UUID thường trùng thứ tự bytea của Postgres). */
  const expectedOrder = (role?: string) =>
    seeded
      .filter((u) => !role || u.role === role)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((u) => u.id);
  const list = (qs = '', token = tokens.ADMIN) => {
    const r = t.http().get(`/api/v1/admin/users${qs}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  async function insertUser(role: string, createdAt: Date): Promise<Seeded> {
    const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`;
    const row = (
      await pg.query(
        `INSERT INTO users (email, password_hash, full_name, role, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [email, hash, `Người dùng ${role}`, role, createdAt],
      )
    ).rows[0];
    const user = { id: row.id as string, email, role, createdAt };
    seeded.push(user);
    return user;
  }
  async function tokenOf(email: string): Promise<string> {
    const res = await t.http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return res.body.data.accessToken;
  }

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
    hash = await t.app.get(PasswordService).hash(PASSWORD);

    const day = (d: number) => new Date(Date.UTC(2026, 10, d, 3, 0, 0));
    const admin = await insertUser('ADMIN', day(1));
    const tenantOld = await insertUser('TENANT', day(2));
    const tenantTieA = await insertUser('TENANT', day(5)); // hai người trùng created_at
    await insertUser('TENANT', day(5));
    const landlord = await insertUser('LANDLORD', day(3));
    await insertUser('LANDLORD', day(4));
    tokens.ADMIN = await tokenOf(admin.email);
    tokens.TENANT = await tokenOf(tenantOld.email);
    tokens.LANDLORD = await tokenOf(landlord.email);
    expect(tenantTieA.createdAt).toEqual(seeded[3].createdAt);

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

  describe('quyền', () => {
    it('không token -> 401', async () => {
      expect((await list('', '')).status).toBe(401);
    });

    it.each(['TENANT', 'LANDLORD'] as const)('%s -> 403 FORBIDDEN_ROLE', async (role) => {
      const res = await list('', tokens[role]);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('ADMIN -> 200', async () => {
      expect((await list()).status).toBe(200);
    });
  });

  describe('dữ liệu trả về', () => {
    it('sắp created_at DESC, id DESC (kể cả khi trùng created_at); meta đủ page/pageSize/total/totalPages', async () => {
      const res = await list();
      expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(expectedOrder());
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 6, totalPages: 1 });
    });

    it('mỗi phần tử đúng 7 trường của UserDto (API_Spec §1.12), không có mật khẩu hay băm', async () => {
      const res = await list();
      for (const u of res.body.data) {
        expect(Object.keys(u).sort()).toEqual([
          'createdAt',
          'email',
          'fullName',
          'id',
          'phone',
          'role',
          'status',
        ]);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|hash/i);
    });
  });

  describe('phân trang', () => {
    it('pageSize=4: trang 1 có 4, trang 2 có 2, ghép lại đúng thứ tự, totalPages=2', async () => {
      const p1 = await list('?pageSize=4&page=1');
      const p2 = await list('?pageSize=4&page=2');
      const ids = [...p1.body.data, ...p2.body.data].map((u: { id: string }) => u.id);
      expect(p1.body.data).toHaveLength(4);
      expect(p2.body.data).toHaveLength(2);
      expect(ids).toEqual(expectedOrder());
      expect(p1.body.meta).toMatchObject({ page: 1, pageSize: 4, total: 6, totalPages: 2 });
      expect(p2.body.meta).toMatchObject({ page: 2, pageSize: 4, total: 6, totalPages: 2 });
    });

    it('trang vượt quá -> 200, data [], total vẫn đúng', async () => {
      const res = await list('?pageSize=4&page=9');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ page: 9, pageSize: 4, total: 6, totalPages: 2 });
    });

    it('pageSize=50 hợp lệ', async () => {
      expect((await list('?pageSize=50')).status).toBe(200);
    });
  });

  describe('lọc role', () => {
    it.each([
      ['TENANT', 3],
      ['LANDLORD', 2],
      ['ADMIN', 1],
    ])('role=%s: chỉ vai trò đó, total=%i, đúng thứ tự', async (role, count) => {
      const res = await list(`?role=${role}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((u: { role: string }) => u.role)).toEqual(Array(count).fill(role));
      expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(expectedOrder(role));
      expect(res.body.meta.total).toBe(count);
    });

    it('lọc role + trang vượt: data [], total theo role (không phải tổng)', async () => {
      const res = await list('?role=TENANT&page=5&pageSize=2');
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ page: 5, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('lọc role + phân trang: trang 2 của TENANT pageSize=2 có 1 phần tử', async () => {
      const res = await list('?role=TENANT&page=2&pageSize=2');
      expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(
        expectedOrder('TENANT').slice(2),
      );
    });
  });

  describe('đầu vào sai -> 400 VALIDATION_FAILED', () => {
    it.each([
      ['role không hợp lệ', '?role=SUPERUSER'],
      ['role viết thường', '?role=tenant'],
      ['pageSize=51', '?pageSize=51'],
      ['pageSize=0', '?pageSize=0'],
      ['page=0', '?page=0'],
      ['page là chữ', '?page=abc'],
      ['tham số lạ', '?sort=email'],
    ])('%s', async (_name, qs) => {
      const res = await list(qs);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('truy vấn DB', () => {
    it('trang cần đếm: đúng 2 truy vấn (data + count); data không đọc password_hash, có ORDER BY, LIMIT, OFFSET', async () => {
      queries.length = 0;
      await list('?pageSize=2&page=2');

      expect(queries).toHaveLength(2);
      const count = queries.find((q) => /COUNT\(/i.test(q));
      const data = queries.find((q) => !/COUNT\(/i.test(q));
      expect(count).toBeDefined();
      expect(data).toBeDefined();
      expect(data).not.toMatch(/password_hash/i);
      expect(data).toMatch(/ORDER BY "User_created_at" DESC, "User_id" DESC/);
      expect(data).toMatch(/LIMIT 2 OFFSET 2/);
    });

    it('trang đầu chưa đầy: TypeORM bỏ truy vấn đếm (total = số dòng nhận được) nên chỉ 1 truy vấn, total vẫn đúng', async () => {
      queries.length = 0;
      const res = await list('?pageSize=20');
      expect(queries).toHaveLength(1);
      expect(queries[0]).not.toMatch(/COUNT\(/i);
      expect(res.body.meta.total).toBe(6);
    });

    it('lọc role: trang đầy vẫn 2 truy vấn, cả hai có điều kiện role; total theo role', async () => {
      queries.length = 0;
      const res = await list('?role=LANDLORD&pageSize=1');
      expect(queries).toHaveLength(2);
      for (const q of queries) expect(q).toMatch(/"role" = \$1/);
      expect(res.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    });

    it('mọi trường hợp tối đa 2 truy vấn (ngưỡng danh sách là 4)', async () => {
      for (const qs of ['', '?page=9', '?role=TENANT&page=2&pageSize=2', '?pageSize=50']) {
        queries.length = 0;
        await list(qs);
        expect(queries.length).toBeLessThanOrEqual(2);
        expect(queries.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('index cho danh sách (non-functional-standards §1)', () => {
    const plan = async (where: string) => {
      await pg.query('SET enable_seqscan = off');
      try {
        const res = await pg.query(
          `EXPLAIN SELECT id, email, full_name, role, created_at FROM users ${where}
           ORDER BY created_at DESC, id DESC LIMIT 20`,
        );
        return res.rows.map((r) => r['QUERY PLAN']).join('\n');
      } finally {
        await pg.query('RESET enable_seqscan');
      }
    };

    it('không lọc: dùng IDX_users_created_at_id, không có bước Sort', async () => {
      const p = await plan('');
      expect(p).toContain('IDX_users_created_at_id');
      expect(p).not.toMatch(/Sort/);
    });

    it('lọc role: dùng IDX_users_role_created_at_id, không có bước Sort', async () => {
      const p = await plan(`WHERE role = 'TENANT'`);
      expect(p).toContain('IDX_users_role_created_at_id');
      expect(p).not.toMatch(/Sort/);
    });
  });
});
