import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth/public.decorator';
import { RawResponse } from '../common/response/raw-response.decorator';
import { AccessGuard, GatewayRequest } from './access.guard';
import { GatewayThrottlerGuard } from './gateway-throttler.guard';
import { ProxyMiddleware } from './proxy.middleware';

/**
 * Cửa vào duy nhất của mọi request công khai (RE.GATEWAY/Component_Class_Design.md §3.2).
 *
 * Catch-all dưới `/api/v1/*` (prefix toàn cục của Nest): mọi route trong bảng định tuyến đều bắt đầu bằng
 * `/api/v1/`; `/ws` đi qua sự kiện `upgrade` (app.setup.ts), `/health` là route riêng của HealthController.
 *
 * Thứ tự: AccessGuard (khớp route, kiểm JWT và vai trò) → GatewayThrottlerGuard (rate limit theo sub hoặc IP) →
 * handler chuyển tiếp. Guard là exception nên lỗi đi qua AllExceptionsFilter đúng `{ error, meta }`.
 *
 * - `@Public()`: bỏ qua JwtAuthGuard toàn cục của template; việc kiểm token là của AccessGuard theo mức từng route.
 * - `@RawResponse()`: không bọc `{ data, meta }`, response của service đi nguyên văn.
 * - `@Req()`/`@Res()` (không passthrough): Nest không tự gửi response, ProxyMiddleware gửi.
 * - Không có DTO, ValidationPipe không tác động: body không bị đọc hay parse (xem main.ts, bodyParser: false).
 */
@ApiExcludeController()
@Public()
@RawResponse()
@UseGuards(AccessGuard, GatewayThrottlerGuard)
@Controller()
export class GatewayController {
  constructor(private readonly proxy: ProxyMiddleware) {}

  @All('{*path}')
  async forward(@Req() req: GatewayRequest, @Res() res: Response): Promise<void> {
    let failure: unknown;
    await this.proxy.use(req, res, (err?: unknown) => {
      failure = err;
    });
    // Lỗi dựng đích (hiếm): để AllExceptionsFilter trả 500 đúng khung, không lộ chi tiết
    if (failure) throw failure;
  }
}
