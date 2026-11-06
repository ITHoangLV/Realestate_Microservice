import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/identity/password.service';
import { seedAdmin, SeedAdminError } from '../src/identity/seed-admin';
import { expectEventMatchesContract } from './helpers/contracts';
import { INFRA_TEST_SCHEMA } from './helpers/infra';

/**
 * seedAdmin với Postgres THẬT (schema riêng của test trong identity_db, xóa ở cuối).
 * Không cần Redis/RabbitMQ vì script seed không khởi động NestJS.
 */
describe('seedAdmin với Postgres thật', () => {
  let pg: Client;
  let ds: DataSource;
  const passwords = new PasswordService();
  const email = () => `admin-${randomUUID().slice(0, 8)}@example.com`;
  const PASSWORD = 'mat-khau-quan-tri-1';

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    await pg.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`);
    await pg.query(`CREATE SCHEMA ${INFRA_TEST_SCHEMA}`);
    ds = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      migrations: [join(__dirname, '..', 'src', 'database', 'migrations', '*.ts')],
    });
    await ds.initialize();
    await ds.runMigrations();
  });

  afterAll(async () => {
    await ds?.destroy();
    await pg?.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`).catch(() => undefined);
    await pg?.end();
  });

  it('tạo ADMIN: mật khẩu argon2id đăng nhập được, ghi 1 event identity.registered khớp contract', async () => {
    const e = email();
    const result = await seedAdmin(ds, {
      email: e.toUpperCase(),
      password: PASSWORD,
      fullName: 'Quản trị',
    });
    expect(result.status).toBe('created');

    const user = (await pg.query(`SELECT * FROM users WHERE id = $1`, [result.userId])).rows[0];
    expect(user).toMatchObject({ email: e, role: 'ADMIN', full_name: 'Quản trị' });
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    await expect(passwords.verify(user.password_hash, PASSWORD)).resolves.toBe(true);

    const events = (
      await pg.query(
        `SELECT envelope, published_at FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
        [result.userId],
      )
    ).rows;
    expect(events).toHaveLength(1);
    expect(events[0].envelope.payload).toEqual({
      userId: result.userId,
      email: e,
      fullName: 'Quản trị',
      role: 'ADMIN',
    });
    expect(() => expectEventMatchesContract(events[0].envelope)).not.toThrow();
    expect(events[0].published_at).toBeNull();
  });

  it('chạy lại cùng email: exists, KHÔNG đổi mật khẩu, KHÔNG thêm event', async () => {
    const e = email();
    const first = await seedAdmin(ds, { email: e, password: PASSWORD });
    const hashBefore = (
      await pg.query(`SELECT password_hash FROM users WHERE id = $1`, [first.userId])
    ).rows[0].password_hash;

    const again = await seedAdmin(ds, { email: e, password: 'mat-khau-khac-hoan-toan-2' });
    expect(again).toEqual({ status: 'exists', userId: first.userId });

    const hashAfter = (
      await pg.query(`SELECT password_hash FROM users WHERE id = $1`, [first.userId])
    ).rows[0].password_hash;
    expect(hashAfter).toBe(hashBefore);
    const events = await pg.query(
      `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
      [first.userId],
    );
    expect(events.rowCount).toBe(1);
  });

  it('email đã là người dùng thường -> từ chối, KHÔNG nâng quyền', async () => {
    const e = email();
    await pg.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Người dùng', 'TENANT')`,
      [e],
    );
    await expect(seedAdmin(ds, { email: e, password: PASSWORD })).rejects.toBeInstanceOf(
      SeedAdminError,
    );
    const role = (await pg.query(`SELECT role FROM users WHERE email = $1`, [e])).rows[0].role;
    expect(role).toBe('TENANT');
  });

  it('5 lần chạy đồng thời cùng email: đúng một created, một event', async () => {
    const e = email();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => seedAdmin(ds, { email: e, password: PASSWORD })),
    );
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'exists')).toHaveLength(4);
    const events = await pg.query(
      `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'email' = $1`,
      [e],
    );
    expect(events.rowCount).toBe(1);
  });
});
