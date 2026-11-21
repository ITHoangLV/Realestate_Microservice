import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { DataSource, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { OutboxService } from '../../messaging/outbox.service';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { SELF_REGISTER_ROLES, User } from '../entities/user.entity';
import type { UserRole } from '../entities/user.entity';
import { UserIdentity } from '../entities/user-identity.entity';
import { accountLocked, googleTokenInvalid, roleRequired } from '../errors/identity.errors';
import { AuthService } from './auth.service';
import { GOOGLE_ID_TOKEN_VERIFIER } from './google-id-token.verifier';
import type { GoogleIdentity, GoogleIdTokenVerifier } from './google-id-token.verifier';
import { uniqueViolationConstraint } from './unique-violation';
import { findUserByEmail } from './user-email.query';

/** Ràng buộc "mỗi user một liên kết Google" (migration `CreateIdentityTables`). */
const USER_PROVIDER_CONSTRAINT = 'UQ_user_identities_user_provider';

/** Cấu hình Google; `clientId` trống = tắt đăng nhập Google (route 14 trả 503). */
export interface GoogleAuthConfig {
  clientId?: string;
}
export const GOOGLE_AUTH_CONFIG = Symbol('GOOGLE_AUTH_CONFIG');

const FULL_NAME_MAX = 200;

/**
 * Đăng nhập bằng Google (route 14, `API_Spec §1.8`, `Processing_Flow §3c`). Frontend lấy ID token bằng Google
 * Sign-In rồi gửi lên; ở đây kiểm token, rồi tìm, liên kết hoặc tạo tài khoản và cấp phiên.
 *
 * Số truy vấn DB: đã liên kết 2; email đã có tài khoản 3–4; tài khoản mới 5 (ngưỡng ghi là 6).
 */
@Injectable()
export class GoogleAuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserIdentity) private readonly identities: Repository<UserIdentity>,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
    @Inject(GOOGLE_ID_TOKEN_VERIFIER) private readonly verifier: GoogleIdTokenVerifier,
    @Inject(GOOGLE_AUTH_CONFIG) private readonly config: GoogleAuthConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GoogleAuthService.name);
  }

  onModuleInit(): void {
    if (!this.config.clientId) {
      this.logger.warn('GOOGLE_CLIENT_ID chưa đặt: POST /auth/google trả 503 cho tới khi cấu hình');
    }
  }

  async login(idToken: string, role?: string): Promise<AuthTokensDto> {
    // Dòng 0: chưa cấu hình thì không có gì để kiểm. Trả 503 TRƯỚC khi kiểm token
    if (!this.config.clientId) {
      throw new AppException(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        'Đăng nhập Google chưa được cấu hình',
        503,
      );
    }
    // Dòng 1: token sai chữ ký, `aud`, hết hạn (ném 401); Google không tải được khóa (ném 503)
    const google = await this.verifier.verify(idToken);
    // Dòng 2: bắt buộc có email đã xác minh (Báo cáo Bảng 2.6)
    if (!google.email || !google.emailVerified) throw googleTokenInvalid();

    const user = await this.resolveUser(google, role);
    if (user.status === 'LOCKED') throw accountLocked(); // dòng 7
    return this.auth.issueSession(user); // dòng 8
  }

  /**
   * Dòng 3–6: tìm user theo liên kết, rồi theo email, rồi mới tạo. Hai request đồng thời có thể cùng thấy
   * "chưa có" rồi cùng ghi; ràng buộc duy nhất của DB chọn người thắng, bên thua chạy lại MỘT lần và rơi vào
   * nhánh "đã có".
   *
   * Dòng 4a (v2.4): lần thử lại vẫn trùng `UQ_user_identities_user_provider` nghĩa là tài khoản của email đã
   * liên kết với một `sub` Google KHÁC -> 401, không gỡ liên kết cũ (gỡ thì tài khoản Google mới chiếm được
   * tài khoản có sẵn chỉ bằng email). Không kết luận ở lần đầu: đua cùng `sub` cũng có thể báo chỉ mục này.
   */
  private async resolveUser(
    google: GoogleIdentity,
    role: string | undefined,
    retried = false,
  ): Promise<User> {
    const link = await this.identities.findOne({
      where: { provider: 'google', providerUserId: google.sub },
    });
    if (link) {
      const linked = await this.users.findOneBy({ id: link.userId });
      if (!linked) throw googleTokenInvalid(); // liên kết trỏ tới user đã bị xóa
      return linked;
    }

    const existing = await findUserByEmail(this.users, google.email);
    try {
      if (existing) return await this.linkExisting(existing, google);
      return await this.createNew(google, role);
    } catch (err) {
      const constraint = uniqueViolationConstraint(err);
      if (constraint !== undefined) {
        if (!retried) return this.resolveUser(google, role, true);
        if (constraint === USER_PROVIDER_CONSTRAINT) throw googleTokenInvalid();
      }
      throw err;
    }
  }

  /**
   * Dòng 4: email đã có tài khoản thì tự liên kết, giữ nguyên vai trò. Tài khoản còn `PENDING_VERIFICATION`
   * thành `ACTIVE` và bị XÓA mật khẩu: mật khẩu đó do người chưa chứng minh sở hữu email đặt; chủ email thật
   * đặt lại qua route 12. Tài khoản bị khóa thì không liên kết gì (dòng 7).
   */
  private async linkExisting(user: User, google: GoogleIdentity): Promise<User> {
    if (user.status === 'LOCKED') return user;
    await this.dataSource.transaction(async (manager) => {
      await manager.save(UserIdentity, {
        userId: user.id,
        provider: 'google',
        providerUserId: google.sub,
      });
      if (user.status === 'PENDING_VERIFICATION') {
        await manager.update(
          User,
          { id: user.id, status: 'PENDING_VERIFICATION' },
          { status: 'ACTIVE', emailVerifiedAt: () => 'now()', passwordHash: null },
        );
      }
    });
    this.logger.info({ userId: user.id }, 'Liên kết Google với tài khoản có sẵn');
    return user.status === 'PENDING_VERIFICATION'
      ? { ...user, status: 'ACTIVE', passwordHash: null }
      : user;
  }

  /** Dòng 5, 6: chưa có tài khoản. Phải có `role` (BR-01: không `ADMIN`). */
  private async createNew(google: GoogleIdentity, role: string | undefined): Promise<User> {
    if (!role || !(SELF_REGISTER_ROLES as readonly string[]).includes(role)) throw roleRequired();

    const email = google.email.toLowerCase();
    const fullName = (google.name?.trim() || email.split('@')[0]).slice(0, FULL_NAME_MAX);
    const created = await this.dataSource.transaction(async (manager: EntityManager) => {
      const user = await manager.save(User, {
        email,
        passwordHash: null,
        fullName,
        role: role as UserRole,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
      await manager.save(UserIdentity, {
        userId: user.id,
        provider: 'google',
        providerUserId: google.sub,
      });
      await this.outbox.add(manager, 'identity.registered', {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
      return user;
    });
    this.logger.info(
      { userId: created.id, role: created.role },
      'Đăng ký tài khoản mới bằng Google',
    );
    return created;
  }
}
