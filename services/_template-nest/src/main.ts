import './config/env.bootstrap'; // PHẢI đứng đầu: nạp + validate env trước mọi thứ khác
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { EnvVars } from './config/env.validation';

async function bootstrap(): Promise<void> {
  // abortOnError=false: lỗi khởi động ném ra để ta tự in gọn và thoát, thay vì process.abort()
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  configureApp(app);

  // Graceful shutdown: SIGTERM/SIGINT -> Nest gọi onModuleDestroy (đóng DB/Redis/RabbitMQ)
  app.enableShutdownHooks();

  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error('Khởi động service thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
