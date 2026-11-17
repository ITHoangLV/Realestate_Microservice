import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo, Socket } from 'node:net';
import type { TestApp } from './helpers/create-test-app';

/**
 * Test 10 của RE.GATEWAY/Component_Class_Design.md §4: rate limit hai nhánh, với GIÁ TRỊ MẶC ĐỊNH của thiết kế
 * (RATE_LIMIT_IP=100, RATE_LIMIT_USER=300, cửa sổ 60 giây; không đặt biến nào trong file này).
 * Một throttler đặt sau AccessGuard: có người dùng thì đếm theo sub, không có (public, payos) thì theo IP.
 */
const ISSUER = 'realestate-identity';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const signer = new JwtService({});
const bearer = (sub: string) => ({
  Authorization: `Bearer ${signer.sign(
    { sub, roles: ['TENANT'] },
    { algorithm: 'RS256', privateKey: keys.privateKey, issuer: ISSUER, expiresIn: 600 },
  )}`,
});

describe('api-gateway — test 10: rate limit', () => {
  let t: TestApp;
  let upstream: Server;
  const sockets = new Set<Socket>();
  let hits = 0;

  beforeAll(async () => {
    upstream = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"data":{"ok":true},"meta":{"correlationId":"u","timestamp":"u"}}');
    });
    upstream.on('connection', (s: Socket) => {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
    });
    const port = await new Promise<number>((resolve) =>
      upstream.listen(0, '127.0.0.1', () => resolve((upstream.address() as AddressInfo).port)),
    );
    const url = `http://127.0.0.1:${port}`;
    Object.assign(process.env, {
      INTERNAL_IDENTITY_URL: url,
      INTERNAL_LISTING_URL: url,
      INTERNAL_RENTAL_URL: url,
      INTERNAL_PAYMENT_URL: url,
      INTERNAL_NOTIFICATION_URL: url,
      JWT_PUBLIC_KEY: keys.publicKey,
      JWT_ISSUER: ISSUER,
    });
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp([], [], { bodyParser: false });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.destroy());
    await t.app.close();
    await new Promise((r) => upstream.close(() => r(undefined)));
  });

  const statuses = async (n: number, send: (i: number) => Promise<{ status: number }>) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await send(i)).status);
    return out;
  };

  it('có token: giới hạn theo sub là 300; 100 request đầu (ngưỡng IP) không bị chặn, request thứ 301 → 429', async () => {
    const send = () => t.http().get('/api/v1/deposits/mine').set(bearer('user-A'));
    const first300 = await statuses(300, send);
    expect(first300.every((s) => s === 200)).toBe(true);
    const over = await send();
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(over.body.meta).toEqual({
      correlationId: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  }, 60_000);

  it('cùng IP nhưng người dùng khác: bộ đếm riêng, không bị ảnh hưởng', async () => {
    const res = await t.http().get('/api/v1/deposits/mine').set(bearer('user-B'));
    expect(res.status).toBe(200);
  });

  it('ẩn danh: bộ đếm IP còn nguyên dù user-A đã gửi 300 request từ cùng IP; request thứ 101 → 429', async () => {
    const send = () => t.http().get('/api/v1/listings');
    const first100 = await statuses(100, send);
    expect(first100.every((s) => s === 200)).toBe(true);
    const over = await send();
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('TOO_MANY_REQUESTS');
  }, 60_000);

  it('ẩn danh không né được bằng X-Forwarded-For (gateway không tin header này)', async () => {
    const res = await t.http().get('/api/v1/listings').set('X-Forwarded-For', '198.51.100.77');
    expect(res.status).toBe(429);
  });

  it('webhook payOS (không có người dùng) cũng đếm theo IP; request bị chặn không tới service', async () => {
    const before = hits;
    const res = await t.http().post('/api/v1/payments/payos/webhook').send('{}');
    expect(res.status).toBe(429);
    expect(hits).toBe(before);
  });

  it('request có token vẫn đi bình thường khi IP ẩn danh đã bị chặn', async () => {
    const res = await t.http().get('/api/v1/deposits/mine').set(bearer('user-B'));
    expect(res.status).toBe(200);
  });
});
