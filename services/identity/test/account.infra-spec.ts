import { randomUUID } from 'node:crypto';
import { startIdentityInfra } from './helpers/identity-infra';
import type { IdentityInfra } from './helpers/identity-infra';
import { PasswordService } from '../src/identity/services/password.service';

/**
 * Khóa, mở khóa tài khoản và hồ sơ cá nhân: test 22, 22a, 23 của `Component_Class_Design §5`, với Postgres +
 * Redis thật.
 */
describe('Khóa tài khoản và hồ sơ với hạ tầng thật', () => {
  let x: IdentityInfra;
  let hash: string;
  const PASSWORD = 'Mat-khau-du-dai-1';
  const email = () => `acc-${randomUUID().slice(0, 8)}@example.com`;
  const login = (e: string, password = PASSWORD) =>
    x.t.http().post('/api/v1/auth/login').send({ email: e, password });
  const refresh = (refreshToken: string) =>
    x.t.http().post('/api/v1/auth/refresh').send({ refreshToken });
  const lock = (
    token: string | undefined,
    id: string,
    body: unknown = { reason: 'Nghi ngờ lừa đảo' },
  ) => {
    const r = x.t
      .http()
      .post(`/api/v1/admin/users/${id}/lock`)
      .send(body as object);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const unlock = (token: string | undefined, id: string) => {
    const r = x.t.http().post(`/api/v1/admin/users/${id}/unlock`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const patchMe = (token: string | undefined, body: unknown) => {
    const r = x.t
      .http()
      .patch('/api/v1/users/me')
      .send(body as object);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const row = async (id: string) =>
    (await x.pg.query(`SELECT * FROM users WHERE id = $1`, [id])).rows[0];

  /** Tạo user thẳng bằng SQL (đã băm sẵn mật khẩu), trạng thái cho trước. */
  async function insertUser(
    role: 'TENANT' | 'LANDLORD' | 'ADMIN',
    status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'ACTIVE',
    phone: string | null = null,
  ) {
    const e = email();
    const res = await x.pg.query(
      `INSERT INTO users (email, password_hash, full_name, role, status, email_verified_at, phone)
       VALUES ($1, $2, 'Nguyễn Văn An', $3, $4, CASE WHEN $4 = 'ACTIVE' THEN now() END, $5) RETURNING id`,
      [e, hash, role, status, phone],
    );
    return { id: res.rows[0].id as string, email: e };
  }
  async function session(u: { email: string }) {
    return (await login(u.email)).body.data as { accessToken: string; refreshToken: string };
  }

  let admin: { id: string; email: string };
  let adminToken: string;

  beforeAll(async () => {
    x = await startIdentityInfra();
    hash = await new PasswordService().hash(PASSWORD);
    admin = await insertUser('ADMIN');
    adminToken = (await session(admin)).accessToken;
  });
  afterAll(async () => {
    await x?.close();
  });

  describe('test 22: khóa tài khoản', () => {
    it('200 trả UserDto LOCKED; refresh token cũ 401; đăng nhập (đúng mật khẩu) 403; DB ghi locked_*', async () => {
      const u = await insertUser('TENANT');
      const s = await session(u);

      const res = await lock(adminToken, u.id, { reason: '  Nghi ngờ lừa đảo ' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: u.id, status: 'LOCKED', email: u.email });
      expect(JSON.stringify(res.body)).not.toMatch(/password|lock_reason|lockReason/i);
      const r = await row(u.id);
      expect(r).toMatchObject({
        status: 'LOCKED',
        locked_by: admin.id,
        lock_reason: 'Nghi ngờ lừa đảo',
      });
      expect(r.locked_at).toBeInstanceOf(Date);

      const refreshed = await refresh(s.refreshToken);
      expect(refreshed.status).toBe(401);
      expect(refreshed.body.error.code).toBe('IDENTITY_INVALID_REFRESH_TOKEN');
      const again = await login(u.email);
      expect(again.status).toBe(403);
      expect(again.body.error.code).toBe('IDENTITY_ACCOUNT_LOCKED');
      expect((await login(u.email, 'Sai-mat-khau-1')).status).toBe(401); // sai mật khẩu vẫn 401 chung
    });

    it('thu hồi MỌI phiên: hai lần đăng nhập đều bị chặn refresh', async () => {
      const u = await insertUser('LANDLORD');
      const a = await session(u);
      const b = await session(u);
      await lock(adminToken, u.id);
      expect((await refresh(a.refreshToken)).status).toBe(401);
      expect((await refresh(b.refreshToken)).status).toBe(401);
    });

    it('khóa lần hai -> 200 (idempotent), KHÔNG ghi đè lý do và thời điểm khóa cũ', async () => {
      const u = await insertUser('TENANT');
      await lock(adminToken, u.id, { reason: 'Lý do thứ nhất' });
      const first = await row(u.id);

      const second = await lock(adminToken, u.id, { reason: 'Lý do thứ hai' });

      expect(second.status).toBe(200);
      const after = await row(u.id);
      expect(after.lock_reason).toBe('Lý do thứ nhất');
      expect(after.locked_at).toEqual(first.locked_at);
    });

    it('khóa lần hai vẫn thu hồi phiên: phiên mở nhờ lỗi thu hồi lần đầu bị khóa nốt', async () => {
      const u = await insertUser('TENANT');
      const s = await session(u);
      // Giả lập lần khóa trước đã commit LOCKED nhưng Redis lỗi trước khi thu hồi
      await x.pg.query(
        `UPDATE users SET status = 'LOCKED', locked_at = now(), lock_reason = 'x' WHERE id = $1`,
        [u.id],
      );
      const rotated = await refresh(s.refreshToken);
      expect(rotated.status).toBe(200); // phiên còn sống vì chưa thu hồi

      const res = await lock(adminToken, u.id);

      expect(res.status).toBe(200);
      expect((await refresh(rotated.body.data.refreshToken)).status).toBe(401);
    });

    it('người dùng không tồn tại -> 404 IDENTITY_USER_NOT_FOUND', async () => {
      const res = await lock(adminToken, randomUUID());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('IDENTITY_USER_NOT_FOUND');
    });

    it('khóa chính mình -> 409 IDENTITY_CANNOT_LOCK_SELF, tài khoản vẫn ACTIVE', async () => {
      const res = await lock(adminToken, admin.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDENTITY_CANNOT_LOCK_SELF');
      expect((await row(admin.id)).status).toBe('ACTIVE');
    });

    it('thiếu lý do, lý do rỗng hoặc > 500 ký tự, trường lạ -> 400 VALIDATION_FAILED, không khóa', async () => {
      const u = await insertUser('TENANT');
      for (const body of [
        {},
        { reason: '   ' },
        { reason: 'a'.repeat(501) },
        { reason: 'x', status: 'ACTIVE' },
      ]) {
        const res = await lock(adminToken, u.id, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      expect((await row(u.id)).status).toBe('ACTIVE');
    });

    it('id không phải UUID -> 400 "id phải là UUID"', async () => {
      const res = await lock(adminToken, 'khong-phai-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toBe('id phải là UUID');
    });

    it('không token -> 401; TENANT, LANDLORD -> 403 FORBIDDEN_ROLE; không khóa được', async () => {
      const victim = await insertUser('TENANT');
      expect((await lock(undefined, victim.id)).status).toBe(401);
      for (const role of ['TENANT', 'LANDLORD'] as const) {
        const caller = await insertUser(role);
        const res = await lock((await session(caller)).accessToken, victim.id);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
      }
      expect((await row(victim.id)).status).toBe('ACTIVE');
    });

    it('khóa không đụng dữ liệu khác của người đó (tài khoản nhận tiền, tin đăng... ở service khác; ở identity: bank_accounts giữ nguyên)', async () => {
      const u = await insertUser('LANDLORD');
      const s = await session(u);
      const put = await x.t
        .http()
        .put('/api/v1/users/me/bank-account')
        .set('Authorization', `Bearer ${s.accessToken}`)
        .send({ bankName: 'Vietcombank', accountNumber: '0123456789', accountHolder: 'AN' });
      expect(put.status).toBe(200);
      await lock(adminToken, u.id);
      const count = await x.pg.query(`SELECT 1 FROM bank_accounts WHERE user_id = $1`, [u.id]);
      expect(count.rowCount).toBe(1);
    });

    it('số truy vấn DB: khóa đúng 2 (UPDATE, SELECT)', async () => {
      const u = await insertUser('TENANT');
      x.queries.length = 0;
      expect((await lock(adminToken, u.id)).status).toBe(200);
      expect(x.queries).toHaveLength(2);
      expect(x.queries[0]).toMatch(/UPDATE "users"/);
    });
  });

  describe('test 22a: mở khóa', () => {
    it('đã xác minh email -> về ACTIVE, xóa locked_*, đăng nhập lại được', async () => {
      const u = await insertUser('TENANT');
      await lock(adminToken, u.id);

      const res = await unlock(adminToken, u.id);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: u.id, status: 'ACTIVE' });
      expect(await row(u.id)).toMatchObject({
        status: 'ACTIVE',
        locked_at: null,
        locked_by: null,
        lock_reason: null,
      });
      expect((await login(u.email)).status).toBe(200);
    });

    it('chưa xác minh email -> về PENDING_VERIFICATION (đăng nhập 403 chờ OTP, không bị ACTIVE ngầm)', async () => {
      const u = await insertUser('TENANT', 'PENDING_VERIFICATION');
      await lock(adminToken, u.id);
      expect((await row(u.id)).email_verified_at).toBeNull();

      const res = await unlock(adminToken, u.id);

      expect(res.body.data.status).toBe('PENDING_VERIFICATION');
      const attempt = await login(u.email);
      expect(attempt.status).toBe(403);
      expect(attempt.body.error.code).toBe('IDENTITY_EMAIL_NOT_VERIFIED');
    });

    it('tài khoản có từ trước migration (backfill email_verified_at) khóa rồi mở khóa -> ACTIVE', async () => {
      const u = await insertUser('TENANT');
      // email_verified_at = created_at như câu UPDATE backfill của migration
      await x.pg.query(`UPDATE users SET email_verified_at = created_at WHERE id = $1`, [u.id]);
      await lock(adminToken, u.id);
      expect((await unlock(adminToken, u.id)).body.data.status).toBe('ACTIVE');
    });

    it('mở khóa tài khoản không bị khóa -> 200, không đổi gì; không tồn tại -> 404; id sai -> 400; không phải ADMIN -> 403', async () => {
      const u = await insertUser('TENANT');
      expect((await unlock(adminToken, u.id)).body.data.status).toBe('ACTIVE');
      const missing = await unlock(adminToken, randomUUID());
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('IDENTITY_USER_NOT_FOUND');
      expect((await unlock(adminToken, 'sai')).status).toBe(400);
      expect((await unlock(undefined, u.id)).status).toBe(401);
      const tenantToken = (await session(await insertUser('TENANT'))).accessToken;
      expect((await unlock(tenantToken, u.id)).status).toBe(403);
    });

    it('mở khóa KHÔNG khôi phục phiên cũ (refresh token cũ vẫn 401)', async () => {
      const u = await insertUser('TENANT');
      const s = await session(u);
      await lock(adminToken, u.id);
      await unlock(adminToken, u.id);
      expect((await refresh(s.refreshToken)).status).toBe(401);
    });

    it('số truy vấn DB: mở khóa đúng 2 (UPDATE, SELECT)', async () => {
      const u = await insertUser('TENANT');
      await lock(adminToken, u.id);
      x.queries.length = 0;
      await unlock(adminToken, u.id);
      expect(x.queries).toHaveLength(2);
    });
  });

  describe('test 23 và PATCH /users/me', () => {
    it('đổi họ tên và số điện thoại -> 200 UserDto mới; trường vắng mặt giữ nguyên', async () => {
      const u = await insertUser('TENANT', 'ACTIVE', '0911111111');
      const token = (await session(u)).accessToken;

      const res = await patchMe(token, { fullName: '  Trần Thị Bình ' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: u.id,
        fullName: 'Trần Thị Bình',
        phone: '0911111111',
      });

      const res2 = await patchMe(token, { phone: '0922222222' });
      expect(res2.body.data).toMatchObject({ fullName: 'Trần Thị Bình', phone: '0922222222' });
    });

    it('phone: null xóa số; sau đó người khác dùng lại được số cũ', async () => {
      const u = await insertUser('TENANT', 'ACTIVE', '0933333333');
      const token = (await session(u)).accessToken;
      const res = await patchMe(token, { phone: null });
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBeNull();
      expect((await row(u.id)).phone).toBeNull();

      const other = await insertUser('TENANT', 'ACTIVE', '0933333333');
      expect(other.id).toBeDefined();
    });

    it('test 23: phone trùng người khác -> 409 IDENTITY_PHONE_TAKEN, số của mình không đổi', async () => {
      await insertUser('TENANT', 'ACTIVE', '0944444444');
      const u = await insertUser('TENANT', 'ACTIVE', '0955555555');
      const token = (await session(u)).accessToken;

      const res = await patchMe(token, { phone: '0944444444' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDENTITY_PHONE_TAKEN');
      expect((await row(u.id)).phone).toBe('0955555555');
    });

    it('đặt lại đúng số của chính mình -> 200 (không tự trùng với mình)', async () => {
      const u = await insertUser('TENANT', 'ACTIVE', '0966666666');
      const token = (await session(u)).accessToken;
      expect((await patchMe(token, { phone: '0966666666' })).status).toBe(200);
    });

    it('body rỗng, phone sai định dạng, fullName rỗng hoặc null (test 23a), đổi email/role/status -> 400 VALIDATION_FAILED', async () => {
      const u = await insertUser('TENANT');
      const token = (await session(u)).accessToken;
      for (const body of [
        {},
        { phone: '12345' },
        { fullName: '   ' },
        { fullName: null },
        { fullName: null, phone: null },
        { email: 'x@y.com' },
        { role: 'ADMIN' },
        { status: 'ACTIVE' },
        { fullName: 'An', role: 'ADMIN' },
      ]) {
        const res = await patchMe(token, body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      expect(await row(u.id)).toMatchObject({ role: 'TENANT' });
    });

    it('không token -> 401; chỉ sửa được chính mình (không có userId trong đường dẫn hay body)', async () => {
      expect((await patchMe(undefined, { fullName: 'An' })).status).toBe(401);
      const a = await insertUser('TENANT');
      const b = await insertUser('TENANT');
      const token = (await session(a)).accessToken;
      const res = await patchMe(token, { fullName: 'Người Khác', id: b.id });
      expect(res.status).toBe(400); // `id` là trường lạ
      expect((await row(b.id)).full_name).toBe('Nguyễn Văn An');
    });

    it('/auth/me và danh sách quản trị trả status, phone', async () => {
      const u = await insertUser('TENANT', 'ACTIVE', '0977777777');
      const token = (await session(u)).accessToken;
      const me = await x.t.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.body.data).toMatchObject({ status: 'ACTIVE', phone: '0977777777' });

      const list = await x.t
        .http()
        .get('/api/v1/admin/users?pageSize=50&role=TENANT')
        .set('Authorization', `Bearer ${adminToken}`);
      const found = list.body.data.find((d: { id: string }) => d.id === u.id);
      expect(found).toMatchObject({ status: 'ACTIVE', phone: '0977777777' });
    });

    it('số truy vấn DB: PATCH đúng 2 (UPDATE, SELECT)', async () => {
      const u = await insertUser('TENANT');
      const token = (await session(u)).accessToken;
      x.queries.length = 0;
      await patchMe(token, { fullName: 'An' });
      expect(x.queries).toHaveLength(2);
    });
  });
});
