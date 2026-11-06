import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvVars } from '../config/env.validation';
import { RedisService } from '../redis/redis.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { UserIdentity } from './entities/user-identity.entity';
import { PasswordService } from './password.service';
import { RedisRefreshTokenStore } from './redis-refresh-token.store';
import { REFRESH_TOKEN_STORE } from './refresh-token.store';
import { TokenService } from './token.service';

/**
 * Nghiệp vụ của identity-service. Chỉ được nạp khi có đủ DB, Redis, RabbitMQ và khóa riêng
 * (xem app.module.ts và isIdentityEnabled()).
 *
 * Refresh token lưu ở Redis qua REFRESH_TOKEN_STORE. Muốn đổi nơi lưu, chỉ cần provide một
 * lớp khác cài đặt RefreshTokenStore ở đây.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, UserIdentity]), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
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
