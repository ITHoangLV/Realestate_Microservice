import { QueryFailedError } from 'typeorm';

/** Mã lỗi PostgreSQL cho vi phạm ràng buộc duy nhất (unique_violation). */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Nếu `err` là vi phạm ràng buộc duy nhất của PostgreSQL thì trả TÊN ràng buộc (hoặc chuỗi rỗng khi
 * driver không báo tên), ngược lại `undefined`. Dùng để phân biệt trùng email (`UQ_users_email_lower`) với
 * trùng số điện thoại (`UQ_users_phone`), vì cả hai cùng mã `23505`.
 */
export function uniqueViolationConstraint(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  const driver = err.driverError as { code?: string; constraint?: string } | undefined;
  if (driver?.code !== PG_UNIQUE_VIOLATION) return undefined;
  return driver.constraint ?? '';
}
