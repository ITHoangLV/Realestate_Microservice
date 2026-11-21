import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { otpInvalid, otpResendTooSoon } from '../errors/identity.errors';
import { OTP_STORE } from '../stores/otp.store';
import type { OtpStore } from '../stores/otp.store';
import { hashToken } from '../stores/redis-refresh-token.store';
import { MailService } from './mail.service';
import { findUserByEmail } from './user-email.query';

/** Số liệu OTP lấy từ `OTP_*` (Báo cáo Bảng 2.6). */
export interface EmailVerificationConfig {
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
}

/** Token DI của cấu hình. */
export const EMAIL_VERIFICATION_CONFIG = Symbol('EMAIL_VERIFICATION_CONFIG');

/**
 * Xác minh email bằng OTP 6 chữ số (`API_Spec §1.6`, `Processing_Flow §3a`).
 *
 * OTP chỉ lưu dạng băm `sha256(userId:otp)` trong Redis (`OtpStore`), không lưu DB. Số lần sai được tăng
 * nguyên tử trong store TRƯỚC khi so mã, nên nhiều request song song không né được giới hạn.
 * Mọi lý do thất bại của `verify` trả cùng `IDENTITY_OTP_INVALID` (không có tài khoản, đã xác minh, bị khóa,
 * mã sai, hết hạn, bị hủy) để người ngoài không phân biệt được.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(OTP_STORE) private readonly store: OtpStore,
    private readonly mail: MailService,
    @Inject(EMAIL_VERIFICATION_CONFIG) private readonly config: EmailVerificationConfig,
  ) {}

  /** Ném `503` nếu Redis dừng. Đăng ký gọi TRƯỚC khi ghi DB để không tạo tài khoản không nhận được mã. */
  ensureAvailable(): Promise<void> {
    return this.store.assertReady();
  }

  /**
   * Sinh OTP mới (thay mã cũ, đặt lại số lần sai), bắt đầu thời gian chờ gửi lại rồi gửi email (không chờ).
   * Redis lỗi thì ném lỗi và KHÔNG gửi mail: một mã không ai kiểm được là vô nghĩa.
   */
  async issue(userId: string, email: string): Promise<void> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.store.save(
      userId,
      hashOtp(userId, otp),
      this.config.otpTtlSeconds,
      this.config.otpResendCooldownSeconds,
    );
    this.mail.sendOtp(email, otp);
  }

  /** Kiểm OTP; đúng thì tài khoản `ACTIVE`. Đúng 2 truy vấn DB (SELECT user, UPDATE). */
  async verify(email: string, otp: string): Promise<User> {
    const user = await findUserByEmail(this.users, email);
    if (user?.status !== 'PENDING_VERIFICATION') throw otpInvalid();

    const attempt = await this.store.attempt(user.id, this.config.otpMaxAttempts);
    if (attempt.status === 'none') throw otpInvalid();

    if (!sameHash(attempt.hash, hashOtp(user.id, otp))) {
      // Lần sai thứ N (N = số lần tối đa) hủy mã: kẻ đoán không có lần thử nào nữa
      if (attempt.attempts >= this.config.otpMaxAttempts) await this.store.remove(user.id);
      throw otpInvalid();
    }
    await this.store.remove(user.id);

    // Điều kiện status chặn hai verify song song cùng thắng: chỉ một UPDATE đổi được dòng
    const result = await this.users.update(
      { id: user.id, status: 'PENDING_VERIFICATION' },
      { status: 'ACTIVE', emailVerifiedAt: () => 'now()' },
    );
    if (!result.affected) throw otpInvalid();
    return { ...user, status: 'ACTIVE' };
  }

  /**
   * Gửi lại OTP. Email không có tài khoản, hoặc không còn chờ xác minh: im lặng (không lộ email).
   * Còn trong thời gian chờ: `429 IDENTITY_OTP_RESEND_TOO_SOON` (chỉ với tài khoản có thật, xem C21).
   */
  async resend(email: string): Promise<void> {
    const user = await findUserByEmail(this.users, email);
    if (user?.status !== 'PENDING_VERIFICATION') return;
    if (!(await this.store.tryStartCooldown(user.id, this.config.otpResendCooldownSeconds))) {
      throw otpResendTooSoon();
    }
    await this.issue(user.id, user.email);
  }
}

const hashOtp = (userId: string, otp: string): string => hashToken(`${userId}:${otp}`);

/** So hai chuỗi hex băm trong thời gian không phụ thuộc vị trí khác nhau. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
