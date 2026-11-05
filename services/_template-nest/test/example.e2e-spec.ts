import { JwtService } from '@nestjs/jwt';
import { createTestApp, TestApp, UUID_V4 } from './helpers/create-test-app';

/**
 * Kiểm tra các tiêu chí "XONG" của template trên module mẫu: /health, định dạng lỗi,
 * correlation ID đi xuyên (header + body + log), prefix /api/v1 và /internal, JWT/roles.
 */
const SECRET = 'bi-mat-dev-toi-thieu-16-ky-tu';
const jwt = new JwtService({});
const token = (claims: Record<string, unknown>) =>
  jwt.sign(claims, { secret: SECRET, algorithm: 'HS256', expiresIn: '1h' });

describe('Module mẫu example (tiêu chí XONG của template)', () => {
  let t: TestApp;

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
    delete process.env.JWT_SECRET;
  });

  const create = (name: string, priceVnd = 3500000) =>
    t.http().post('/api/v1/examples').send({ name, priceVnd });

  describe('GET /health', () => {
    it.each(['/health', '/api/v1/health'])('%s trả 200 và đúng format', async (path) => {
      const res = await t.http().get(path);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'template-nest-test', checks: {} });
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.version).toBe('string');
    });
  });

  describe('định dạng lỗi { code, message, details, correlationId }', () => {
    it('lỗi nghiệp vụ 409 có nghĩa (trùng tên) kèm details', async () => {
      await create('Phòng A101');
      const res = await t
        .http()
        .post('/api/v1/examples')
        .set('X-Request-ID', 'err-409')
        .send({ name: 'phòng a101', priceVnd: 1 });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        code: 'EXAMPLE_NAME_TAKEN',
        message: 'Tên "phòng a101" đã tồn tại',
        details: { name: 'phòng a101' },
        correlationId: 'err-409',
      });
    });

    it('404 nghiệp vụ và id sai định dạng', async () => {
      const missing = await t.http().get('/api/v1/examples/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11');
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('EXAMPLE_NOT_FOUND');
      expect(missing.body.correlationId).toBeDefined();

      const bad = await t.http().get('/api/v1/examples/khong-phai-uuid');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('BAD_REQUEST');
    });

    it('tiền phải là số nguyên VND: số thập phân bị từ chối', async () => {
      const res = await create('Phòng B202', 1500000.5);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details).toEqual([
        { field: 'priceVnd', errors: ['priceVnd must be an integer number'] },
      ]);
    });
  });

  describe('correlation ID đi xuyên', () => {
    it('X-Request-ID: abc-123 có ở response header, body lỗi và log', async () => {
      const res = await t
        .http()
        .get('/api/v1/examples/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11')
        .set('X-Request-ID', 'abc-123');
      expect(res.headers['x-request-id']).toBe('abc-123');
      expect(res.body.correlationId).toBe('abc-123');
      const logged = t.logRecords().filter((r) => r.correlationId === 'abc-123');
      expect(logged.length).toBeGreaterThan(0);
      expect(logged.some((r) => r.statusCode === 404)).toBe(true);
    });

    it('không gửi header: tự sinh UUID v4 và dùng nhất quán', async () => {
      const res = await t.http().get('/api/v1/examples/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11');
      expect(res.headers['x-request-id']).toMatch(UUID_V4);
      expect(res.body.correlationId).toBe(res.headers['x-request-id']);
    });
  });

  describe('prefix /api/v1 và /internal', () => {
    it('bản ghi mới: id UUID, tiền số nguyên, thời gian UTC ISO-8601', async () => {
      const res = await create('Phòng C303', 4200000);
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number.isInteger(res.body.priceVnd)).toBe(true);
      expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('API công khai phải có prefix /api/v1', async () => {
      expect((await t.http().get('/examples')).status).toBe(404);
      expect((await t.http().get('/api/v1/examples')).status).toBe(200);
    });

    it('API nội bộ nằm ở /internal/... (không prefix) và KHÔNG có ở /api/v1/internal', async () => {
      const created = await create('Phòng D404');
      const internal = await t.http().get(`/internal/examples/${created.body.id}`);
      expect(internal.status).toBe(200);
      expect(internal.body.name).toBe('Phòng D404');
      expect(internal.headers['x-request-id']).toBeDefined();
      const prefixed = await t.http().get(`/api/v1/internal/examples/${created.body.id}`);
      expect(prefixed.status).toBe(404);
    });
  });

  describe('JWT và vai trò', () => {
    it('/examples/me cần token', async () => {
      expect((await t.http().get('/api/v1/examples/me')).status).toBe(401);
      const ok = await t
        .http()
        .get('/api/v1/examples/me')
        .set('Authorization', `Bearer ${token({ sub: 'u-1', roles: ['TENANT'] })}`);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ sub: 'u-1', roles: ['TENANT'] });
    });

    it('/examples/admin-only: ADMIN được, vai trò khác bị 403', async () => {
      const admin = await t
        .http()
        .get('/api/v1/examples/admin-only')
        .set('Authorization', `Bearer ${token({ sub: 'boss', roles: ['ADMIN'] })}`);
      expect(admin.status).toBe(200);
      expect(admin.body.message).toContain('boss');

      const tenant = await t
        .http()
        .get('/api/v1/examples/admin-only')
        .set('Authorization', `Bearer ${token({ sub: 't', roles: ['TENANT'] })}`);
      expect(tenant.status).toBe(403);
      expect(tenant.body.code).toBe('FORBIDDEN_ROLE');
    });
  });

  it('endpoint @Idempotent khi chưa bật Redis trả 503 IDEMPOTENCY_UNAVAILABLE', async () => {
    const res = await t
      .http()
      .post('/api/v1/examples/idempotent')
      .set('Idempotency-Key', 'k-1')
      .send({ name: 'Phòng E505', priceVnd: 1 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IDEMPOTENCY_UNAVAILABLE');
  });
});
