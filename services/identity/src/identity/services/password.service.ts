import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Tham số argon2id theo khuyến nghị OWASP (cấu hình tối thiểu): 19 MiB bộ nhớ, 2 vòng, 1 luồng.
 * Tăng memoryCost/timeCost nếu máy chủ chịu được; hash cũ vẫn verify đúng vì tham số nằm trong chuỗi hash.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash mật khẩu bằng argon2id (@node-rs/argon2, có bản build sẵn, không cần compiler).
 * Chuỗi hash có dạng `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`: đã chứa salt ngẫu nhiên
 * và tham số, nên chỉ cần lưu MỘT cột password_hash.
 */
@Injectable()
export class PasswordService {
  /** Hash giả cùng tham số, dùng để login email không tồn tại vẫn tốn thời gian như email có thật. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /** Trả false khi sai mật khẩu hoặc hash hỏng/không đọc được (không bao giờ ném lỗi). */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Chạy một lần verify vô nghĩa. Gọi khi không tìm thấy user (hoặc user chưa có mật khẩu)
   * để thời gian phản hồi không tiết lộ "email này có đăng ký hay không".
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, password);
  }
}
