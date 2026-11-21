import { randomUUID } from 'node:crypto';
import { expectEventMatchesContract } from './helpers/contracts';
import { startIdentityInfra } from './helpers/identity-infra';
import type { IdentityInfra } from './helpers/identity-infra';
import { GOOGLE_ID_TOKEN_VERIFIER } from '../src/identity/services/google-id-token.verifier';
import type { GoogleIdentity } from '../src/identity/services/google-id-token.verifier';
import { googleTokenInvalid } from '../src/identity/errors/identity.errors';

/**
 * Đăng nhập Google: test 20, 21, 24 của `Component_Class_Design §5`, với Postgres + Redis thật.
 * Không gọi Google thật: bộ kiểm ID token được thay bằng bản giả đọc token dạng `ok:<sub>:<email>:<verified>`
 * (việc `google-auth-library` kiểm chữ ký, `aud`, hạn đã có unit test của riêng nó).
 */
const fakeVerifier = {
  async verify(idToken: string): Promise<GoogleIdentity> {
    const [kind, sub, email, verified] = idToken.split(':');
    if (kind !== 'ok') throw googleTokenInvalid();
    return { sub, email, emailVerified: verified !== 'false', name: 'Nguyễn Văn An' };
  },
};

describe('Đăng nhập Google với hạ tầng thật', () => {
  let x: IdentityInfra;
  const PASSWORD = 'Mat-khau-du-dai-1';
  const email = () => `gg-${randomUUID().slice(0, 8)}@example.com`;
  const sub = () => `sub-${randomUUID()}`;
  const token = (s: string, e: string, verified = true) => `ok:${s}:${e}:${verified}`;
  const google = (idToken: string, role?: string) =>
    x.t
      .http()
      .post('/api/v1/auth/google')
      .send(role ? { idToken, role } : { idToken });
  const userRow = async (e: string) =>
    (await x.pg.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [e])).rows[0];
  const linkRows = async (userId: string) =>
    (await x.pg.query(`SELECT * FROM user_identities WHERE user_id = $1`, [userId])).rows;

  beforeAll(async () => {
    x = await startIdentityInfra({
      env: { GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com' },
      overrides: [{ token: GOOGLE_ID_TOKEN_VERIFIER, value: fakeVerifier }],
    });
  });
  afterAll(async () => {
    await x?.close();
  });

  describe('test 20: tài khoản mới', () => {
    it('thiếu role -> 400 IDENTITY_ROLE_REQUIRED, không tạo gì', async () => {
      const e = email();
      const res = await google(token(sub(), e));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDENTITY_ROLE_REQUIRED');
      expect(await userRow(e)).toBeUndefined();
    });

    it('role ADMIN -> 400 (DTO chặn, BR-01), không tạo gì', async () => {
      const e = email();
      const res = await google(token(sub(), e), 'ADMIN');
      expect(res.status).toBe(400);
      expect(await userRow(e)).toBeUndefined();
    });

    it('có role -> 200 cặp token; user ACTIVE, password_hash null, email_verified_at; liên kết Google; event identity.registered khớp contract', async () => {
      const e = email();
      const s = sub();
      const res = await google(token(s, e.toUpperCase()), 'LANDLORD');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      const user = await userRow(e);
      expect(user).toMatchObject({
        email: e,
        role: 'LANDLORD',
        status: 'ACTIVE',
        password_hash: null,
        full_name: 'Nguyễn Văn An',
      });
      expect(user.email_verified_at).toBeInstanceOf(Date);
      expect(await linkRows(user.id)).toEqual([
        expect.objectContaining({ provider: 'google', provider_user_id: s }),
      ]);

      const events = (
        await x.pg.query(
          `SELECT envelope FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
          [user.id],
        )
      ).rows;
      expect(events).toHaveLength(1);
      expect(events[0].envelope.payload).toEqual({
        userId: user.id,
        email: e,
        fullName: 'Nguyễn Văn An',
        role: 'LANDLORD',
      });
      expect(() =>
        expectEventMatchesContract({ ...events[0].envelope, producer: 'identity' }),
      ).not.toThrow();
    });

    it('token cấp ra dùng được: /me đúng người; refresh xoay vòng được; đăng nhập bằng mật khẩu bị từ chối (chưa có mật khẩu)', async () => {
      const e = email();
      const { accessToken, refreshToken } = (await google(token(sub(), e), 'TENANT')).body.data;
      const me = await x.t
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(me.body.data).toMatchObject({ email: e, role: 'TENANT', status: 'ACTIVE' });
      expect((await x.t.http().post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(
        200,
      );

      const pw = await x.t.http().post('/api/v1/auth/login').send({ email: e, password: PASSWORD });
      expect(pw.status).toBe(401);
      expect(pw.body.error.code).toBe('IDENTITY_INVALID_CREDENTIALS');
    });

    it('lần hai cùng sub: đăng nhập tiếp, KHÔNG tạo thêm user, liên kết hay event, role trong body bị bỏ qua', async () => {
      const e = email();
      const s = sub();
      await google(token(s, e), 'TENANT');
      const user = await userRow(e);

      const again = await google(token(s, e), 'LANDLORD');

      expect(again.status).toBe(200);
      expect((await userRow(e)).role).toBe('TENANT');
      expect(await linkRows(user.id)).toHaveLength(1);
      const events = await x.pg.query(
        `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
        [user.id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('5 request đồng thời cùng sub, user mới: tất cả 200, đúng một user, một liên kết, một event', async () => {
      const e = email();
      const s = sub();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => google(token(s, e), 'TENANT')),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

      const users = await x.pg.query(`SELECT id FROM users WHERE lower(email) = $1`, [e]);
      expect(users.rowCount).toBe(1);
      expect(await linkRows(users.rows[0].id)).toHaveLength(1);
      const events = await x.pg.query(
        `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'email' = $1`,
        [e],
      );
      expect(events.rowCount).toBe(1);
    });

    it('số truy vấn DB: tài khoản mới tối đa 5 (SELECT liên kết, SELECT email, INSERT users, INSERT liên kết, INSERT outbox)', async () => {
      x.queries.length = 0;
      expect((await google(token(sub(), email()), 'TENANT')).status).toBe(200);
      expect(x.queries).toHaveLength(5);
    });
  });

  describe('token không hợp lệ', () => {
    it('token sai -> 401 IDENTITY_GOOGLE_TOKEN_INVALID', async () => {
      const res = await google('bad:token');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('IDENTITY_GOOGLE_TOKEN_INVALID');
    });

    it('email_verified = false -> 401, không tạo gì', async () => {
      const e = email();
      const res = await google(token(sub(), e, false), 'TENANT');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('IDENTITY_GOOGLE_TOKEN_INVALID');
      expect(await userRow(e)).toBeUndefined();
    });

    it('thiếu idToken -> 400 VALIDATION_FAILED', async () => {
      const res = await x.t.http().post('/api/v1/auth/google').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('test 21: email đã có tài khoản', () => {
    async function register(over: Record<string, unknown> = {}) {
      const e = email();
      const res = await x.t
        .http()
        .post('/api/v1/auth/register')
        .send({
          email: e,
          password: PASSWORD,
          fullName: 'Trần Thị Bình',
          role: 'LANDLORD',
          ...over,
        });
      return { email: e, id: res.body.data.id as string };
    }

    it('PENDING_VERIFICATION -> liên kết, ACTIVE, email_verified_at, password_hash = null, vai trò giữ nguyên; đăng nhập bằng mật khẩu cũ bị từ chối', async () => {
      const u = await register();
      expect((await userRow(u.email)).status).toBe('PENDING_VERIFICATION');

      const res = await google(token(sub(), u.email), 'TENANT'); // role trong body không đổi vai trò

      expect(res.status).toBe(200);
      const after = await userRow(u.email);
      expect(after).toMatchObject({ status: 'ACTIVE', password_hash: null, role: 'LANDLORD' });
      expect(after.email_verified_at).toBeInstanceOf(Date);
      expect(await linkRows(u.id)).toHaveLength(1);

      const pw = await x.t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: PASSWORD });
      expect(pw.status).toBe(401);
    });

    it('không có event identity.registered thứ hai khi chỉ liên kết', async () => {
      const u = await register();
      await google(token(sub(), u.email));
      const events = await x.pg.query(
        `SELECT 1 FROM outbox_events WHERE envelope->'payload'->>'userId' = $1`,
        [u.id],
      );
      expect(events.rowCount).toBe(1); // chỉ event của lúc đăng ký
    });

    it('tài khoản ACTIVE có mật khẩu: liên kết, GIỮ mật khẩu và vai trò, không cần role', async () => {
      const u = await register();
      await x.pg.query(
        `UPDATE users SET status = 'ACTIVE', email_verified_at = now() WHERE id = $1`,
        [u.id],
      );

      const res = await google(token(sub(), u.email));

      expect(res.status).toBe(200);
      expect(await userRow(u.email)).toMatchObject({ status: 'ACTIVE', role: 'LANDLORD' });
      expect((await userRow(u.email)).password_hash).toMatch(/^\$argon2id\$/);
      const pw = await x.t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: u.email, password: PASSWORD });
      expect(pw.status).toBe(200);
    });

    it('tài khoản bị khóa -> 403 IDENTITY_ACCOUNT_LOCKED, KHÔNG liên kết', async () => {
      const u = await register();
      await x.pg.query(`UPDATE users SET status = 'LOCKED' WHERE id = $1`, [u.id]);
      const res = await google(token(sub(), u.email));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('IDENTITY_ACCOUNT_LOCKED');
      expect(await linkRows(u.id)).toHaveLength(0);
    });

    it('đã liên kết rồi bị khóa -> 403, không cấp phiên', async () => {
      const e = email();
      const s = sub();
      await google(token(s, e), 'TENANT');
      await x.pg.query(`UPDATE users SET status = 'LOCKED' WHERE lower(email) = $1`, [e]);
      const res = await google(token(s, e));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('IDENTITY_ACCOUNT_LOCKED');
    });

    it('test 21a: tài khoản đã liên kết sub Google khác -> 401 IDENTITY_GOOGLE_TOKEN_INVALID, không thêm liên kết, tài khoản giữ nguyên', async () => {
      const e = email();
      const s1 = sub();
      expect((await google(token(s1, e), 'TENANT')).status).toBe(200);
      const before = await userRow(e);

      const res = await google(token(sub(), e)); // cùng email, sub khác

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('IDENTITY_GOOGLE_TOKEN_INVALID');
      const links = await linkRows(before.id);
      expect(links).toHaveLength(1);
      expect(links[0].provider_user_id).toBe(s1);
      expect(await userRow(e)).toEqual(before);
      // sub cũ vẫn đăng nhập được
      expect((await google(token(s1, e))).status).toBe(200);
    });

    it('số truy vấn DB: đã liên kết 2; liên kết tài khoản có sẵn tối đa 4', async () => {
      const e = email();
      const s = sub();
      await google(token(s, e), 'TENANT');
      x.queries.length = 0;
      await google(token(s, e));
      expect(x.queries).toHaveLength(2);

      const u = await register();
      x.queries.length = 0;
      await google(token(sub(), u.email));
      expect(x.queries.length).toBeLessThanOrEqual(4);
    });
  });
});
