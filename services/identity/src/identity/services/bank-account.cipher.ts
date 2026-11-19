import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const IV_BYTES = 12;
export const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ALGORITHM = 'aes-256-gcm';

/**
 * Đọc khóa từ chuỗi base64 (`BANK_ACCOUNT_ENCRYPTION_KEY`). Phải giải ra đúng 32 byte.
 * Thông báo lỗi không chứa giá trị khóa.
 */
export function parseEncryptionKey(base64: string): Buffer {
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ? Buffer.from(base64, 'base64')
    : Buffer.alloc(0);
  if (key.length !== KEY_BYTES) {
    throw new Error('BANK_ACCOUNT_ENCRYPTION_KEY phải là base64 của đúng 32 byte');
  }
  return key;
}

/**
 * Mã hóa số tài khoản ngân hàng khi lưu (`RE.IDENTITY/API_Spec.md §1.4`).
 *
 * Định dạng: `iv (12 byte) ‖ authTag (16 byte) ‖ ciphertext`, AES-256-GCM, IV ngẫu nhiên mỗi lần ghi.
 * AAD = `userId`: dòng của người này chép sang người khác thì giải mã lỗi.
 *
 * Giải mã lỗi (khóa sai, dữ liệu hỏng, sai AAD) ném `Error` thường; `AllExceptionsFilter` đổi thành
 * `500 INTERNAL_ERROR` và không lộ nội dung. Thông báo lỗi của Node không chứa số tài khoản.
 * Không xoay khóa (hạn chế ghi ở `security-policy.md §6`).
 *
 * Chỉ identity dùng, không đưa vào phần chung của template.
 */
export class BankAccountCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new Error('Khóa mã hóa số tài khoản phải đúng 32 byte');
    }
  }

  encrypt(plain: string, userId: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(userId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(data: Buffer, userId: string): string {
    if (data.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Dữ liệu số tài khoản đã mã hóa không hợp lệ');
    }
    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
