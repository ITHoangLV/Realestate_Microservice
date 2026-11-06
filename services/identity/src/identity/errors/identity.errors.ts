import { AppException } from '../../common/errors/app.exception';

/** Mã lỗi nghiệp vụ của identity-service. Ổn định: client dựa vào mã này, KHÔNG đổi tên. */
export const IdentityError = {
  EMAIL_TAKEN: 'IDENTITY_EMAIL_TAKEN', // 409
  INVALID_CREDENTIALS: 'IDENTITY_INVALID_CREDENTIALS', // 401
  INVALID_REFRESH_TOKEN: 'IDENTITY_INVALID_REFRESH_TOKEN', // 401
} as const;

export const emailTaken = (): AppException =>
  new AppException(IdentityError.EMAIL_TAKEN, 'Email này đã được đăng ký', 409);

/** Dùng chung cho sai email VÀ sai mật khẩu để không lộ email nào đã đăng ký. */
export const invalidCredentials = (): AppException =>
  new AppException(IdentityError.INVALID_CREDENTIALS, 'Email hoặc mật khẩu không đúng', 401);

/** Dùng chung cho token không có, hết hạn, đã bị thu hồi hoặc bị dùng lại (không phân biệt với client). */
export const invalidRefreshToken = (): AppException =>
  new AppException(
    IdentityError.INVALID_REFRESH_TOKEN,
    'Refresh token không hợp lệ hoặc đã hết hạn, hãy đăng nhập lại',
    401,
  );
