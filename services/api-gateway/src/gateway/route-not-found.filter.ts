import { ArgumentsHost, Catch, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { routeNotFound } from './errors/gateway.errors';

/**
 * Đường dẫn ngoài `/api/v1/*` (và route Nest không có) không tới GatewayController nên Nest tự ném
 * NotFoundException ("Cannot GET /foo", mã NOT_FOUND). Với gateway, mọi đường dẫn không khớp bảng định tuyến
 * phải là `404 GATEWAY_ROUTE_NOT_FOUND` (RE.GATEWAY/API_Spec.md §4), cùng khung `{ error, meta }`.
 */
@Catch(NotFoundException)
export class RouteNotFoundFilter extends AllExceptionsFilter {
  override catch(_exception: unknown, host: ArgumentsHost): void {
    super.catch(routeNotFound(), host);
  }
}
