/**
 * Mã lỗi NGHIỆP VỤ riêng của module/service. Quy ước: <MIỀN>_<LÝ_DO>, khai báo ngay trong module
 * (mã dùng chung như NOT_FOUND, VALIDATION_FAILED nằm ở common/errors/error-codes.ts).
 */
export const ExampleErrorCode = {
  NAME_TAKEN: 'EXAMPLE_NAME_TAKEN',
  NOT_FOUND: 'EXAMPLE_NOT_FOUND',
} as const;
