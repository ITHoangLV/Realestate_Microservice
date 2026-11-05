import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';

/**
 * Module gốc. Các module tùy chọn (Database, Redis) được thêm ở các bước sau và chỉ bật khi có env.
 *
 * Chỗ thêm RabbitMQ (outbox) sau này: tạo `src/messaging/` với MessagingModule đọc RABBITMQ_URL,
 * publish vào exchange `domain.events` qua bảng outbox, rồi đăng ký health check 'rabbitmq'
 * vào HealthRegistry. Template CHƯA có code RabbitMQ.
 */
@Module({
  imports: [AppConfigModule],
})
export class AppModule {}
