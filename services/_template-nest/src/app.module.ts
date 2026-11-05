import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/errors/validation-pipe.factory';
import { ShutdownLoggerService } from './common/lifecycle/shutdown-logger.service';
import { AppLoggerModule } from './common/logging/logger.module';
import { AppConfigModule } from './config/config.module';
import { isDatabaseEnabled, isRedisEnabled } from './config/feature-flags';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

/**
 * Module gốc.
 *
 * Module tùy chọn chỉ bật khi có biến môi trường tương ứng:
 *   DATABASE_URL -> DatabaseModule (TypeORM + PostgreSQL)
 *   REDIS_URL    -> RedisModule (ioredis)
 * Health check (/health) tự thêm `db`/`redis` vào `checks` khi module tương ứng được bật.
 *
 * Filter và pipe đăng ký qua APP_FILTER/APP_PIPE (không dùng app.useGlobalX trong main.ts)
 * để test e2e tạo app từ AppModule cũng chạy đúng cùng hành vi.
 *
 * Chỗ thêm RabbitMQ (outbox) sau này: tạo `src/messaging/` với MessagingModule đọc RABBITMQ_URL,
 * publish vào exchange `domain.events` qua bảng outbox, rồi đăng ký health check 'rabbitmq'
 * vào HealthRegistry (xem health.registry.ts). Template CHƯA có code RabbitMQ.
 */
@Module({
  imports: [
    AppConfigModule,
    ClsModule.forRoot({ global: true }),
    AppLoggerModule,
    HealthModule,
    ...(isDatabaseEnabled() ? [DatabaseModule] : []),
    ...(isRedisEnabled() ? [RedisModule] : []),
  ],
  providers: [
    ShutdownLoggerService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
