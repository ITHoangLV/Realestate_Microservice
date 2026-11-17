import { JwtService } from '@nestjs/jwt';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo, Socket } from 'node:net';
import type { TestApp } from './helpers/create-test-app';

/**
 * Test bắt buộc 1–12 của RE.GATEWAY/Component_Class_Design.md §4 (test 7, 8 ở gateway-upstream-failure.e2e-spec.ts; test 10 ở gateway-rate-limit.e2e-spec.ts).
 * Gateway chạy thật (AppModule + configureApp, bodyParser: false) trước các service đích giả là HTTP server thật.
 * Env đặt TRƯỚC khi import app vì ConfigModule chốt giá trị lúc import (gotchas.md).
 */

interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const ISSUER = 'realestate-identity';
const rsa = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
const mine = rsa();
const attacker = rsa();
const signer = new JwtService({});
const token = (
  roles: string[],
  { key = mine.privateKey, expiresIn = 300 }: { key?: string; expiresIn?: number } = {},
): string =>
  signer.sign(
    { sub: 'user-1', roles },
    { algorithm: 'RS256', privateKey: key, issuer: ISSUER, expiresIn },
  );
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );

describe('api-gateway — test 1–6, 9, 11, 12 (RE.GATEWAY Component_Class_Design §4)', () => {
  let t: TestApp;
  let upstream: Server;
  const sockets = new Set<Socket>();
  let seen: Seen[] = [];
  let upgrades: string[] = [];

  beforeAll(async () => {
    // Service đích giả (identity, listing, payment webhook, notification dùng chung một server)
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
        const path = new URL(req.url ?? '/', 'http://x').pathname;
        const meta = { correlationId: String(req.headers['x-request-id']), timestamp: 'upstream' };
        if (path === '/api/v1/payments/payos/webhook') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return void res.end(
            JSON.stringify({
              data: { sha256: createHash('sha256').update(body).digest('hex') },
              meta,
            }),
          );
        }
        if (path === '/api/v1/deposits') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return void res.end(
            JSON.stringify({
              error: {
                code: 'DEPOSIT_ALREADY_PAID',
                message: 'Đơn đặt cọc đã được thanh toán',
                details: { depositId: 'd-1' },
              },
              meta,
            }),
          );
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: { from: 'upstream', path }, meta }));
      });
    });
    upstream.on('upgrade', (req, socket) => {
      upgrades.push(req.url ?? '');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
      socket.on('data', (d) => socket.write(Buffer.concat([Buffer.from('echo:'), d])));
      socket.on('error', () => undefined);
    });
    upstream.on('connection', (sock: Socket) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
    });
    const upstreamPort = await listen(upstream);

    Object.assign(process.env, {
      INTERNAL_IDENTITY_URL: `http://127.0.0.1:${upstreamPort}`,
      INTERNAL_LISTING_URL: `http://127.0.0.1:${upstreamPort}`,
      INTERNAL_RENTAL_URL: `http://127.0.0.1:${upstreamPort}`,
      INTERNAL_PAYMENT_URL: `http://127.0.0.1:${upstreamPort}`,
      INTERNAL_NOTIFICATION_URL: `http://127.0.0.1:${upstreamPort}`,
      JWT_PUBLIC_KEY: mine.publicKey,
      JWT_ISSUER: ISSUER,
      RATE_LIMIT_IP: '10000',
      RATE_LIMIT_USER: '10000',
    });
    const { createTestApp } = await import('./helpers/create-test-app');
    t = await createTestApp([], [], { bodyParser: false });
  });

  afterAll(async () => {
    // Socket đã nâng cấp WebSocket giữ server mở: hủy trước, rồi mới đóng app
    sockets.forEach((s) => s.destroy());
    await t.app.close();
    await new Promise((r) => upstream.close(() => r(undefined)));
  });

  beforeEach(() => {
    seen = [];
    upgrades = [];
  });

  describe('test 1 — /internal/* từ ngoài', () => {
    it.each(['get', 'post', 'delete'] as const)(
      '%s /internal/listings/x -> 404, không gọi service nào',
      async (method) => {
        const res = await t.http()[method]('/internal/listings/x');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('GATEWAY_ROUTE_NOT_FOUND');
        expect(seen).toEqual([]);
      },
    );
  });

  describe('test 2 — token sai chữ ký', () => {
    it('ký bằng khóa khác -> 401 AUTH_TOKEN_INVALID, không gọi service', async () => {
      const res = await t
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(token(['TENANT'], { key: attacker.privateKey })));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
      expect(seen).toEqual([]);
    });

    it('lệnh kiểm chứng của task: "Bearer sai" -> 401 AUTH_TOKEN_INVALID', async () => {
      const res = await t.http().get('/api/v1/auth/me').set('Authorization', 'Bearer sai');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
      expect(seen).toEqual([]);
    });

    it('route cần token mà không gửi -> 401 AUTH_TOKEN_MISSING', async () => {
      const res = await t.http().get('/api/v1/deposits/mine');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
      expect(seen).toEqual([]);
    });
  });

  describe('test 3 — token hết hạn', () => {
    it('401 AUTH_TOKEN_EXPIRED, không gọi service', async () => {
      const res = await t
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(token(['TENANT'], { expiresIn: -30 })));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
      expect(seen).toEqual([]);
    });
  });

  describe('test 4 — sai vai trò mức tuyến', () => {
    it('TENANT gọi /api/v1/admin/* -> 403 FORBIDDEN_ROLE, không gọi service', async () => {
      for (const path of ['/api/v1/admin/users', '/api/v1/admin/listings/l-1/approve']) {
        const res = await t
          .http()
          .post(path)
          .set(bearer(token(['TENANT'])));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
      }
      expect(seen).toEqual([]);
    });

    it('ADMIN gọi /api/v1/admin/users được chuyển tiếp', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/users')
        .set(bearer(token(['ADMIN'])));
      expect(res.status).toBe(200);
      expect(seen).toHaveLength(1);
    });

    it('GET /api/v1/listings/mine cần LANDLORD (không bị coi là public)', async () => {
      expect((await t.http().get('/api/v1/listings/mine')).status).toBe(401);
      const tenant = await t
        .http()
        .get('/api/v1/listings/mine')
        .set(bearer(token(['TENANT'])));
      expect(tenant.status).toBe(403);
      expect(seen).toEqual([]);
    });

    // Express định tuyến không phân biệt hoa thường: đổi hoa/thường không được làm rơi xuống dòng public
    it.each(['/api/v1/listings/MINE', '/API/V1/LISTINGS/Mine'])(
      'GET %s cần LANDLORD: 401 không token, 403 với TENANT, không tới service',
      async (path) => {
        const anon = await t.http().get(path);
        expect([path, anon.status, anon.body.error.code]).toEqual([
          path,
          401,
          'AUTH_TOKEN_MISSING',
        ]);
        const tenant = await t
          .http()
          .get(path)
          .set(bearer(token(['TENANT'])));
        expect(tenant.status).toBe(403);
        expect(seen).toEqual([]);
      },
    );

    it('/API/V1/ADMIN/users/x: 401 không token, 403 với TENANT; ADMIN qua và URL gốc đi nguyên tới service', async () => {
      const path = '/API/V1/ADMIN/users/x';
      expect((await t.http().get(path)).status).toBe(401);
      const tenant = await t
        .http()
        .get(path)
        .set(bearer(token(['TENANT'])));
      expect(tenant.status).toBe(403);
      expect(seen).toEqual([]);
      const admin = await t
        .http()
        .get(path)
        .set(bearer(token(['ADMIN'])));
      expect(admin.status).toBe(200);
      expect(seen[0].url).toBe(path); // gateway không đổi đường dẫn chuyển tiếp
    });
  });

  describe('test 5 — route public không token', () => {
    it('được chuyển tiếp, response của service đi nguyên văn (không bọc lần hai)', async () => {
      const res = await t.http().get('/api/v1/listings?city=hanoi');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: { from: 'upstream', path: '/api/v1/listings' },
        meta: { correlationId: expect.any(String), timestamp: 'upstream' },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe('/api/v1/listings?city=hanoi');
      expect(seen[0].headers.authorization).toBeUndefined();
    });

    it('route cần token: Authorization đi nguyên tới service để service kiểm lại', async () => {
      const bearerToken = token(['TENANT']);
      const res = await t.http().get('/api/v1/auth/me').set(bearer(bearerToken));
      expect(res.status).toBe(200);
      expect(seen[0].headers.authorization).toBe(`Bearer ${bearerToken}`);
    });

    it('không khớp bảng định tuyến -> 404 GATEWAY_ROUTE_NOT_FOUND, không gọi service', async () => {
      const res = await t.http().get('/api/v1/khong-co');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('GATEWAY_ROUTE_NOT_FOUND');
      expect(seen).toEqual([]);
    });

    it('đường dẫn ngoài /api/v1 cũng trả GATEWAY_ROUTE_NOT_FOUND (không phải NOT_FOUND mặc định của Nest)', async () => {
      for (const path of ['/foo', '/listings', '/api/v1', '/api/v2/listings', '/ws']) {
        const res = await t.http().get(path);
        expect([path, res.status, res.body.error?.code]).toEqual([
          path,
          404,
          'GATEWAY_ROUTE_NOT_FOUND',
        ]);
        expect(res.body.meta).toEqual({
          correlationId: expect.any(String),
          timestamp: expect.any(String),
        });
      }
      expect(seen).toEqual([]);
    });

    it('/health do chính gateway trả, không cần token và không gọi service', async () => {
      const res = await t.http().get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', service: expect.any(String) });
      expect(seen).toEqual([]);
    });
  });

  describe('test 6 — webhook payOS', () => {
    it('không token, body nguyên vẹn từng byte (chữ ký tính trên body)', async () => {
      const body = Buffer.concat([
        Buffer.from(
          '{ "code":"00",  "data":{"orderCode": 1234 ,"amount":2000000},\n"signature":"abc" }',
        ),
        Buffer.from([0xff, 0x00, 0x80]),
      ]);
      const res = await t
        .http()
        .post('/api/v1/payments/payos/webhook')
        .set('Content-Type', 'application/json')
        // superagent mặc định JSON-hóa Buffer khi Content-Type là json; giữ nguyên byte như payOS gửi
        // (kiểu của @types chỉ khai báo trả string; thực tế superagent chấp nhận Buffer)
        .serialize(((data: Buffer) => data) as unknown as (obj: unknown) => string)
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.data.sha256).toBe(createHash('sha256').update(body).digest('hex'));
      expect(seen[0].body.equals(body)).toBe(true);
      expect(seen[0].headers.authorization).toBeUndefined();
    });
  });

  describe('test 9 — X-Request-ID', () => {
    it('giống nhau ở response, log gateway và service đích', async () => {
      const res = await t.http().get('/api/v1/listings').set('X-Request-ID', 'abc-123');
      expect(res.headers['x-request-id']).toBe('abc-123');
      expect(seen[0].headers['x-request-id']).toBe('abc-123');
      expect(res.body.meta.correlationId).toBe('abc-123'); // service đích nhận đúng ID
      // log của gateway: một dòng access log cho request này, mang cùng correlationId
      const line = t
        .logRecords()
        .find((r) => r.url === '/api/v1/listings' && r.correlationId === 'abc-123');
      expect(line).toMatchObject({ method: 'GET', statusCode: 200, correlationId: 'abc-123' });
    });

    it('không gửi X-Request-ID: gateway sinh và truyền cho service đích, trùng với response', async () => {
      const res = await t.http().get('/api/v1/listings');
      const id = res.headers['x-request-id'];
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(seen[0].headers['x-request-id']).toBe(id);
    });

    it('ID có ký tự lạ bị bỏ, gateway sinh ID mới (không chèn được vào log và header)', async () => {
      const res = await t.http().get('/api/v1/listings').set('X-Request-ID', 'a b;c');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(seen[0].headers['x-request-id']).toBe(res.headers['x-request-id']);
    });
  });

  describe('test 11 — lỗi của service', () => {
    it('409 được chuyển nguyên { error, meta }', async () => {
      const res = await t
        .http()
        .post('/api/v1/deposits')
        .set(bearer(token(['TENANT'])))
        .set('Content-Type', 'application/json')
        .send({ listingId: 'l-1' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: {
          code: 'DEPOSIT_ALREADY_PAID',
          message: 'Đơn đặt cọc đã được thanh toán',
          details: { depositId: 'd-1' },
        },
        meta: { correlationId: expect.any(String), timestamp: 'upstream' },
      });
      expect(seen[0].body.toString()).toBe('{"listingId":"l-1"}');
    });
  });

  describe('test 12 — nâng cấp WebSocket /ws', () => {
    let port: number;

    beforeAll(async () => {
      await t.app.listen(0, '127.0.0.1');
      t.app.getHttpServer().on('connection', (s: Socket) => {
        sockets.add(s);
        s.on('close', () => sockets.delete(s));
      });
      port = (t.app.getHttpServer().address() as AddressInfo).port;
    });

    function upgrade(path: string, headers = ''): Promise<{ status: string; echo: boolean }> {
      return new Promise((resolve) => {
        const socket = new Socket();
        let data = '';
        let status = '';
        const done = (echo: boolean) => {
          resolve({ status, echo });
          socket.destroy();
        };
        socket.connect(port, '127.0.0.1', () => {
          socket.write(
            `GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n${headers}` +
              'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
          );
        });
        socket.on('data', (d) => {
          data += d.toString();
          if (!status && data.includes('\r\n')) {
            status = data.split('\r\n')[0];
            if (status.includes('101')) socket.write('ping');
          }
          if (data.includes('echo:ping')) done(true);
        });
        socket.on('error', () => undefined);
        socket.on('close', () => done(false));
        setTimeout(() => done(false), 2000).unref();
      });
    }

    it('/ws được chuyển tới notification, không cần token ở gateway (notification kiểm ở handshake)', async () => {
      const res = await upgrade('/ws/?EIO=4&transport=websocket');
      expect(res.status).toContain('101');
      expect(res.echo).toBe(true);
      expect(upgrades).toEqual(['/ws/?EIO=4&transport=websocket']);
    });

    it('không qua AccessGuard: token sai ở handshake không bị gateway chặn', async () => {
      const res = await upgrade('/ws/?EIO=4', 'Authorization: Bearer sai\r\n');
      expect(res.status).toContain('101');
      expect(upgrades).toHaveLength(1);
    });

    it('không thể dùng nâng cấp để vòng qua AccessGuard: đường dẫn khác /ws bị từ chối', async () => {
      for (const path of ['/api/v1/admin/users', '/api/v1/deposits/mine', '/internal/x']) {
        const res = await upgrade(path);
        expect(res.status).not.toContain('101');
      }
      expect(upgrades).toEqual([]);
    });
  });
});
