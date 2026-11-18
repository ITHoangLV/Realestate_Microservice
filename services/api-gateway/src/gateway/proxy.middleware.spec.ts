import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createHash } from 'node:crypto';
import { createServer, IncomingHttpHeaders, IncomingMessage, request, Server } from 'node:http';
import { AddressInfo, Socket } from 'node:net';
import { EnvVars } from '../config/env.validation';
import { GatewayRequest } from './access.guard';
import { ProxyMiddleware } from './proxy.middleware';
import { RouteResolver } from './route-resolver';

interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const TIMEOUT_MS = 300;
// Socket đã nâng cấp WebSocket không còn thuộc HTTP server nên closeAllConnections() bỏ sót:
// tự theo dõi mọi socket để hủy khi đóng, nếu không server.close() chờ mãi.
const sockets = new WeakMap<Server, Set<Socket>>();
const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    const tracked = new Set<Socket>();
    sockets.set(server, tracked);
    server.on('connection', (s: Socket) => {
      tracked.add(s);
      s.on('close', () => tracked.delete(s));
    });
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    sockets.get(server)?.forEach((s) => s.destroy());
    server.close(() => resolve());
  });

describe('ProxyMiddleware', () => {
  let upstream: Server;
  let upstreamPort: number;
  let gateway: Server;
  let gatewayPort: number;
  let upgradesSeen: string[];
  let seen: Seen[];
  /** Dòng mà gateway "đã khớp" cho mỗi request: target do test chọn qua header x-test-target. */
  let deadPort: number;

  beforeAll(async () => {
    // Cổng chắc chắn không có ai nghe: mở rồi đóng
    const probe = createServer();
    deadPort = await listen(probe);
    await close(probe);

    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
        const url = new URL(req.url ?? '/', 'http://x');
        switch (url.pathname.split('/').pop()) {
          case 'webhook':
            res.writeHead(201, { 'Content-Type': 'application/json', 'X-Upstream': 'yes' });
            return void res.end(
              JSON.stringify({ sha256: createHash('sha256').update(body).digest('hex') }),
            );
          case 'conflict':
            res.writeHead(409, { 'Content-Type': 'application/json' });
            return void res.end(
              JSON.stringify({
                error: { code: 'DEPOSIT_ALREADY_PAID', message: 'Đơn đã thanh toán' },
                meta: { correlationId: 'up', timestamp: 't' },
              }),
            );
          case 'boom':
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return void res.end('stack trace nội bộ');
          case 'slow':
            return void setTimeout(() => res.end('muộn'), 2000).unref();
          default:
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return void res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    upstream.on('upgrade', (req, socket) => {
      upgradesSeen.push(req.url ?? '');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
      socket.on('data', (d) => socket.write(Buffer.concat([Buffer.from('echo:'), d])));
      socket.on('error', () => undefined);
    });
    upstreamPort = await listen(upstream);

    const config = {
      getOrThrow: (key: keyof EnvVars) => (key === 'GATEWAY_PROXY_TIMEOUT_MS' ? TIMEOUT_MS : key),
    } as unknown as ConfigService<EnvVars, true>;
    const resolver = {
      resolve: (_method: string, path: string) => {
        if (!/^\/(ws|api)\b/.test(path)) throw new Error('không khớp');
        return {
          service: 'notification',
          target: `http://127.0.0.1:${upstreamPort}`,
          access: 'user',
        };
      },
    } as unknown as RouteResolver;
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as PinoLogger;
    const proxy = new ProxyMiddleware(config, resolver, logger);

    gateway = createServer((req, res) => {
      const target = req.headers['x-test-target'] === 'dead' ? deadPort : upstreamPort;
      (req as GatewayRequest).originalUrl = req.url ?? '';
      (req as GatewayRequest).gatewayRoute = {
        service: 'notification',
        target: `http://127.0.0.1:${target}`,
        access: 'user',
      };
      void proxy.use(req as GatewayRequest, res, (err?: unknown) => {
        res.statusCode = 500;
        res.end(String(err ?? 'next'));
      });
    });
    gateway.on('upgrade', (req, socket, head) => proxy.upgrade(req, socket as Socket, head));
    gatewayPort = await listen(gateway);
  });

  afterAll(async () => {
    await close(gateway);
    await close(upstream);
  });

  beforeEach(() => {
    seen = [];
    upgradesSeen = [];
  });

  function call(
    method: string,
    path: string,
    options: { headers?: Record<string, string>; body?: Buffer } = {},
  ): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port: gatewayPort, method, path, headers: options.headers },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(options.body);
    });
  }

  it('chuyển tiếp method, đường dẫn đầy đủ kèm query, Authorization và trả nguyên status + header + body', async () => {
    const res = await call('GET', '/api/v1/listings?city=hanoi&page=2', {
      headers: { Authorization: 'Bearer abc.def.ghi' },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('GET');
    expect(seen[0].url).toBe('/api/v1/listings?city=hanoi&page=2');
    expect(seen[0].headers.authorization).toBe('Bearer abc.def.ghi');
  });

  it('body thô đi nguyên vẹn từng byte (webhook payOS: chữ ký tính trên body) — test 6', async () => {
    // JSON có khoảng trắng lạ, khóa lộn thứ tự, ký tự Unicode, byte không phải UTF-8 hợp lệ
    const body = Buffer.concat([
      Buffer.from('{ "orderCode" : 123,\n  "z":"tiếng Việt ✓",   "a": 1 }'),
      Buffer.from([0xff, 0xfe, 0x00, 0x80]),
    ]);
    const res = await call('POST', '/api/v1/payments/payos/webhook', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) },
      body,
    });
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.toString()).sha256).toBe(
      createHash('sha256').update(body).digest('hex'),
    );
    expect(seen[0].body.equals(body)).toBe(true);
    expect(seen[0].headers['content-length']).toBe(String(body.length));
    expect(res.headers['x-upstream']).toBe('yes');
  });

  it('X-Request-ID client gửi đi tới service đích và có ở response — test 9', async () => {
    const res = await call('GET', '/api/v1/listings', { headers: { 'X-Request-ID': 'abc-123' } });
    expect(seen[0].headers['x-request-id']).toBe('abc-123');
    expect(res.status).toBe(200);
  });

  it('không có X-Request-ID: gateway sinh và gắn vào request tới service đích', async () => {
    await call('GET', '/api/v1/listings');
    expect(seen[0].headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('4xx của service được chuyển nguyên { error, meta } — test 11', async () => {
    const res = await call('GET', '/api/v1/conflict');
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body.toString())).toEqual({
      error: { code: 'DEPOSIT_ALREADY_PAID', message: 'Đơn đã thanh toán' },
      meta: { correlationId: 'up', timestamp: 't' },
    });
  });

  it('5xx của service được chuyển nguyên, gateway không viết lại', async () => {
    const res = await call('GET', '/api/v1/boom');
    expect(res.status).toBe(500);
    expect(res.body.toString()).toBe('stack trace nội bộ');
  });

  it('service đích tắt -> 503 UPSTREAM_UNAVAILABLE, đúng khung lỗi, không lộ địa chỉ nội bộ — test 7', async () => {
    const res = await call('GET', '/api/v1/listings', {
      headers: { 'x-test-target': 'dead', 'X-Request-ID': 'down-1' },
    });
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body.toString());
    expect(body).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: expect.any(String) },
      meta: { correlationId: 'down-1', timestamp: expect.any(String) },
    });
    expect(res.body.toString()).not.toContain('127.0.0.1');
    expect(res.body.toString()).not.toContain(String(deadPort));
    expect(res.headers['x-request-id']).toBe('down-1'); // lỗi do proxy dựng vẫn mang mã truy vết
  });

  it('service đích chậm hơn timeout -> 504 UPSTREAM_TIMEOUT — test 8', async () => {
    const started = Date.now();
    const res = await call('GET', '/api/v1/slow', { headers: { 'X-Request-ID': 'slow-1' } });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(504);
    expect(JSON.parse(res.body.toString())).toEqual({
      error: { code: 'UPSTREAM_TIMEOUT', message: expect.any(String) },
      meta: { correlationId: 'slow-1', timestamp: expect.any(String) },
    });
    expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(1500);
    expect(res.body.toString()).not.toContain('127.0.0.1');
  });

  it('không retry: một request lỗi chỉ gọi service đích một lần', async () => {
    await call('GET', '/api/v1/boom');
    expect(seen).toHaveLength(1);
  });
});

describe('ProxyMiddleware — nâng cấp WebSocket /ws (test 12)', () => {
  // Dùng lại hạ tầng ở trên qua một nhóm mới để cô lập trạng thái upgrade
  let upstream: Server;
  let upstreamPort: number;
  let gateway: Server;
  let gatewayPort: number;
  const upgrades: string[] = [];
  const unhandled: unknown[] = [];

  beforeAll(async () => {
    upstream = createServer();
    upstream.on('upgrade', (req, socket) => {
      upgrades.push(req.url ?? '');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
      socket.on('data', (d) => socket.write(Buffer.concat([Buffer.from('echo:'), d])));
      socket.on('error', () => undefined);
    });
    upstreamPort = await listen(upstream);

    const config = {
      getOrThrow: (key: keyof EnvVars) => (key === 'GATEWAY_PROXY_TIMEOUT_MS' ? 300 : key),
    } as unknown as ConfigService<EnvVars, true>;
    const resolver = new RouteResolver({
      getOrThrow: (key: string) =>
        key === 'INTERNAL_NOTIFICATION_URL'
          ? `http://127.0.0.1:${upstreamPort}`
          : 'http://127.0.0.1:1',
    } as unknown as ConfigService<EnvVars, true>);
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as PinoLogger;
    const proxy = new ProxyMiddleware(config, resolver, logger);

    gateway = createServer((_req, res) => res.end('http'));
    gateway.on('upgrade', (req, socket, head) => proxy.upgrade(req, socket as Socket, head));
    gatewayPort = await listen(gateway);
    process.on('uncaughtException', (e) => unhandled.push(e));
  });

  afterAll(async () => {
    process.removeAllListeners('uncaughtException');
    await close(gateway);
    await close(upstream);
  });

  beforeEach(() => {
    upgrades.length = 0;
  });

  function upgrade(path: string): Promise<{ status: string; echo?: string; closed: boolean }> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let data = '';
      let status = '';
      socket.connect(gatewayPort, '127.0.0.1', () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
        );
      });
      socket.on('data', (d) => {
        data += d.toString();
        if (!status && data.includes('\r\n')) {
          status = data.split('\r\n')[0];
          if (status.includes('101')) socket.write('ping');
        }
        if (data.includes('echo:ping')) {
          resolve({ status, echo: 'echo:ping', closed: false });
          socket.destroy();
        }
      });
      socket.on('error', () => undefined);
      socket.on('close', () => resolve({ status, closed: true }));
      setTimeout(() => {
        resolve({ status, closed: false });
        socket.destroy();
      }, 1500).unref();
    });
  }

  it('/ws được chuyển tới notification: 101 và dữ liệu đi hai chiều, không cần token ở gateway', async () => {
    const res = await upgrade('/ws/?EIO=4&transport=websocket');
    expect(res.status).toContain('101');
    expect(res.echo).toBe('echo:ping');
    expect(upgrades).toEqual(['/ws/?EIO=4&transport=websocket']);
  });

  it('upgrade tới đường dẫn khác /ws bị từ chối, không tới service (không né AccessGuard)', async () => {
    for (const path of ['/api/v1/admin/users', '/api/v1/deposits/mine', '/internal/x', '/wsx']) {
      const res = await upgrade(path);
      expect(res.status).not.toContain('101');
      expect(res.closed).toBe(true);
    }
    expect(upgrades).toEqual([]);
  });

  it('service đích tắt: đóng socket gọn gàng, gateway không sập', async () => {
    const dead = createServer();
    const deadPort = await listen(dead);
    await close(dead);
    const resolver = new RouteResolver({
      getOrThrow: () => `http://127.0.0.1:${deadPort}`,
    } as unknown as ConfigService<EnvVars, true>);
    const config = {
      getOrThrow: () => 300,
    } as unknown as ConfigService<EnvVars, true>;
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as PinoLogger;
    const proxy = new ProxyMiddleware(config, resolver, logger);
    const g = createServer((_req, res) => res.end('x'));
    g.on('upgrade', (req, socket, head) => proxy.upgrade(req, socket as Socket, head));
    const port = await listen(g);
    const socket = new Socket();
    const closed = new Promise<void>((r) => socket.on('close', () => r()));
    socket.on('error', () => undefined);
    socket.connect(port, '127.0.0.1', () =>
      socket.write(
        'GET /ws/ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
      ),
    );
    await closed;
    await close(g);
    expect(unhandled).toEqual([]);
  });
});
