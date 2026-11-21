import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { createTransport } from 'nodemailer';
import { EnvVars } from '../config/env.validation';
import { RedisService } from '../redis/redis.service';
import { AuthController } from './controllers/auth.controller';
import { BankAccountController } from './controllers/bank-account.controller';
import { ProfileController } from './controllers/profile.controller';
import { UsersAdminController } from './controllers/users.admin.controller';
import { UsersInternalController } from './controllers/users.internal.controller';
import { UserAdminService } from './services/user-admin.service';
import { ProfileService } from './services/profile.service';
import { BankAccount } from './entities/bank-account.entity';
import { BankAccountCipher, parseEncryptionKey } from './services/bank-account.cipher';
import { BankAccountService } from './services/bank-account.service';
import { AuthService } from './services/auth.service';
import {
  EMAIL_VERIFICATION_CONFIG,
  EmailVerificationService,
} from './services/email-verification.service';
import type { EmailVerificationConfig } from './services/email-verification.service';
import { GOOGLE_AUTH_CONFIG, GoogleAuthService } from './services/google-auth.service';
import {
  GOOGLE_ID_TOKEN_VERIFIER,
  GoogleLibraryVerifier,
} from './services/google-id-token.verifier';
import type { GoogleIdTokenVerifier } from './services/google-id-token.verifier';
import { MAIL_OPTIONS, MAIL_TRANSPORT, MailService } from './services/mail.service';
import {
  PASSWORD_RESET_CONFIG,
  PASSWORD_RESET_PREFIX,
  PASSWORD_RESET_REDIS,
  PasswordResetService,
} from './services/password-reset.service';
import type { PasswordResetConfig } from './services/password-reset.service';
import type { MailOptions, MailTransport } from './services/mail.service';
import { OTP_STORE } from './stores/otp.store';
import { RedisOtpStore } from './stores/redis-otp.store';
import { User } from './entities/user.entity';
import { UserIdentity } from './entities/user-identity.entity';
import { PasswordService } from './services/password.service';
import { RedisRefreshTokenStore } from './stores/redis-refresh-token.store';
import { REFRESH_TOKEN_STORE } from './stores/refresh-token.store';
import { TokenService } from './services/token.service';

/**
 * Nghiệp vụ của identity-service. Chỉ được nạp khi có đủ DB, Redis, RabbitMQ và khóa riêng
 * (xem app.module.ts và isIdentityEnabled()).
 *
 * Refresh token lưu ở Redis qua REFRESH_TOKEN_STORE. Muốn đổi nơi lưu, chỉ cần provide một
 * lớp khác cài đặt RefreshTokenStore ở đây.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, UserIdentity, BankAccount]), JwtModule.register({})],
  controllers: [
    AuthController,
    BankAccountController,
    ProfileController,
    UsersAdminController,
    UsersInternalController,
  ],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    BankAccountService,
    UserAdminService,
    ProfileService,
    EmailVerificationService,
    PasswordResetService,
    GoogleAuthService,
    {
      provide: GOOGLE_AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        clientId: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      }),
    },
    {
      // Không có GOOGLE_CLIENT_ID thì GoogleAuthService trả 503 trước khi gọi bộ kiểm, nên bộ kiểm này không bao giờ chạy
      provide: GOOGLE_ID_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): GoogleIdTokenVerifier =>
        new GoogleLibraryVerifier(config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? ''),
    },
    {
      provide: PASSWORD_RESET_REDIS,
      inject: [RedisService],
      useFactory: (redis: RedisService) => redis.client,
    },
    {
      provide: PASSWORD_RESET_PREFIX,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        config.get('REFRESH_TOKEN_REDIS_PREFIX', { infer: true }),
    },
    {
      provide: PASSWORD_RESET_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): PasswordResetConfig => ({
        ttlSeconds: config.get('PASSWORD_RESET_TTL_SECONDS', { infer: true }),
        resetUrl: config.get('PASSWORD_RESET_URL', { infer: true }),
      }),
    },
    {
      // Timeout 5 giây cho mọi pha: SMTP treo không giữ tài nguyên lâu (gửi chạy nền, API_Spec §1.1)
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): MailTransport => {
        const port = config.get('SMTP_PORT', { infer: true });
        const user = config.get('SMTP_USER', { infer: true });
        return createTransport({
          host: config.get('SMTP_HOST', { infer: true }),
          port,
          secure: port === 465,
          auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 5000,
        });
      },
    },
    {
      provide: MAIL_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): MailOptions => ({
        from: config.get('MAIL_FROM', { infer: true }) ?? '',
        otpTtlSeconds: config.get('OTP_TTL_SECONDS', { infer: true }),
        resetTtlSeconds: config.get('PASSWORD_RESET_TTL_SECONDS', { infer: true }),
      }),
    },
    {
      provide: MailService,
      inject: [MAIL_TRANSPORT, MAIL_OPTIONS, PinoLogger],
      useFactory: (transport: MailTransport, options: MailOptions, logger: PinoLogger) =>
        new MailService(transport, options, logger),
    },
    {
      provide: EMAIL_VERIFICATION_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>): EmailVerificationConfig => ({
        otpTtlSeconds: config.get('OTP_TTL_SECONDS', { infer: true }),
        otpMaxAttempts: config.get('OTP_MAX_ATTEMPTS', { infer: true }),
        otpResendCooldownSeconds: config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true }),
      }),
    },
    {
      // Cùng tiền tố key với refresh token (`identity:`), khớp tên key ở Component_Class_Design §3
      provide: OTP_STORE,
      inject: [RedisService, ConfigService],
      useFactory: (redis: RedisService, config: ConfigService<EnvVars, true>) =>
        new RedisOtpStore(redis.client, config.get('REFRESH_TOKEN_REDIS_PREFIX', { infer: true })),
    },
    {
      provide: BankAccountCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        new BankAccountCipher(
          parseEncryptionKey(config.get('BANK_ACCOUNT_ENCRYPTION_KEY', { infer: true }) ?? ''),
        ),
    },
    {
      provide: REFRESH_TOKEN_STORE,
      inject: [RedisService, ConfigService],
      useFactory: (redis: RedisService, config: ConfigService<EnvVars, true>) =>
        new RedisRefreshTokenStore(
          redis.client,
          config.get('JWT_REFRESH_TTL_SECONDS', { infer: true }),
          config.get('REFRESH_TOKEN_REDIS_PREFIX', { infer: true }),
        ),
    },
  ],
  exports: [AuthService],
})
export class IdentityModule {}
