import { join } from 'node:path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/identity/services/password.service';
import { SEED_USERS } from '../src/identity/seed/seed-users.data';
import { seedUsers, SeedUsersError } from '../src/identity/seed/seed-users';
import { expectEventMatchesContract } from './helpers/contracts';
import { INFRA_TEST_SCHEMA } from './helpers/infra';

/**
 * seedUsers với Postgres THẬT (schema riêng của test trong identity_db, xóa ở cuối).
 * Không cần Redis/RabbitMQ vì script seed không khởi động NestJS.
 */
describe('seedUsers với Postgres thật', () => {
  let pg: Client;
  let ds: DataSource;
  const passwords = new PasswordService();
  const PASSWORD = 'mat-khau-seed-dev-1';

  const resetTables = async () => {
    await pg.query(`TRUNCATE users, outbox_events CASCADE`);
  };

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

  beforeEach(resetTables);

  afterAll(async () => {
    await ds?.destroy();
    await pg?.query(`DROP SCHEMA IF EXISTS ${INFRA_TEST_SCHEMA} CASCADE`).catch(() => undefined);
    await pg?.end();
  });

  it('lần đầu: tạo 8 người đúng id, email, vai trò; mật khẩu argon2id đăng nhập được', async () => {
    await expect(seedUsers(ds, { password: PASSWORD })).resolves.toEqual({
      created: 8,
      existing: 0,
    });

    const rows = (await pg.query(`SELECT * FROM users ORDER BY id`)).rows;
    expect(rows).toHaveLength(8);
    for (const seed of SEED_USERS) {
      const row = rows.find((r) => r.id === seed.id);
      expect(row).toMatchObject({ email: seed.email, full_name: seed.fullName, role: seed.role });
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      await expect(passwords.verify(row.password_hash, PASSWORD)).resolves.toBe(true);
    }
    expect(rows.filter((r) => r.role === 'LANDLORD')).toHaveLength(3);
    expect(rows.filter((r) => r.role === 'TENANT')).toHaveLength(5);
  });

  it('ghi 8 event identity.registered khớp contract, chưa publish', async () => {
    await seedUsers(ds, { password: PASSWORD });
    const events = (
      await pg.query(`SELECT envelope, published_at FROM outbox_events ORDER BY created_at, id`)
    ).rows;
    expect(events).toHaveLength(8);
    for (const e of events) {
      expect(() => expectEventMatchesContract(e.envelope)).not.toThrow();
      expect(e.published_at).toBeNull();
    }
    const userIds = events.map((e) => e.envelope.payload.userId).sort();
    expect(userIds).toEqual(SEED_USERS.map((u) => u.id).sort());
  });

  it('chạy lại: created 0, existing 8, KHÔNG đổi mật khẩu, KHÔNG thêm event', async () => {
    await seedUsers(ds, { password: PASSWORD });
    const before = (await pg.query(`SELECT id, password_hash FROM users ORDER BY id`)).rows;

    await expect(seedUsers(ds, { password: 'mat-khau-khac-hoan-toan-2' })).resolves.toEqual({
      created: 0,
      existing: 8,
    });

    const after = (await pg.query(`SELECT id, password_hash FROM users ORDER BY id`)).rows;
    expect(after).toEqual(before);
    expect((await pg.query(`SELECT 1 FROM outbox_events`)).rowCount).toBe(8);
  });

  it('có sẵn một phần: chỉ tạo phần còn thiếu', async () => {
    const first = SEED_USERS[0];
    await pg.query(
      `INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1, $2, 'x', $3, $4)`,
      [first.id, first.email, first.fullName, first.role],
    );
    await expect(seedUsers(ds, { password: PASSWORD })).resolves.toEqual({
      created: 7,
      existing: 1,
    });
    expect((await pg.query(`SELECT 1 FROM users`)).rowCount).toBe(8);
    expect((await pg.query(`SELECT 1 FROM outbox_events`)).rowCount).toBe(7);
  });

  it('5 lần chạy đồng thời: tổng created đúng 8, không lỗi, đúng 8 event', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => seedUsers(ds, { password: PASSWORD })),
    );
    const ok = results.filter(
      (r): r is PromiseFulfilledResult<{ created: number; existing: number }> =>
        r.status === 'fulfilled',
    );
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.reduce((sum, r) => sum + r.value.created, 0)).toBe(8);
    expect((await pg.query(`SELECT 1 FROM users`)).rowCount).toBe(8);
    expect((await pg.query(`SELECT 1 FROM outbox_events`)).rowCount).toBe(8);
  });

  describe('xung đột: báo lỗi rõ ràng, hoàn tác cả transaction, không sửa dữ liệu của người khác', () => {
    it('email seed đã thuộc id khác', async () => {
      const target = SEED_USERS[3];
      await pg.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Người khác', $2)`,
        [target.email.toUpperCase(), target.role],
      );
      const promise = seedUsers(ds, { password: PASSWORD });
      await expect(promise).rejects.toBeInstanceOf(SeedUsersError);
      await expect(promise).rejects.toThrow(new RegExp(target.email));
      await expect(promise).rejects.toThrow(/đã có id/);

      // người seed trước đó (SEED_USERS[0..2]) cũng bị hoàn tác
      expect((await pg.query(`SELECT 1 FROM users`)).rowCount).toBe(1);
      expect((await pg.query(`SELECT 1 FROM outbox_events`)).rowCount).toBe(0);
      const other = (await pg.query(`SELECT full_name FROM users`)).rows[0];
      expect(other.full_name).toBe('Người khác');
    });

    it('email seed đã có đúng id nhưng khác vai trò -> không đổi vai trò', async () => {
      const target = SEED_USERS[0]; // LANDLORD
      await pg.query(
        `INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1, $2, 'x', 'Đổi vai', 'TENANT')`,
        [target.id, target.email],
      );
      await expect(seedUsers(ds, { password: PASSWORD })).rejects.toBeInstanceOf(SeedUsersError);
      const role = (await pg.query(`SELECT role FROM users WHERE id = $1`, [target.id])).rows[0]
        .role;
      expect(role).toBe('TENANT');
    });

    it('id seed đã dùng cho email khác', async () => {
      const target = SEED_USERS[1];
      await pg.query(
        `INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1, 'nguoi-la@example.com', 'x', 'Người lạ', $2)`,
        [target.id, target.role],
      );
      const promise = seedUsers(ds, { password: PASSWORD });
      await expect(promise).rejects.toBeInstanceOf(SeedUsersError);
      await expect(promise).rejects.toThrow(/nguoi-la@example\.com/);
    });
  });
});
