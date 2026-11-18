import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvVars } from '../config/env.validation';
import { createThrottlerOptions } from './throttle.config';

const config = (values: Partial<EnvVars>) =>
  ({ get: (key: keyof EnvVars) => values[key] }) as unknown as ConfigService<EnvVars, true>;

const ctx = (user?: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('createThrottlerOptions', () => {
  const options = createThrottlerOptions(
    config({ RATE_LIMIT_TTL_SECONDS: 60, RATE_LIMIT_IP: 100, RATE_LIMIT_USER: 300 }),
  ) as { throttlers: Array<{ ttl: number; limit: (c: ExecutionContext) => number }> };

  it('đúng một throttler, ttl đổi từ giây sang mili-giây (throttler v6 dùng ms)', () => {
    expect(options.throttlers).toHaveLength(1);
    expect(options.throttlers[0].ttl).toBe(60_000);
  });

  it('có người dùng đã xác thực -> RATE_LIMIT_USER; không có -> RATE_LIMIT_IP', () => {
    const { limit } = options.throttlers[0];
    expect(limit(ctx({ sub: 'u-1', roles: [], exp: 0 }))).toBe(300);
    expect(limit(ctx(undefined))).toBe(100);
  });
});
