import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../src/common/auth/public.decorator';
import { createTestApp, TestApp } from './helpers/create-test-app';

@Public()
@Controller('test-ip')
class TestIpController {
  @Get()
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

describe('app.setup của api-gateway — trust proxy = false (RE.GATEWAY Component_Class_Design §6)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([TestIpController]);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('Express được đặt rõ ràng: không tin X-Forwarded-For', () => {
    const express = t.app.getHttpAdapter().getInstance() as { get: (key: string) => unknown };
    expect(express.get('trust proxy')).toBe(false);
  });

  it('client tự đặt X-Forwarded-For không đổi được IP dùng để đếm rate limit', async () => {
    const plain = await t.http().get('/api/v1/test-ip');
    const spoofed = await t.http().get('/api/v1/test-ip').set('X-Forwarded-For', '203.0.113.7');
    expect(spoofed.status).toBe(200);
    expect(spoofed.body.data.ip).toBe(plain.body.data.ip);
    expect(spoofed.body.data.ip).not.toContain('203.0.113.7');
  });
});

describe('app.setup của api-gateway — /internal/* và CORS (RE.GATEWAY Component_Class_Design §3.1)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([TestIpController]);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)(
    '%s /internal/listings/x -> 404 GATEWAY_ROUTE_NOT_FOUND kèm X-Request-ID',
    async (method) => {
      const res = await t.http()[method]('/internal/listings/x').set('X-Request-ID', 'int-1');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: 'GATEWAY_ROUTE_NOT_FOUND', message: expect.any(String) },
        meta: { correlationId: 'int-1', timestamp: expect.any(String) },
      });
      expect(res.headers['x-request-id']).toBe('int-1');
    },
  );

  it('preflight từ origin mặc định (http://localhost:3000) được chấp nhận, kể cả Authorization và Idempotency-Key', async () => {
    const res = await t
      .http()
      .options('/api/v1/deposits')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const allowed = String(res.headers['access-control-allow-headers']).toLowerCase();
    for (const h of ['authorization', 'content-type', 'idempotency-key', 'x-request-id']) {
      expect(allowed).toContain(h);
    }
    expect(String(res.headers['access-control-allow-methods'])).toContain('POST');
  });

  it('origin lạ không được cấp Access-Control-Allow-Origin', async () => {
    const res = await t
      .http()
      .options('/api/v1/deposits')
      .set('Origin', 'https://ke-tan-cong.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('trình duyệt đọc được X-Request-ID của response (để báo lỗi kèm mã truy vết)', async () => {
    const res = await t.http().get('/api/v1/test-ip').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(String(res.headers['access-control-expose-headers']).toLowerCase()).toContain(
      'x-request-id',
    );
  });
});
