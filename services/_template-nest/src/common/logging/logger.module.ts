import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { EnvVars } from '../../config/env.validation';
import { getCorrelationId } from './correlation-id.middleware';

/**
 * Token để test thay đích ghi log (mặc định null = ghi ra stdout).
 * Dùng: Test.createTestingModule(...).overrideProvider(LOG_STREAM).useValue({ write: (line) => ... })
 */
export const LOG_STREAM = Symbol('LOG_STREAM');

@Module({
  providers: [{ provide: LOG_STREAM, useValue: null }],
  exports: [LOG_STREAM],
})
class LogStreamModule {}

// Không bao giờ in các trường nhạy cảm, dù ai đó vô tình log cả request/body.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
];

/**
 * Log JSON một dòng ra stdout bằng nestjs-pino. Mỗi dòng có:
 *   level, time (ISO UTC), service, correlationId (khi nằm trong request), msg
 * Dòng tổng kết request (access-log.middleware.ts) thêm: method, url, statusCode, responseTime.
 * LOG_PRETTY=true bật pino-pretty (chỉ dùng dev).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [LogStreamModule],
      inject: [ConfigService, LOG_STREAM],
      useFactory: (config: ConfigService<EnvVars, true>, stream: DestinationStream | null) => {
        const pretty = config.get('LOG_PRETTY', { infer: true }) && !stream;
        const options: Options = {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: { service: config.get('SERVICE_NAME', { infer: true }) },
          // Thời gian ISO-8601 UTC, ví dụ 2026-11-05T10:00:00.000Z
          timestamp: () => `,"time":"${new Date().toISOString()}"`,
          // level dạng chữ ("info") thay vì số (30)
          formatters: { level: (label) => ({ level: label }) },
          // Gắn correlationId vào MỌI dòng log phát sinh trong phạm vi request (log của service, filter...)
          mixin: () => {
            const correlationId = getCorrelationId();
            return correlationId ? { correlationId } : {};
          },
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          ...(pretty && {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:standard' },
            },
          }),
        };
        return { pinoHttp: stream ? [options, stream] : options, forRoutes: [] };
      },
    }),
  ],
})
export class AppLoggerModule {}
