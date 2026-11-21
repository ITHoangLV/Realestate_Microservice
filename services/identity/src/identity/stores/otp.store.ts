/** Token DI của nơi lưu OTP. */
export const OTP_STORE = Symbol('OTP_STORE');

/** Kết quả một lần thử: không có OTP còn hiệu lực, hoặc có mã băm để so và số lần thử tính cả lần này. */
export type OtpAttempt = { status: 'none' } | { status: 'pending'; hash: string; attempts: number };

/**
 * Nơi lưu OTP xác minh email (Redis, `Component_Class_Design §3`). Mã chỉ lưu dạng băm.
 * Cài đặt thật: `RedisOtpStore`; test đơn vị dùng bản trong bộ nhớ.
 */
export interface OtpStore {
  /** Ném `503 DEPENDENCY_UNAVAILABLE` nếu Redis chưa sẵn sàng (gọi TRƯỚC khi ghi DB lúc đăng ký). */
  assertReady(): Promise<void>;

  /** Thay mã cũ (nếu có), đặt lại số lần sai về 0, hết hạn sau `ttlSeconds`; bắt đầu thời gian chờ gửi lại. */
  save(userId: string, otpHash: string, ttlSeconds: number, cooldownSeconds: number): Promise<void>;

  /** Bắt đầu thời gian chờ gửi lại nếu chưa có. `false` = vẫn đang chờ (nguyên tử, hai request song song chỉ một bên được). */
  tryStartCooldown(userId: string, cooldownSeconds: number): Promise<boolean>;

  /**
   * Một lần thử: tăng số lần thử (nguyên tử) TRƯỚC khi người gọi so mã, để request song song không né được giới hạn.
   * Quá `maxAttempts` thì xóa OTP và trả `none`.
   */
  attempt(userId: string, maxAttempts: number): Promise<OtpAttempt>;

  remove(userId: string): Promise<void>;
}
