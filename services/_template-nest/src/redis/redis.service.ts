import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { HealthRegistry } from '../health/health.registry';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Bọc ioredis: tự đăng ký health check 'redis' và đóng kết nối khi service tắt (SIGTERM).
 * Dùng `redis.client` để gọi lệnh Redis.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) public readonly client: Redis,
    private readonly registry: HealthRegistry,
    private readonly logger: PinoLogger,
  ) {
    // Inject thẳng PinoLogger (KHÔNG dùng @InjectPinoLogger: nó chỉ chạy nếu class được import
    // trước LoggerModule, rất dễ vỡ theo thứ tự import)
    this.logger.setContext(RedisService.name);
  }

  onModuleInit(): void {
    // Không có listener 'error' thì mỗi lần mất kết nối ioredis in lỗi thô; ghi log gọn ở đây
    this.client.on('error', (err) => this.logger.warn({ err }, 'Redis lỗi kết nối'));
    this.registry.register('redis', async () => (await this.client.ping()) === 'PONG');
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
