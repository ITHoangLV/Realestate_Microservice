import { ExecutionContext, Injectable } from '@nestjs/common';
import { normalizeIp, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/**
 * Rate limit đặt SAU AccessGuard (RE.GATEWAY/Component_Class_Design.md §3.2, chốt 2026-11-16):
 *   - Có `request.user` (route cần token, đã xác thực) → bộ đếm theo `sub`, giới hạn RATE_LIMIT_USER.
 *   - Không có (route `public`, webhook `payos`) → bộ đếm theo IP, giới hạn RATE_LIMIT_IP.
 * Không đếm IP của request đã đăng nhập: SSR của Next.js và NAT gom nhiều người về một IP.
 * Hai bộ đếm có tiền tố riêng (`sub:`, `ip:`) nên không bao giờ đụng nhau.
 *
 * IP lấy từ `request.ip` với `trust proxy = false` (không tin X-Forwarded-For, app.setup.ts); IPv6 gộp
 * theo /64 (mặc định của throttler) để một mạng IPv6 không đổi địa chỉ liên tục mà né giới hạn.
 * Giới hạn do `limit` (hàm) trong throttle.config.ts quyết định, theo cùng điều kiện có/không có user.
 */
@Injectable()
export class GatewayThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const sub = (req.user as { sub?: string } | undefined)?.sub;
    return Promise.resolve(
      sub ? `sub:${sub}` : `ip:${normalizeIp(String(req.ip), this.ipv6SubnetPrefix)}`,
    );
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Thông điệp tiếng Việt, đúng khung lỗi dự án; Retry-After (giây) đã được throttler đặt vào header
    const retryAfterSeconds = detail.isBlocked ? detail.timeToBlockExpire : detail.timeToExpire;
    throw new AppException(
      ErrorCode.TOO_MANY_REQUESTS,
      'Quá nhiều yêu cầu, vui lòng thử lại sau',
      429,
      { retryAfterSeconds },
    );
  }
}
