import { INestApplication, RequestMethod } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/**
 * Cấu hình dùng chung cho main.ts và test e2e (để test chạy đúng như thật):
 * - Prefix /api/v1 cho API công khai.
 * - /health giữ nguyên (cho Docker HEALTHCHECK) và có thêm /api/v1/health (alias).
 * - /internal/... KHÔNG gắn prefix: API nội bộ service-gọi-service, gateway không expose.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: `${API_PREFIX}/health`, method: RequestMethod.GET },
      { path: 'internal/{*path}', method: RequestMethod.ALL },
    ],
  });
}
