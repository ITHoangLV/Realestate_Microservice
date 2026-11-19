import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvVars } from '../config/env.validation';
import { RedisService } from '../redis/redis.service';
import { AuthController } from './controllers/auth.controller';
import { BankAccountController } from './controllers/bank-account.controller';
import { UsersAdminController } from './controllers/users.admin.controller';
import { UsersInternalController } from './controllers/users.internal.controller';
import { UserAdminService } from './services/user-admin.service';
import { BankAccount } from './entities/bank-account.entity';
import { BankAccountCipher, parseEncryptionKey } from './services/bank-account.cipher';
import { BankAccountService } from './services/bank-account.service';
import { AuthService } from './services/auth.service';
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
    UsersAdminController,
    UsersInternalController,
  ],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    BankAccountService,
    UserAdminService,
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
