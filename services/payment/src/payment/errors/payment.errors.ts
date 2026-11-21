import { QueryFailedError } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';

/** Mã lỗi nghiệp vụ của payment-service (`RE.PAYMENT/API_Spec.md §4`). Ổn định: rental dựa vào mã này. */
export const PaymentError = {
  ORDER_NOT_FOUND: 'PAYMENT_ORDER_NOT_FOUND', // 404
  ORDER_ALREADY_PAID: 'PAYMENT_ORDER_ALREADY_PAID', // 409 (BR-09)
  ORDER_CANCELLED: 'PAYMENT_ORDER_CANCELLED', // 409
  ORDER_EXPIRED: 'PAYMENT_ORDER_EXPIRED', // 409 (BR-07)
  PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE', // 503
} as const;

export const orderNotFound = (): AppException =>
  new AppException(PaymentError.ORDER_NOT_FOUND, 'Không tìm thấy lệnh thanh toán', 404);

export const orderAlreadyPaid = (): AppException =>
  new AppException(PaymentError.ORDER_ALREADY_PAID, 'Lệnh thanh toán đã được thanh toán', 409);

export const orderCancelled = (): AppException =>
  new AppException(PaymentError.ORDER_CANCELLED, 'Lệnh thanh toán đã hủy', 409);

export const orderExpired = (): AppException =>
  new AppException(PaymentError.ORDER_EXPIRED, 'Thời gian giữ chỗ đã hết', 409);

export const providerUnavailable = (): AppException =>
  new AppException(
    PaymentError.PROVIDER_UNAVAILABLE,
    'Cổng thanh toán tạm thời không phản hồi',
    503,
  );

/** Lỗi `23505` (unique_violation) của Postgres trên đúng ràng buộc `constraint`. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string; constraint?: string } | undefined;
  return driver?.code === '23505' && driver.constraint === constraint;
}
