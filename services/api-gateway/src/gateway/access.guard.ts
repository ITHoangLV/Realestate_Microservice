import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedRequest } from '../common/auth/authenticated-user';
import { extractBearerToken, JwtTokenVerifier } from '../common/auth/jwt-token.verifier';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ResolvedRoute, RouteResolver } from './route-resolver';
import { Access } from './routes';

/** Request đã qua AccessGuard: có route đã khớp và (nếu route cần token) người dùng đã xác thực. */
export type GatewayRequest = Request & AuthenticatedRequest & { gatewayRoute?: ResolvedRoute };

/** Vai trò cần có theo mức truy cập. `user` chỉ cần token hợp lệ, vai trò nào cũng được. */
const REQUIRED_ROLE: Partial<Record<Access, string>> = {
  tenant: 'TENANT',
  landlord: 'LANDLORD',
  admin: 'ADMIN',
};

/**
 * Cổng kiểm mức truy cập mức tuyến (RE.GATEWAY/Component_Class_Design.md §3.2, bước 5):
 *   1. Khớp method + đường dẫn với bảng định tuyến; không khớp → 404 GATEWAY_ROUTE_NOT_FOUND
 *      (kể cả khi thiếu token: không cho biết route nào cần đăng nhập).
 *   2. `public`, `payos`: cho qua, KHÔNG đọc token (payment kiểm chữ ký webhook).
 *   3. Còn lại: kiểm JWT RS256 bằng khóa công khai (không gọi identity) → 401; so vai trò → 403.
 * Chỉ kiểm thô: kiểm chủ sở hữu và vai trò chi tiết là việc của service đích (security-policy.md §4).
 *
 * Kết quả khớp lưu vào `request.gatewayRoute` để ProxyMiddleware dùng lại, không khớp lần hai.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly resolver: RouteResolver,
    private readonly verifier: JwtTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const route = this.resolver.resolve(request.method, request.originalUrl);
    request.gatewayRoute = route;

    if (route.access === 'public' || route.access === 'payos') return true;

    // Không cấu hình JWT thì KHÔNG mở toang (security-policy.md §2): 503, kiểm trước khi xét token
    this.verifier.assertConfigured();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_MISSING,
        'Thiếu header Authorization: Bearer <token>',
        401,
      );
    }
    const user = await this.verifier.verify(token);

    const required = REQUIRED_ROLE[route.access];
    if (required && !user.roles.includes(required)) {
      throw new AppException(
        ErrorCode.FORBIDDEN_ROLE,
        'Bạn không có quyền thực hiện thao tác này',
        403,
        { requiredAnyOf: [required] },
      );
    }
    request.user = user;
    return true;
  }
}
