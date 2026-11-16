import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedRequest, AuthUser } from './authenticated-user';
import { JWT_VERIFY_CONFIG, JwtVerifyConfig } from './jwt.config';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard toàn cục: mọi route phải có JWT hợp lệ trừ route gắn @Public().
 * Gateway đã verify token, nhưng service VẪN verify lại chữ ký (không tin mạng nội bộ).
 * Đọc header `Authorization: Bearer <token>`, kiểm tra claims { sub, roles[], exp }
 * và gắn `request.user` để dùng qua @CurrentUser().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(JWT_VERIFY_CONFIG) private readonly verifyConfig: JwtVerifyConfig | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Không cấu hình JWT thì KHÔNG mở toang: từ chối rõ ràng thay vì cho qua
    if (!this.verifyConfig) {
      throw new AppException(
        ErrorCode.AUTH_NOT_CONFIGURED,
        'Service chưa cấu hình xác thực JWT (JWT_PUBLIC_KEY, JWT_PUBLIC_KEY_PATH hoặc JWT_SECRET)',
        503,
      );
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_MISSING,
        'Thiếu header Authorization: Bearer <token>',
        401,
      );
    }

    request.user = await this.verify(token, this.verifyConfig);
    return true;
  }

  private extractBearerToken(header: string | string[] | undefined): string | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    const match = value?.match(/^Bearer\s+(\S+)$/i);
    return match?.[1];
  }

  private async verify(token: string, cfg: JwtVerifyConfig): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        ...(cfg.kind === 'secret' ? { secret: cfg.key } : { publicKey: cfg.key }),
        algorithms: cfg.algorithms,
        ...(cfg.issuer && { issuer: cfg.issuer }),
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_TOKEN_INVALID,
        expired ? 'Token đã hết hạn' : 'Token không hợp lệ',
        401,
      );
    }

    const { sub, roles, exp } = payload;
    const rolesValid = roles === undefined || (Array.isArray(roles) && roles.every(isString));
    if (typeof sub !== 'string' || !sub || typeof exp !== 'number' || !rolesValid) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Token thiếu hoặc sai claims bắt buộc (sub, roles, exp)',
        401,
      );
    }
    return { sub, roles: (roles as string[] | undefined) ?? [], exp };
  }
}

const isString = (value: unknown): value is string => typeof value === 'string';
