import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvVars } from '../config/env.validation';
import { AccessGuard } from './access.guard';
import { GatewayController } from './gateway.controller';
import { GatewayThrottlerGuard } from './gateway-throttler.guard';
import { ProxyMiddleware } from './proxy.middleware';
import { RouteNotFoundFilter } from './route-not-found.filter';
import { RouteResolver } from './route-resolver';
import { createThrottlerOptions } from './throttle.config';

/**
 * Định tuyến, kiểm quyền mức tuyến, rate limit và chuyển tiếp. Không chứa nghiệp vụ, không DB.
 * JwtTokenVerifier (AuthModule, toàn cục) và PinoLogger được dùng chung từ template.
 * Import SAU HealthModule trong AppModule để `/api/v1/health` khớp route riêng trước catch-all.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => createThrottlerOptions(config),
    }),
  ],
  controllers: [GatewayController],
  providers: [
    RouteResolver,
    AccessGuard,
    GatewayThrottlerGuard,
    ProxyMiddleware,
    // Đăng ký SAU AllExceptionsFilter (app.module) để filter cụ thể này được ưu tiên cho NotFoundException
    { provide: APP_FILTER, useClass: RouteNotFoundFilter },
  ],
  exports: [ProxyMiddleware],
})
export class GatewayModule {}
