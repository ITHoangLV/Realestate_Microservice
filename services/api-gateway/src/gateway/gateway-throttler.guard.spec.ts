import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { EnvVars } from '../config/env.validation';
import { GatewayThrottlerGuard } from './gateway-throttler.guard';
import { createThrottlerOptions } from './throttle.config';

/** Thay AccessGuard: có header x-test-sub thì coi là người dùng đã xác thực với sub đó. */
@Injectable()
class FakeAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const sub = req.headers['x-test-sub'];
    if (sub) req.user = { sub, roles: [], exp: 0 };
    return true;
  }
}

@Controller('t')
@UseGuards(FakeAccessGuard, GatewayThrottlerGuard)
class TestController {
  @Get()
  ok(): { ok: boolean } {
    return { ok: true };
  }
}

const LIMITS = { RATE_LIMIT_TTL_SECONDS: 60, RATE_LIMIT_IP: 3, RATE_LIMIT_USER: 5 };

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => LIMITS] }),
      ThrottlerModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService<EnvVars, true>) => createThrottlerOptions(config),
      }),
    ],
    controllers: [TestController],
    providers: [
      FakeAccessGuard,
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      {
        provide: PinoLogger,
        useValue: { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

const hit = (app: Awaited<ReturnType<typeof createApp>>, headers: Record<string, string> = {}) => {
  const r = request(app.getHttpServer()).get('/t');
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r;
};

describe('GatewayThrottlerGuard — một throttler sau AccessGuard (RE.GATEWAY §3.2, test 10)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('ẩn danh (không có user): đếm theo IP, vượt RATE_LIMIT_IP -> 429 TOO_MANY_REQUESTS', async () => {
    for (let i = 0; i < LIMITS.RATE_LIMIT_IP; i++) expect((await hit(app)).status).toBe(200);
    const res = await hit(app);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.meta).toEqual({
      correlationId: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('có user: đếm theo sub, giới hạn RATE_LIMIT_USER (lớn hơn giới hạn IP)', async () => {
    for (let i = 0; i < LIMITS.RATE_LIMIT_USER; i++) {
      expect((await hit(app, { 'x-test-sub': 'u-1' })).status).toBe(200);
    }
    const res = await hit(app, { 'x-test-sub': 'u-1' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('request có user không tiêu hao bộ đếm IP của người ẩn danh cùng IP (SSR, NAT)', async () => {
    for (let i = 0; i < LIMITS.RATE_LIMIT_USER; i++) await hit(app, { 'x-test-sub': 'u-1' });
    expect((await hit(app, { 'x-test-sub': 'u-1' })).status).toBe(429);
    // cùng IP, nhưng ẩn danh: bộ đếm IP còn nguyên
    for (let i = 0; i < LIMITS.RATE_LIMIT_IP; i++) expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(429);
  });

  it('hai sub cùng IP không dùng chung bộ đếm', async () => {
    for (let i = 0; i < LIMITS.RATE_LIMIT_USER; i++) await hit(app, { 'x-test-sub': 'u-1' });
    expect((await hit(app, { 'x-test-sub': 'u-1' })).status).toBe(429);
    expect((await hit(app, { 'x-test-sub': 'u-2' })).status).toBe(200);
  });

  it('ẩn danh không né được giới hạn bằng cách đổi X-Forwarded-For (không tin header này)', async () => {
    for (let i = 0; i < LIMITS.RATE_LIMIT_IP; i++) {
      expect((await hit(app, { 'X-Forwarded-For': `203.0.113.${i + 1}` })).status).toBe(200);
    }
    expect((await hit(app, { 'X-Forwarded-For': '198.51.100.99' })).status).toBe(429);
  });

  it('sub là khóa đếm, không phải IP: user và ẩn danh có bộ đếm tách biệt dù trùng chuỗi', async () => {
    // sub trùng với địa chỉ IP: hai namespace phải khác nhau
    for (let i = 0; i < LIMITS.RATE_LIMIT_IP; i++) await hit(app);
    expect((await hit(app)).status).toBe(429);
    expect((await hit(app, { 'x-test-sub': '::ffff:127.0.0.1' })).status).toBe(200);
    expect((await hit(app, { 'x-test-sub': '127.0.0.1' })).status).toBe(200);
  });
});
