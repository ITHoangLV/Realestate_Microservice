import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { PinoLogger } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { ErrorCode } from '../common/errors/error-codes';
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
} from '../common/logging/correlation-id.middleware';
import { buildMeta } from '../common/response/response-meta';
import { EnvVars } from '../config/env.validation';
import type { GatewayRequest } from './access.guard';
import { RouteResolver } from './route-resolver';

/** Lỗi nghĩa là service đích chậm (không phải không kết nối được). */
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED']);

/** Request mà bộ đếm thời gian của gateway đã cắt: lỗi sau đó (ECONNRESET do tự hủy) phải là 504. */
const TIMED_OUT = new WeakSet<object>();

/** WebSocket duy nhất gateway cho nâng cấp: `/ws` (RE.GATEWAY/API_Spec.md §3 dòng 16). */
const WS_PATH = /^\/ws(?:\/|$)/;

const isResponse = (res: unknown): res is ServerResponse =>
  typeof (res as ServerResponse | undefined)?.writeHead === 'function';

/**
 * Chuyển tiếp request tới service đích bằng `http-proxy-middleware` (RE.GATEWAY/Component_Class_Design.md §3.2).
 *
 * - Body KHÔNG bị parse (main.ts tắt body parser): webhook payOS tới payment đúng từng byte, chữ ký còn nguyên.
 * - Đích lấy từ `request.gatewayRoute` do AccessGuard đã khớp (không khớp lần hai).
 * - Gắn `X-Request-ID` (correlation ID đã làm sạch); `Authorization` đi nguyên để service kiểm lại JWT.
 * - Không retry (gateway không biết lệnh có idempotent không). Quá `GATEWAY_PROXY_TIMEOUT_MS` chờ đích → 504
 *   UPSTREAM_TIMEOUT; không kết nối được → 503 UPSTREAM_UNAVAILABLE. Lỗi 4xx/5xx của đích đi nguyên văn.
 * - Lỗi do proxy phát sinh bất đồng bộ, ngoài pipeline Nest, nên tự dựng `{ error, meta }`; thông điệp cố định
 *   (plugin lỗi mặc định của thư viện ghi host + URL vào body nên bị thay bằng `on.error` riêng).
 * - WebSocket: `upgrade()` do main.ts gọi từ sự kiện `upgrade` của HTTP server; không qua AccessGuard
 *   (notification kiểm token ở handshake), nên CHỈ nhận `/ws`.
 */
@Injectable()
export class ProxyMiddleware {
  private readonly handler: RequestHandler;

  constructor(
    config: ConfigService<EnvVars, true>,
    private readonly resolver: RouteResolver,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ProxyMiddleware.name);
    const timeoutMs = config.getOrThrow('GATEWAY_PROXY_TIMEOUT_MS', { infer: true });

    this.handler = createProxyMiddleware({
      router: (req) => {
        const target = (req as GatewayRequest).gatewayRoute?.target;
        if (!target) throw new Error('Request chưa được định tuyến (thiếu gatewayRoute)');
        return target;
      },
      changeOrigin: true,
      ws: false, // upgrade() được gọi tường minh, không để thư viện tự đăng ký sự kiện
      logger: {
        // Tắt log mặc định ra console của thư viện; lỗi proxy do on.error ghi
        info: () => undefined,
        warn: (...args: unknown[]) => this.logger.warn({ args }, 'http-proxy-middleware'),
        error: (...args: unknown[]) => this.logger.warn({ args }, 'http-proxy-middleware'),
      },
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.setHeader(CORRELATION_HEADER, resolveCorrelationId(req));
          // Hết hạn chờ đích: tự hủy và đánh dấu để on.error trả 504 (không nhầm với ECONNRESET)
          proxyReq.setTimeout(timeoutMs, () => {
            TIMED_OUT.add(req);
            proxyReq.destroy();
          });
        },
        proxyReqWs: (proxyReq, req) => {
          proxyReq.setHeader(CORRELATION_HEADER, resolveCorrelationId(req));
        },
        error: (err, req, res) => this.onError(err, req, res),
      },
    });
  }

  use(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): Promise<void> {
    return this.handler(req, res, next);
  }

  /** Chuyển tiếp nâng cấp WebSocket. Chỉ `/ws`; mọi đường dẫn khác đóng socket, không tới service nào. */
  upgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    const url = req.url ?? '';
    const path = url.split(/[?#]/)[0];
    try {
      if (!WS_PATH.test(path)) throw new Error('không phải /ws');
      (req as GatewayRequest).gatewayRoute = this.resolver.resolve('GET', url);
    } catch {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    this.handler.upgrade(req, socket, head);
  }

  private onError(err: Error & { code?: string }, req: IncomingMessage, res: unknown): void {
    const timedOut = TIMED_OUT.has(req) || (err.code !== undefined && TIMEOUT_CODES.has(err.code));
    const route = (req as GatewayRequest).gatewayRoute;
    // Log tên service, không log địa chỉ, query hay header (có thể chứa token)
    this.logger.warn(
      {
        correlationId: resolveCorrelationId(req),
        service: route?.service,
        method: req.method,
        path: (req.url ?? '').split(/[?#]/)[0],
        reason: timedOut ? 'timeout' : (err.code ?? err.message),
      },
      'Chuyển tiếp tới service đích thất bại',
    );

    if (!isResponse(res)) {
      (res as Socket | undefined)?.destroy?.(); // nâng cấp WebSocket: không có response để viết
      return;
    }
    if (res.headersSent) {
      res.destroy(); // đã gửi một phần: không thể đổi thành lỗi, cắt kết nối để client biết
      return;
    }
    const status = timedOut ? 504 : 503;
    const body = {
      error: timedOut
        ? {
            code: ErrorCode.UPSTREAM_TIMEOUT,
            message: 'Service phản hồi quá chậm, vui lòng thử lại sau',
          }
        : {
            code: ErrorCode.UPSTREAM_UNAVAILABLE,
            message: 'Không kết nối được service, vui lòng thử lại sau',
          },
      meta: buildMeta(resolveCorrelationId(req, res)),
    };
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}
