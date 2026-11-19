import { ParseUUIDPipe } from '@nestjs/common';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

/**
 * Pipe kiểm tham số đường dẫn là UUID, lỗi trả đúng dạng hợp đồng API nội bộ:
 * `400 VALIDATION_FAILED`, message "<tên> phải là UUID", `details: [{ field, errors }]`
 * (cùng dạng với lỗi của `createValidationPipe`).
 *
 * `new ParseUUIDPipe()` trần trả mã `BAD_REQUEST`, không khớp `contracts/openapi/*-internal.v1.yaml`.
 *
 *   @Get(':id')
 *   find(@Param('id', createUuidParamPipe('id')) id: string) {}
 */
export function createUuidParamPipe(field = 'id'): ParseUUIDPipe {
  const message = `${field} phải là UUID`;
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new AppException(ErrorCode.VALIDATION_FAILED, message, 400, [{ field, errors: [message] }]),
  });
}
