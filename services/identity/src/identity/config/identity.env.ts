import Joi from 'joi';
import { parseEncryptionKey } from '../services/bank-account.cipher';

/** Lệnh sinh khóa mã hóa số tài khoản (in kèm thông báo lỗi để người dùng làm theo ngay). */
export const GENERATE_KEY_COMMAND =
  "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";

/**
 * Biến BẮT BUỘC riêng của identity-service, kiểm tra thêm ngoài envSchema chung.
 * Gọi từ env.bootstrap.ts khi khởi động (bỏ qua khi NODE_ENV=test để các test chung của template
 * chạy được không cần DB/Redis; test của identity tự đặt đủ biến).
 *
 * Tách riêng (không nhét vào envSchema) để envSchema vẫn dùng chung được cho mọi service.
 */
export const identityRequiredSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_ISSUER: Joi.string().required(),
  // Khóa AES-256-GCM mã hóa số tài khoản nhận tiền: base64 của đúng 32 byte. Dùng lại parseEncryptionKey
  // (cùng bộ kiểm với lúc tạo BankAccountCipher), không viết bộ kiểm thứ hai.
  BANK_ACCOUNT_ENCRYPTION_KEY: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      try {
        parseEncryptionKey(value);
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    }),
  // Gửi email OTP, đặt lại mật khẩu. SMTP_USER, SMTP_PASSWORD, GOOGLE_CLIENT_ID tùy chọn.
  SMTP_HOST: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),
  // Khóa công khai để chính identity kiểm tra token ở GET /me
  JWT_PUBLIC_KEY: Joi.string(),
  JWT_PUBLIC_KEY_PATH: Joi.string(),
  JWT_PRIVATE_KEY: Joi.string(),
  JWT_PRIVATE_KEY_PATH: Joi.string(),
})
  .or('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_PATH')
  .or('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_PATH')
  .unknown(true);

/** Trả về danh sách lỗi dễ đọc, rỗng nếu đủ. */
export function checkIdentityEnv(env: Record<string, unknown>): string[] {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([, v]) => typeof v !== 'string' || v.trim() !== ''),
  );
  const { error } = identityRequiredSchema.validate(clean, { abortEarly: false });
  if (!error) return [];
  return error.details.map((d) => {
    if (d.type === 'object.missing') {
      return `  - cần MỘT trong: ${(d.context?.peersWithLabels as string[] | undefined)?.join(' hoặc ') ?? d.message}`;
    }
    // Giá trị có mặt nhưng sai: nói rõ cần gì, KHÔNG in giá trị (có thể là khóa thật)
    if (d.type === 'any.invalid') {
      return `  - ${d.path.join('.')}: phải là base64 của đúng 32 byte. Sinh khóa: ${GENERATE_KEY_COMMAND}`;
    }
    return `  - ${d.path.join('.')}: THIẾU (bắt buộc với identity-service)`;
  });
}
