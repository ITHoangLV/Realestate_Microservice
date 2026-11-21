import { AppException } from '../../common/errors/app.exception';

/** Mã lỗi nghiệp vụ của identity-service. Ổn định: client dựa vào mã này, KHÔNG đổi tên. */
export const IdentityError = {
  EMAIL_TAKEN: 'IDENTITY_EMAIL_TAKEN', // 409
  INVALID_CREDENTIALS: 'IDENTITY_INVALID_CREDENTIALS', // 401
  INVALID_REFRESH_TOKEN: 'IDENTITY_INVALID_REFRESH_TOKEN', // 401
  BANK_ACCOUNT_NOT_FOUND: 'IDENTITY_BANK_ACCOUNT_NOT_FOUND', // 404
  USER_NOT_FOUND: 'IDENTITY_USER_NOT_FOUND', // 404
  PHONE_TAKEN: 'IDENTITY_PHONE_TAKEN', // 409
  EMAIL_NOT_VERIFIED: 'IDENTITY_EMAIL_NOT_VERIFIED', // 403
  ACCOUNT_LOCKED: 'IDENTITY_ACCOUNT_LOCKED', // 403
  OTP_INVALID: 'IDENTITY_OTP_INVALID', // 400
  OTP_RESEND_TOO_SOON: 'IDENTITY_OTP_RESEND_TOO_SOON', // 429
  RESET_TOKEN_INVALID: 'IDENTITY_RESET_TOKEN_INVALID', // 400
  GOOGLE_TOKEN_INVALID: 'IDENTITY_GOOGLE_TOKEN_INVALID', // 401
  ROLE_REQUIRED: 'IDENTITY_ROLE_REQUIRED', // 400
  CANNOT_LOCK_SELF: 'IDENTITY_CANNOT_LOCK_SELF', // 409
} as const;

export const bankAccountNotFound = (): AppException =>
  new AppException(IdentityError.BANK_ACCOUNT_NOT_FOUND, 'Chưa khai tài khoản nhận tiền', 404);

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

export const userNotFound = (): AppException =>
  new AppException(IdentityError.USER_NOT_FOUND, 'Không tìm thấy người dùng', 404);

export const phoneTaken = (): AppException =>
  new AppException(IdentityError.PHONE_TAKEN, 'Số điện thoại đã được dùng', 409);

export const emailNotVerified = (): AppException =>
  new AppException(
    IdentityError.EMAIL_NOT_VERIFIED,
    'Email chưa được xác minh, hãy nhập mã OTP',
    403,
  );

export const accountLocked = (): AppException =>
  new AppException(IdentityError.ACCOUNT_LOCKED, 'Tài khoản đã bị khóa', 403);

/** Dùng chung cho mã sai, hết hạn, bị hủy sau quá số lần sai, hoặc không có tài khoản chờ xác minh. */
export const otpInvalid = (): AppException =>
  new AppException(IdentityError.OTP_INVALID, 'Mã OTP không đúng hoặc đã hết hạn', 400);

export const otpResendTooSoon = (): AppException =>
  new AppException(IdentityError.OTP_RESEND_TOO_SOON, 'Vui lòng chờ trước khi gửi lại mã', 429);

/** Dùng chung cho token không có, hết hạn, đã dùng. */
export const resetTokenInvalid = (): AppException =>
  new AppException(
    IdentityError.RESET_TOKEN_INVALID,
    'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    400,
  );

export const googleTokenInvalid = (): AppException =>
  new AppException(IdentityError.GOOGLE_TOKEN_INVALID, 'Không xác thực được tài khoản Google', 401);

export const roleRequired = (): AppException =>
  new AppException(IdentityError.ROLE_REQUIRED, 'Hãy chọn vai trò cho tài khoản mới', 400);

export const cannotLockSelf = (): AppException =>
  new AppException(IdentityError.CANNOT_LOCK_SELF, 'Không thể khóa tài khoản của chính mình', 409);
