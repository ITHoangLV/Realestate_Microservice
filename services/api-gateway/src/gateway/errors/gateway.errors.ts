import { AppException } from '../../common/errors/app.exception';

/**
 * Mã lỗi của api-gateway (RE.GATEWAY/API_Spec.md §4). Các mã dùng chung (AUTH_TOKEN_*, FORBIDDEN_ROLE,
 * TOO_MANY_REQUESTS, UPSTREAM_*) lấy từ common/errors/error-codes.ts, không khai báo lại ở đây.
 * Ổn định: client dựa vào mã này, KHÔNG đổi tên.
 */
export const GatewayError = {
  ROUTE_NOT_FOUND: 'GATEWAY_ROUTE_NOT_FOUND', // 404
} as const;

/**
 * Không khớp dòng nào trong bảng định tuyến, và mọi `/internal/*`. Thông điệp cố định, không nhắc
 * đường dẫn hay địa chỉ nội bộ.
 */
export const routeNotFound = (): AppException =>
  new AppException(GatewayError.ROUTE_NOT_FOUND, 'Không tìm thấy đường dẫn', 404);
