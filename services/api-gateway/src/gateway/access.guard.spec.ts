import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { AppException } from '../common/errors/app.exception';
import { JwtVerifyConfig } from '../common/auth/jwt.config';
import { JwtTokenVerifier } from '../common/auth/jwt-token.verifier';
import { EnvVars } from '../config/env.validation';
import { AccessGuard } from './access.guard';
import { RouteResolver } from './route-resolver';

const keys = (): { publicKey: string; privateKey: string } =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
const mine = keys();
const other = keys();
const jwt = new JwtService({});
const ISSUER = 'realestate-identity';

const sign = (
  claims: Record<string, unknown>,
  {
    privateKey = mine.privateKey,
    expiresIn = 60,
  }: { privateKey?: string; expiresIn?: number } = {},
): string => jwt.sign(claims, { algorithm: 'RS256', privateKey, issuer: ISSUER, expiresIn });

const config: JwtVerifyConfig = {
  key: mine.publicKey,
  algorithms: ['RS256'],
  kind: 'public-key',
  issuer: ISSUER,
};
const resolver = new RouteResolver({
  getOrThrow: (key: string) => `http://${key.toLowerCase()}.test`,
} as unknown as ConfigService<EnvVars, true>);

const guardWith = (cfg: JwtVerifyConfig | null = config): AccessGuard =>
  new AccessGuard(resolver, new JwtTokenVerifier(jwt, cfg));

interface FakeRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string>;
  user?: unknown;
  gatewayRoute?: unknown;
}

function ctxFor(method: string, url: string, authorization?: string) {
  const req: FakeRequest = {
    method,
    originalUrl: url,
    headers: authorization ? { authorization } : {},
  };
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { ctx, req };
}

async function failure(
  guard: AccessGuard,
  ctx: ExecutionContext,
): Promise<{ code: string; status: number; details?: unknown }> {
  try {
    await guard.canActivate(ctx);
  } catch (e) {
    const ex = e as AppException;
    return { code: ex.code, status: ex.getStatus(), details: ex.details };
  }
  throw new Error('guard phải từ chối');
}

const bearer = (token: string): string => `Bearer ${token}`;

describe('AccessGuard — route public và payos', () => {
  it('public: cho qua không cần token, và không đọc token', async () => {
    const { ctx, req } = ctxFor('GET', '/api/v1/listings?city=hanoi');
    await expect(guardWith().canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('public: token rác kèm theo cũng không làm hỏng request (không kiểm token)', async () => {
    const { ctx, req } = ctxFor('GET', '/api/v1/listings', 'Bearer rac.rac.rac');
    await expect(guardWith().canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('payos: webhook không token được cho qua (payment kiểm chữ ký)', async () => {
    const { ctx } = ctxFor('POST', '/api/v1/payments/payos/webhook');
    await expect(guardWith().canActivate(ctx)).resolves.toBe(true);
  });

  it('public vẫn chạy khi gateway chưa cấu hình JWT', async () => {
    const { ctx } = ctxFor('POST', '/api/v1/auth/login');
    await expect(guardWith(null).canActivate(ctx)).resolves.toBe(true);
  });

  it('gắn kết quả định tuyến vào request để ProxyMiddleware dùng lại', async () => {
    const { ctx, req } = ctxFor('POST', '/api/v1/auth/login');
    await guardWith().canActivate(ctx);
    expect(req.gatewayRoute).toEqual({
      service: 'identity',
      target: 'http://internal_identity_url.test',
      access: 'public',
    });
  });
});

describe('AccessGuard — token (test 2, 3)', () => {
  const guard = guardWith();
  const url = '/api/v1/auth/me';

  it('thiếu header Authorization -> 401 AUTH_TOKEN_MISSING', async () => {
    const { ctx } = ctxFor('GET', url);
    await expect(failure(guard, ctx)).resolves.toMatchObject({
      code: 'AUTH_TOKEN_MISSING',
      status: 401,
    });
  });

  it('Authorization không phải Bearer -> 401 AUTH_TOKEN_MISSING', async () => {
    const { ctx } = ctxFor('GET', url, 'Basic abc');
    await expect(failure(guard, ctx)).resolves.toMatchObject({ code: 'AUTH_TOKEN_MISSING' });
  });

  it('Bearer sai -> 401 AUTH_TOKEN_INVALID (lệnh kiểm chứng của task)', async () => {
    const { ctx } = ctxFor('GET', url, bearer('sai'));
    await expect(failure(guard, ctx)).resolves.toEqual({
      code: 'AUTH_TOKEN_INVALID',
      status: 401,
      details: undefined,
    });
  });

  it('sai chữ ký (ký bằng khóa khác) -> 401 AUTH_TOKEN_INVALID', async () => {
    const token = sign({ sub: 'u-1', roles: ['TENANT'] }, { privateKey: other.privateKey });
    const { ctx } = ctxFor('GET', url, bearer(token));
    await expect(failure(guard, ctx)).resolves.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
      status: 401,
    });
  });

  it('hết hạn -> 401 AUTH_TOKEN_EXPIRED', async () => {
    const token = sign({ sub: 'u-1', roles: ['TENANT'] }, { expiresIn: -10 });
    const { ctx } = ctxFor('GET', url, bearer(token));
    await expect(failure(guard, ctx)).resolves.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });
  });

  it('chưa cấu hình JWT -> 503 AUTH_NOT_CONFIGURED với route cần token (không bao giờ để hở)', async () => {
    const { ctx } = ctxFor('GET', url, bearer(sign({ sub: 'u-1' })));
    await expect(failure(guardWith(null), ctx)).resolves.toMatchObject({
      code: 'AUTH_NOT_CONFIGURED',
      status: 503,
    });
  });

  it('token hợp lệ -> cho qua và gắn request.user', async () => {
    const { ctx, req } = ctxFor('GET', url, bearer(sign({ sub: 'u-1', roles: ['TENANT'] })));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: 'u-1', roles: ['TENANT'], exp: expect.any(Number) });
  });
});

describe('AccessGuard — vai trò mức tuyến (test 4)', () => {
  const guard = guardWith();
  const as = (...roles: string[]) => bearer(sign({ sub: 'u-1', roles }));

  it('TENANT gọi /api/v1/admin/* -> 403 FORBIDDEN_ROLE', async () => {
    for (const url of [
      '/api/v1/admin/users',
      '/api/v1/admin/listings/l-1/approve',
      '/api/v1/admin/deposits/d-1/hand-over',
      '/api/v1/admin/wallet',
    ]) {
      const { ctx } = ctxFor('POST', url, as('TENANT'));
      await expect(failure(guard, ctx)).resolves.toEqual({
        code: 'FORBIDDEN_ROLE',
        status: 403,
        details: { requiredAnyOf: ['ADMIN'] },
      });
    }
  });

  it('ADMIN vào được /api/v1/admin/*', async () => {
    const { ctx } = ctxFor('POST', '/api/v1/admin/users/u-2/lock', as('ADMIN'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('landlord: LANDLORD qua, TENANT và ADMIN không (admin không tự thừa hưởng quyền chủ trọ)', async () => {
    const ok = ctxFor('POST', '/api/v1/listings', as('LANDLORD'));
    await expect(guard.canActivate(ok.ctx)).resolves.toBe(true);
    for (const role of ['TENANT', 'ADMIN']) {
      const { ctx } = ctxFor('POST', '/api/v1/listings', as(role));
      await expect(failure(guard, ctx)).resolves.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    }
  });

  it('GET /api/v1/listings/MINE (chữ hoa) cũng là landlord: 401 khi không token, 403 với TENANT', async () => {
    for (const url of ['/api/v1/listings/MINE', '/API/V1/LISTINGS/Mine']) {
      const anon = ctxFor('GET', url);
      await expect(failure(guard, anon.ctx)).resolves.toMatchObject({
        code: 'AUTH_TOKEN_MISSING',
        status: 401,
      });
      const tenant = ctxFor('GET', url, as('TENANT'));
      await expect(failure(guard, tenant.ctx)).resolves.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    }
  });

  it('/API/V1/ADMIN/users/x (chữ hoa) vẫn cần ADMIN', async () => {
    const tenant = ctxFor('POST', '/API/V1/ADMIN/users/x', as('TENANT'));
    await expect(failure(guard, tenant.ctx)).resolves.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    const admin = ctxFor('POST', '/API/V1/ADMIN/users/x', as('ADMIN'));
    await expect(guard.canActivate(admin.ctx)).resolves.toBe(true);
  });

  it('GET /api/v1/listings/mine là landlord, không phải public (v1.3)', async () => {
    const anon = ctxFor('GET', '/api/v1/listings/mine');
    await expect(failure(guard, anon.ctx)).resolves.toMatchObject({ code: 'AUTH_TOKEN_MISSING' });
    const tenant = ctxFor('GET', '/api/v1/listings/mine', as('TENANT'));
    await expect(failure(guard, tenant.ctx)).resolves.toMatchObject({ code: 'FORBIDDEN_ROLE' });
  });

  it('user: mọi vai trò (kể cả token không có roles) đều qua', async () => {
    for (const header of [as('TENANT'), as('LANDLORD'), as('ADMIN'), as()]) {
      const { ctx } = ctxFor('GET', '/api/v1/deposits/mine', header);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
  });

  it('người dùng có nhiều vai trò: chỉ cần một vai trò đúng', async () => {
    const { ctx } = ctxFor('POST', '/api/v1/listings', as('TENANT', 'LANDLORD'));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('vai trò sai chữ hoa/thường không được chấp nhận', async () => {
    const { ctx } = ctxFor('POST', '/api/v1/admin/users/u-2/lock', as('admin'));
    await expect(failure(guard, ctx)).resolves.toMatchObject({ code: 'FORBIDDEN_ROLE' });
  });
});

describe('AccessGuard — định tuyến', () => {
  it('không khớp bảng -> 404 GATEWAY_ROUTE_NOT_FOUND, kể cả khi thiếu token (không lộ route nào cần đăng nhập)', async () => {
    const { ctx } = ctxFor('GET', '/api/v1/khong-co');
    await expect(failure(guardWith(), ctx)).resolves.toMatchObject({
      code: 'GATEWAY_ROUTE_NOT_FOUND',
      status: 404,
    });
  });

  it('kiểm quyền theo method: DELETE /listings/:id cần landlord dù GET cùng đường dẫn là public', async () => {
    const get = ctxFor('GET', '/api/v1/listings/l-1');
    await expect(guardWith().canActivate(get.ctx)).resolves.toBe(true);
    const del = ctxFor('DELETE', '/api/v1/listings/l-1');
    await expect(failure(guardWith(), del.ctx)).resolves.toMatchObject({
      code: 'AUTH_TOKEN_MISSING',
    });
  });
});
