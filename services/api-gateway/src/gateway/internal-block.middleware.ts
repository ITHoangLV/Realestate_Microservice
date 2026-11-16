import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { resolveCorrelationId } from '../common/logging/correlation-id.middleware';
import { buildMeta } from '../common/response/response-meta';
import { GatewayError } from './errors/gateway.errors';

/** `/internal` và mọi đường dẫn dưới nó, không phân biệt hoa thường (Express định tuyến không phân biệt). */
const INTERNAL_PATH = /^\/internal(?:[/?#]|$)/i;

/**
 * `/internal/*` là API service-gọi-service, KHÔNG bao giờ mở ra ngoài: trả 404 cho mọi method, không
 * chuyển tiếp (security-policy.md §3.1, Báo cáo T16). Thông điệp không nhắc đường dẫn hay service nội bộ.
 *
 * Gắn bằng `app.use` trong app.setup.ts (sau correlation ID và access log) để chạy cho mọi request,
 * trước CORS, guard và proxy. Chạy ngoài pipeline Nest nên tự dựng `{ error, meta }` đúng khung lỗi.
 */
@Injectable()
export class InternalBlockMiddleware implements NestMiddleware {
  /** Arrow property để truyền thẳng vào `app.use(new InternalBlockMiddleware().use)`. */
  readonly use = (req: Request, res: Response, next: NextFunction): void => {
    if (!INTERNAL_PATH.test(req.url)) {
      next();
      return;
    }
    res.status(404).json({
      error: { code: GatewayError.ROUTE_NOT_FOUND, message: 'Không tìm thấy đường dẫn' },
      meta: buildMeta(resolveCorrelationId(req, res)),
    });
  };
}
