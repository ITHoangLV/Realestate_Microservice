# RE.GATEWAY — Thiết kế thành phần

| | |
|---|---|
| **Service** | `services/api-gateway/` |
| **Quy ước** | `standards/coding-convention.md`, `standards/security-policy.md` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Cấu trúc

Copy từ `_template-nest`, không bật `DATABASE_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`.

```text
services/api-gateway/src/
├─ main.ts, app.module.ts, app.setup.ts
├─ common/ config/ health/            # giữ từ template
└─ gateway/
   ├─ gateway.module.ts
   ├─ routes.ts                      # bảng định tuyến API_Spec.md §3 (dữ liệu, không logic)
   ├─ route-resolver.ts              # khớp method + đường dẫn → { target, access }
   ├─ access.guard.ts                # kiểm JWT theo access; public/payos bỏ qua
   ├─ internal-block.middleware.ts   # /internal/* → 404
   ├─ throttle.config.ts             # @nestjs/throttler theo IP và sub
   ├─ proxy.middleware.ts            # chuyển tiếp, timeout, đổi lỗi kết nối thành 503/504
   └─ errors/gateway.errors.ts       # GATEWAY_ROUTE_NOT_FOUND
```

## 2. Sơ đồ lớp

```mermaid
classDiagram
    class RouteResolver {
      +resolve(method, path) ResolvedRoute
    }
    class ResolvedRoute {
      +target: string
      +access: Access
    }
    class AccessGuard {
      +canActivate(ctx) boolean
    }
    class ProxyMiddleware {
      +use(req, res, next)
    }
    AccessGuard --> RouteResolver
    ProxyMiddleware --> RouteResolver
    AccessGuard ..> JwtVerifier
```

## 3. Thứ tự middleware

| # | Bước | Ghi chú |
|---|---|---|
| 1 | Correlation ID (template) | Sinh `X-Request-ID` nếu thiếu |
| 2 | Access log (template) | |
| 3 | `InternalBlockMiddleware` | `/internal/*` → `404 GATEWAY_ROUTE_NOT_FOUND` |
| 4 | CORS | |
| 5 | Throttler | `429` |
| 6 | `RouteResolver` | Không khớp → `404` |
| 7 | `AccessGuard` | `401`/`403` |
| 8 | `ProxyMiddleware` | Body thô cho webhook `[cần xác nhận]` |

## 4. Test bắt buộc

| # | Tình huống | Mong đợi |
|---|---|---|
| 1 | `GET /internal/listings/x` từ ngoài | `404`, không gọi service (Báo cáo T16) |
| 2 | Token sai chữ ký | `401 AUTH_TOKEN_INVALID` (Báo cáo T17) |
| 3 | Token hết hạn | `401 AUTH_TOKEN_EXPIRED` |
| 4 | `TENANT` gọi `/api/v1/admin/*` | `403 FORBIDDEN_ROLE` |
| 5 | Route `public` không token | Được chuyển tiếp |
| 6 | Webhook payOS không token | Được chuyển tiếp, body nguyên vẹn |
| 7 | Service đích tắt | `503 UPSTREAM_UNAVAILABLE` |
| 8 | Service đích chậm hơn timeout | `504 UPSTREAM_TIMEOUT` |
| 9 | `X-Request-ID` client gửi | Giống nhau ở log gateway và service đích |
| 10 | Vượt rate limit | `429` |
| 11 | Lỗi `409` của service | Chuyển nguyên `{ error, meta }` |

## 5. Điểm [cần xác nhận]

1. Thư viện proxy và cách giữ body thô (`API_Spec.md §6`).
