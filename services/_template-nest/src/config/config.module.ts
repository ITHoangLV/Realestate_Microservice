import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Cấu hình toàn cục: đọc .env + biến môi trường, validate bằng Joi (env.validation.ts).
 * Dùng `ConfigService<EnvVars, true>` để lấy giá trị có kiểu.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: false,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
