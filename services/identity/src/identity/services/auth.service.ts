import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { OutboxService } from '../../messaging/outbox.service';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { UserDto } from '../dto/user.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { User } from '../entities/user.entity';
import {
  accountLocked,
  emailNotVerified,
  emailTaken,
  invalidCredentials,
  invalidRefreshToken,
  phoneTaken,
} from '../errors/identity.errors';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { REFRESH_TOKEN_STORE } from '../stores/refresh-token.store';
import type { RefreshTokenStore } from '../stores/refresh-token.store';
import { TokenService } from './token.service';
import { findUserByEmail } from './user-email.query';
import { uniqueViolationConstraint } from './unique-violation';

/** Tên ràng buộc duy nhất của số điện thoại (migration `AddUserAccountColumns`). */
const PHONE_CONSTRAINT = 'UQ_users_phone';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(REFRESH_TOKEN_STORE) private readonly refreshTokens: RefreshTokenStore,
    private readonly outbox: OutboxService,
    private readonly emailVerification: EmailVerificationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /**
   * Đăng ký tài khoản mới (TENANT hoặc LANDLORD; DTO đã chặn ADMIN).
   *
   * Luồng: hash mật khẩu (ngoài transaction vì chậm) -> mở transaction -> INSERT user và ghi
   * event identity.registered vào outbox CÙNG transaction -> commit. Nhờ vậy user có trong DB
   * thì event chắc chắn sẽ được gửi, và rollback thì cả hai cùng mất.
   *
   * Trùng email, trùng số điện thoại được phát hiện bằng chính ràng buộc unique của DB (lỗi 23505, phân biệt
   * theo tên ràng buộc), KHÔNG bằng SELECT kiểm tra trước, vì hai request đăng ký cùng lúc đều thấy "chưa có"
   * rồi cùng insert.
   *
   * Tài khoản mới ở `PENDING_VERIFICATION`; sau commit sinh OTP và gửi email KHÔNG CHỜ (lỗi chỉ log `warn`,
   * `201` vẫn trả, người dùng bấm gửi lại). Redis được kiểm TRƯỚC khi ghi DB: Redis dừng thì `503` và không
   * có tài khoản nào được tạo mà không thể nhận mã.
   */
  async register(dto: RegisterDto): Promise<UserDto> {
    const passwordHash = await this.passwords.hash(dto.password);
    await this.emailVerification.ensureAvailable();
    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const created = await manager.save(User, {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
          status: 'PENDING_VERIFICATION',
          phone: dto.phone ?? null,
        });
        await this.outbox.add(manager, 'identity.registered', {
          userId: created.id,
          email: created.email,
          fullName: created.fullName,
          role: created.role,
        });
        return created;
      });
      this.logger.info({ userId: user.id, role: user.role }, 'Đăng ký tài khoản mới');
      // Không chờ, và không log email/lỗi gốc (có thể chứa địa chỉ)
      this.emailVerification.issue(user.id, user.email).catch((err: unknown) => {
        this.logger.warn(
          { userId: user.id, errName: (err as { name?: string } | null)?.name },
          'Không sinh được OTP sau khi đăng ký, người dùng cần gửi lại',
        );
      });
      return UserDto.from(user);
    } catch (err) {
      const constraint = uniqueViolationConstraint(err);
      if (constraint !== undefined) {
        throw constraint === PHONE_CONSTRAINT ? phoneTaken() : emailTaken();
      }
      throw err;
    }
  }

  /** Nhập OTP (route 10): đúng thì tài khoản `ACTIVE` và cấp phiên luôn. */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthTokensDto> {
    const user = await this.emailVerification.verify(dto.email, dto.otp);
    return this.issueSession(user);
  }

  /** Gửi lại OTP (route 11). Luôn im lặng với email lạ (xem `EmailVerificationService.resend`). */
  resendOtp(email: string): Promise<void> {
    return this.emailVerification.resend(email);
  }

  /**
   * Đăng nhập bằng email + mật khẩu.
   * Sai email và sai mật khẩu trả CÙNG một lỗi, và tốn thời gian như nhau (verifyDummy), để người
   * ngoài không dò được email nào đã đăng ký, kể cả bằng cách đo độ trễ.
   */
  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.findByEmail(dto.email);
    // Tài khoản chỉ đăng nhập bằng Google (passwordHash = null) cũng không vào được bằng mật khẩu
    if (!user?.passwordHash) {
      await this.passwords.verifyDummy(dto.password);
      throw invalidCredentials();
    }
    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      throw invalidCredentials();
    }
    // Kiểm trạng thái SAU mật khẩu: người không biết mật khẩu không dò được trạng thái tài khoản
    if (user.status === 'PENDING_VERIFICATION') throw emailNotVerified();
    if (user.status === 'LOCKED') throw accountLocked();
    return this.issueSession(user);
  }

  /**
   * Mở một phiên đăng nhập mới cho user: tạo họ refresh token mới và cặp token trả client.
   * Mọi cách đăng nhập (mật khẩu, sau này Google) xác minh xong đều gọi hàm này, nên refresh,
   * logout và /me không phụ thuộc cách đăng nhập.
   */
  async issueSession(user: Pick<User, 'id' | 'role'>): Promise<AuthTokensDto> {
    const familyId = randomUUID();
    const refreshToken = this.tokens.generateRefreshToken();
    await this.refreshTokens.create(refreshToken, user.id, familyId);
    return this.buildTokens(user, refreshToken);
  }

  /**
   * Đổi refresh token lấy cặp token mới (xoay vòng): token cũ chỉ dùng được MỘT lần.
   * Việc đổi diễn ra nguyên tử trong store. Dùng lại token cũ -> cả họ bị thu hồi.
   * Mọi kiểu thất bại trả cùng một lỗi để client không phân biệt được "hết hạn" với "bị dùng lại".
   */
  async refresh(oldRefreshToken: string): Promise<AuthTokensDto> {
    const newRefreshToken = this.tokens.generateRefreshToken();
    const result = await this.refreshTokens.rotate(oldRefreshToken, newRefreshToken);

    if (result.status === 'reuse') {
      // Dấu hiệu token bị đánh cắp: ghi log để theo dõi, người dùng thật phải đăng nhập lại
      this.logger.warn(
        { userId: result.userId, familyId: result.familyId },
        'Refresh token bị dùng lại, đã thu hồi cả họ token',
      );
    }
    if (result.status !== 'ok') throw invalidRefreshToken();

    const user = await this.users.findOneBy({ id: result.userId });
    if (!user) {
      // User đã bị xóa sau khi phát token: thu hồi luôn họ token này
      await this.refreshTokens.revokeFamilyOf(newRefreshToken);
      throw invalidRefreshToken();
    }
    return this.buildTokens(user, newRefreshToken);
  }

  /** Đăng xuất: thu hồi cả họ token của phiên này. Token lạ hay đã hết hạn cũng coi là xong (idempotent). */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revokeFamilyOf(refreshToken);
  }

  /** Thông tin người đang đăng nhập (userId lấy từ access token đã xác thực). */
  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) {
      // Token còn hạn nhưng user đã bị xóa
      throw new AppException(ErrorCode.AUTH_TOKEN_INVALID, 'Token không hợp lệ', 401);
    }
    return UserDto.from(user);
  }

  private async buildTokens(
    user: Pick<User, 'id' | 'role'>,
    refreshToken: string,
  ): Promise<AuthTokensDto> {
    const { accessToken, expiresIn } = await this.tokens.signAccessToken(user);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn };
  }

  private findByEmail(email: string): Promise<User | null> {
    return findUserByEmail(this.users, email);
  }
}
