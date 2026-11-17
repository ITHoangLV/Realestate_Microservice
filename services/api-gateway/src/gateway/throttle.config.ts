import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../common/auth/authenticated-user';
import { EnvVars } from '../config/env.validation';

/**
 * Cấu hình `@nestjs/throttler`, bộ đếm trong bộ nhớ của gateway (một instance; RE.GATEWAY/API_Spec.md §5).
 * MỘT throttler duy nhất; giới hạn tùy request có người dùng đã xác thực hay không
 * (xem GatewayThrottlerGuard):
 *   có `request.user` → RATE_LIMIT_USER,  không có (public, payos) → RATE_LIMIT_IP,
 *   cùng cửa sổ RATE_LIMIT_TTL_SECONDS. (`ttl` của throttler tính bằng mili-giây.)
 */
export function createThrottlerOptions(
  config: ConfigService<EnvVars, true>,
): ThrottlerModuleOptions {
  const limitIp = config.get('RATE_LIMIT_IP', { infer: true });
  const limitUser = config.get('RATE_LIMIT_USER', { infer: true });
  return {
    throttlers: [
      {
        ttl: config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000,
        limit: (context: ExecutionContext) =>
          context.switchToHttp().getRequest<AuthenticatedRequest>().user ? limitUser : limitIp,
      },
    ],
  };
}
