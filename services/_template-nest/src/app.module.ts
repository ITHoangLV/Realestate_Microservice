import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/errors/validation-pipe.factory';
import { AppLoggerModule } from './common/logging/logger.module';
import { AppConfigModule } from './config/config.module';

/**
 * Module gốc. Các module tùy chọn (Database, Redis) được thêm ở các bước sau và chỉ bật khi có env.
 *
 * Filter và pipe đăng ký qua APP_FILTER/APP_PIPE (không dùng app.useGlobalX trong main.ts)
 * để test e2e tạo app từ AppModule cũng chạy đúng cùng hành vi.
 *
 * Chỗ thêm RabbitMQ (outbox) sau này: tạo `src/messaging/` với MessagingModule đọc RABBITMQ_URL,
 * publish vào exchange `domain.events` qua bảng outbox, rồi đăng ký health check 'rabbitmq'
 * vào HealthRegistry. Template CHƯA có code RabbitMQ.
 */
@Module({
  imports: [AppConfigModule, ClsModule.forRoot({ global: true }), AppLoggerModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
