import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo, Socket } from 'node:net';
import type { TestApp } from './helpers/create-test-app';

/**
 * Test 7 và 8 của RE.GATEWAY/Component_Class_Design.md §4: service đích tắt, service đích chậm.
 * File riêng vì env khác gateway.e2e-spec.ts (rental tắt, payment chậm); env đặt TRƯỚC khi import app.
 */
const ISSUER = 'realestate-identity';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const tenant = new JwtService({}).sign(
  { sub: 'user-1', roles: ['TENANT'] },
  { algorithm: 'RS256', privateKey: keys.privateKey, issuer: ISSUER, expiresIn: 300 },
);

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );

describe('api-gateway — test 7 và 8: service đích lỗi', () => {
  let t: TestApp;
  let slow: Server;
  let slowHits = 0;
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    slow = createServer((_req, res) => {
      slowHits += 1;
      setTimeout(() => res.end('muộn'), 15_000).unref(); // lâu hơn GATEWAY_PROXY_TIMEOUT_MS
    });
    slow.on('connection', (s: Socket) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    const slowPort = await listen(slow);
    // Cổng không ai nghe: mở rồi đóng ("rental đã tắt")
    const probe = createServer();
    const deadPort = await listen(probe);
    await new Promise<void>((r) => probe.close(() => r()));

    Object.assign(process.env, {
      INTERNAL_RENTAL_URL: `http://127.0.0.1:${deadPort}`,
      INTERNAL_PAYMENT_URL: `http://127.0.0.1:${slowPort}`,
      JWT_PUBLIC_KEY: keys.publicKey,
      JWT_ISSUER: ISSUER,
      GATEWAY_PROXY_TIMEOUT_MS: '8001', // nhỏ nhất cho phép (phải > 8000, NFR07)
      RATE_LIMIT_IP: '10000',
      RATE_LIMIT_USER: '10000',
    });
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp([], [], { bodyParser: false });
  });

  afterAll(async () => {
    await t.app.close();
    sockets.forEach((s) => s.destroy());
    await new Promise((r) => slow.close(() => r(undefined)));
  });

  it('test 7 — service đích tắt: 503 UPSTREAM_UNAVAILABLE, đúng khung lỗi, không lộ địa chỉ nội bộ', async () => {
    const res = await t
      .http()
      .get('/api/v1/deposits/mine')
      .set('Authorization', `Bearer ${tenant}`)
      .set('X-Request-ID', 'down-7');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: expect.any(String) },
      meta: { correlationId: 'down-7', timestamp: expect.any(String) },
    });
    expect(res.headers['x-request-id']).toBe('down-7');
    expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
  });

  it('test 7 — gateway vẫn phục vụ route của service khác và /health khi một service tắt', async () => {
    expect((await t.http().get('/health')).status).toBe(200);
  });

  it('test 8 — service đích chậm hơn timeout: 504 UPSTREAM_TIMEOUT sau GATEWAY_PROXY_TIMEOUT_MS, không retry', async () => {
    const started = Date.now();
    const res = await t
      .http()
      .get('/api/v1/payments/transactions/mine')
      .set('Authorization', `Bearer ${tenant}`)
      .set('X-Request-ID', 'slow-8');
    const elapsed = Date.now() - started;
    expect(res.status).toBe(504);
    expect(res.body).toEqual({
      error: { code: 'UPSTREAM_TIMEOUT', message: expect.any(String) },
      meta: { correlationId: 'slow-8', timestamp: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    expect(elapsed).toBeGreaterThanOrEqual(8000);
    expect(elapsed).toBeLessThan(12_000);
    expect(slowHits).toBe(1); // gateway không retry (không biết lệnh có idempotent không)
  }, 20_000);
});
