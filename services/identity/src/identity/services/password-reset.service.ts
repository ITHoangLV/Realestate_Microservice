import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { resetTokenInvalid } from '../errors/identity.errors';
import { REFRESH_TOKEN_STORE } from '../stores/refresh-token.store';
import type { RefreshTokenStore } from '../stores/refresh-token.store';
import { hashToken } from '../stores/redis-refresh-token.store';
import { MailService } from './mail.service';
import { PasswordService } from './password.service';
import { findUserByEmail } from './user-email.query';

export interface PasswordResetConfig {
  /** `PASSWORD_RESET_TTL_SECONDS`. */
  ttlSeconds: number;
  /** `PASSWORD_RESET_URL`: trang Next.js nhận `?token=`. */
  resetUrl: string;
}

/** Token DI của Redis (chỉ cần `set`, `getdel`), tiền tố key và cấu hình. */
export const PASSWORD_RESET_REDIS = Symbol('PASSWORD_RESET_REDIS');
export const PASSWORD_RESET_PREFIX = Symbol('PASSWORD_RESET_PREFIX');
export const PASSWORD_RESET_CONFIG = Symbol('PASSWORD_RESET_CONFIG');

/**
 * Quên và đặt lại mật khẩu (`API_Spec §1.7`, `Processing_Flow §3b`).
 *
 * Token ngẫu nhiên 32 byte (base64url) chỉ gửi qua email; Redis lưu `sha256(token) -> userId`
 * (`<prefix>pwreset:<sha256>`), nên đọc Redis không cho ai token dùng được. Dùng một lần: `GETDEL` nguyên tử,
 * hai request song song cùng token thì chỉ một bên lấy được userId.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(PASSWORD_RESET_REDIS) private readonly redis: Pick<Redis, 'set' | 'getdel'>,
    @Inject(PASSWORD_RESET_PREFIX) private readonly prefix: string,
    private readonly passwords: PasswordService,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
    private readonly mail: MailService,
    @Inject(PASSWORD_RESET_CONFIG) private readonly config: PasswordResetConfig,
  ) {}

  private key(token: string): string {
    return `${this.prefix}pwreset:${hashToken(token)}`;
  }

  /**
   * Route 12: không bao giờ cho biết email có tài khoản hay không (người gọi luôn nhận `202`).
   * Có tài khoản và không bị khóa thì sinh token, lưu Redis, gửi link (không chờ). Tài khoản chưa xác minh
   * vẫn được đặt lại: chủ email chứng minh bằng chính thư này.
   */
  async request(email: string): Promise<void> {
    const user = await findUserByEmail(this.users, email);
    if (!user || user.status === 'LOCKED') return;

    const token = randomBytes(32).toString('base64url');
    await this.redis.set(this.key(token), user.id, 'EX', this.config.ttlSeconds);

    const link = new URL(this.config.resetUrl);
    link.searchParams.set('token', token);
    this.mail.sendPasswordReset(user.email, link.toString());
  }

  /**
   * Route 13: lấy và xóa token trong một lệnh, đổi mật khẩu, thu hồi MỌI phiên của người đó.
   * Token không có, hết hạn, đã dùng: cùng một lỗi. Mật khẩu chỉ băm sau khi token hợp lệ (không để
   * token bậy tốn CPU argon2).
   */
  async reset(token: string, newPassword: string): Promise<void> {
    const userId = await this.redis.getdel(this.key(token));
    if (!userId) throw resetTokenInvalid();

    const passwordHash = await this.passwords.hash(newPassword);
    const result = await this.users.update({ id: userId }, { passwordHash });
    if (!result.affected) throw resetTokenInvalid(); // user đã bị xóa sau khi cấp token

    await this.refreshTokens.revokeAllForUser(userId);
  }
}
