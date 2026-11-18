import { INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { createAccessLogMiddleware } from './common/logging/access-log.middleware';
import {
  CORRELATION_HEADER,
  createCorrelationMiddleware,
} from './common/logging/correlation-id.middleware';
import { EnvVars } from './config/env.validation';
import { InternalBlockMiddleware } from './gateway/internal-block.middleware';
import { ProxyMiddleware } from './gateway/proxy.middleware';

export const API_PREFIX = 'api/v1';

/**
 * Cấu hình dùng chung cho main.ts và test e2e (để test chạy đúng như thật):
 * - Middleware (gắn bằng app.use để phủ MỌI request, kể cả /health, /internal/*, 404), theo thứ tự
 *   RE.GATEWAY/Component_Class_Design.md §3.1: correlation ID (CLS), access log, InternalBlock
 *   (/internal/* → 404), CORS. Guard và proxy chạy sau, trong GatewayController (§3.2).
 * - Prefix /api/v1 cho API công khai (catch-all của GatewayController nằm dưới prefix này).
 * - Sự kiện `upgrade` của HTTP server → ProxyMiddleware.upgrade (chỉ /ws).
 * - /health giữ nguyên (cho Docker HEALTHCHECK) và có thêm /api/v1/health (alias).
 * - /internal/... KHÔNG gắn prefix: API nội bộ service-gọi-service, gateway không expose.
 */
export function configureApp(app: INestApplication): void {
  // Không công bố framework (header X-Powered-By: Express) cho kẻ dò quét
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  // api-gateway: KHÔNG tin X-Forwarded-For (client giả được IP để né rate limit). Chốt 2026-11-16,
  // RE.GATEWAY/Component_Class_Design.md §6. Đặt rõ ràng thay vì dựa vào mặc định của Express.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', false);

  app.use(createCorrelationMiddleware());
  app.use(createAccessLogMiddleware());
  app.use(new InternalBlockMiddleware().use);

  // CORS cho giao diện Next.js. Token gửi bằng header Authorization (không dùng cookie) nên không bật
  // credentials. Trình duyệt phải gửi được Authorization, Idempotency-Key, X-Request-ID và đọc được
  // X-Request-ID của response. Preflight (OPTIONS) được trả lời ở đây, không tới controller.
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', CORRELATION_HEADER],
    exposedHeaders: [CORRELATION_HEADER],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: `${API_PREFIX}/health`, method: RequestMethod.GET },
      { path: 'internal/{*path}', method: RequestMethod.ALL },
    ],
  });

  // WebSocket /ws: sự kiện `upgrade` của HTTP server không đi qua pipeline Nest (không có AccessGuard,
  // không tính rate limit); notification kiểm access token ở handshake. ProxyMiddleware.upgrade chỉ nhận /ws.
  const proxy = app.get(ProxyMiddleware);
  app
    .getHttpServer()
    .on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) =>
      proxy.upgrade(req, socket, head),
    );
}
