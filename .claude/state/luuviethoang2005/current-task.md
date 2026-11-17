---
task: T1.2 api-gateway
created: 2026-11-16
status: in_progress
phase: implementation/PHASE-1.md#T1.2
---

## Mô tả

Vá `services/_template-nest` (C18 `OUTBOX_RELAY_ENABLED`, C14 `details.outcome`, `HTTP_TIMEOUT_MS=3000` ở `.env.example` gốc) rồi chép sang identity; sau đó dựng `services/api-gateway` từ template (không DB/Redis/RabbitMQ/S3): bảng định tuyến, `RouteResolver`, chặn `/internal/*`, kiểm JWT RS256 theo mức truy cập, rate limit, proxy giữ body thô, đổi lỗi kết nối thành 503/504.

## Thiết kế liên quan

- `design/SHARED/RE.GATEWAY/` (API_Spec, Component_Class_Design, Processing_Flow) v1.1
- `design/SHARED/RE.SERVICE_TEMPLATE/API_Spec.md §3` (C14), `RE.MESSAGING/API_Spec.md` (`OUTBOX_RELAY_ENABLED`)
- ADR-0003; người làm: A (Lưu Việt Hoàng); hạn 2026-11-20

## Definition of Done

- [x] Test 1–12 ở `RE.GATEWAY/Component_Class_Design.md §4` pass (2026-11-16: gateway unit 226 + e2e 134 PASS; test 1–6, 9, 11, 12 ở `gateway.e2e-spec.ts` (23 ca), 7–8 ở `gateway-upstream-failure.e2e-spec.ts`, 10 ở `gateway-rate-limit.e2e-spec.ts`)
- [x] Template có `OUTBOX_RELAY_ENABLED` và `details.outcome`; test template vẫn xanh; identity đồng bộ (2026-11-16: template unit 69 + e2e 102 PASS; identity unit 102 + e2e 89 PASS)
- [x] `.env.example` gốc: `HTTP_TIMEOUT_MS=3000`
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi (2026-11-16, 4 spec OK)
- [x] Lệnh "Kiểm chứng": `pnpm --filter @realestate/api-gateway test`; `curl /internal/listings/x` → 404; `curl /api/v1/auth/me` token sai → 401 `AUTH_TOKEN_INVALID` (2026-11-16, gateway build chạy cổng 8080, khóa tạm ngoài repo)

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (đã duyệt 2026-11-16)
- [x] 2b. Sửa `RE.GATEWAY` lên v1.2 + `CHANGELOG.md`; thêm `JwtTokenVerifier` vào `RE.SERVICE_TEMPLATE` v1.2 + `CHANGELOG.md` (2026-11-16)
- [x] 3. Bước 0 — vá template (TDD) rồi chép sang identity (2026-11-16): C18, C14, `JwtTokenVerifier`, README template, `.env.example` gốc
- [x] 4. Scaffold `api-gateway` (skill `service-scaffold`), dọn module mẫu (2026-11-16): chép template, đổi tên/cổng 8080/Dockerfile, xóa `example/`, entity + migration + e2e mẫu, giữ `database/ messaging/ redis/ storage/`; cài `http-proxy-middleware@3.0.11` (CommonJS; 4.x ESM-only nên không dùng; đổi từ 3.0.10 theo yêu cầu, sửa socket upgrade), `@nestjs/throttler@6.7.1` (6.8.0 mới ra 2026-11-16); build, unit 79, e2e 89 PASS; `/health` 200. **DỪNG tại đây theo yêu cầu, chờ user trước khi viết `GatewayController`**. Chưa làm: env riêng của gateway (`GATEWAY_PROXY_TIMEOUT_MS`, `RATE_LIMIT_*`, `CORS_ORIGINS`, `INTERNAL_*_URL`) và `trust proxy=false` trong `app.setup.ts` (làm bằng TDD ở bước 5); chưa commit scaffold.
- [x] 5. Gateway: env → trust proxy → routes → RouteResolver → InternalBlock (+CORS) → AccessGuard → Throttler → Proxy → GatewayController → upgrade `/ws` (TDD, 2026-11-16)
- [x] 6. Chạy test, lint, format, build, contracts:check, lệnh kiểm chứng (2026-11-16). **DỪNG, chờ user duyệt trước Bước 7**
- [x] 7. Walkthrough `RE_Gateway_Code_Walkthrough.md` + `code-review` 5 chiều (2026-11-17); commit `4fccabf`, `a090160`, `13ec756`. **Chưa push, chưa mở PR**: còn `test:infra` (user chạy), duyệt schema viewing, PR vào `develop`

> Không có migration, không đổi `contracts/` (gateway không có `/internal/*`, không phát/nhận sự kiện). Compose + `profile apps` là T1.3, không làm ở đây.

## Tái sử dụng

> Quét 2026-11-16 · Nguồn: `services/_template-nest/src`, `services/identity/src`, `services/*/src` (phát hiện trùng), `contracts/`, `pnpm-lock.yaml` · Cách tra: Read/Grep/Glob
> Từ khóa: throttl, rate limit, http-proxy, createProxyMiddleware, RawResponse, buildMeta, OUTBOX_RELAY_ENABLED, outcome
> Vùng mù: `services/api-gateway/` chưa tồn tại; `secrets/` bị chặn đọc (chưa xác nhận có `jwt-public.pem`)

| Thành phần cần | Nhóm | Vị trí đã có / lý do |
|---|---|---|
| Đọc khóa công khai RS256, chốt thuật toán | DÙNG LẠI | `common/auth/jwt.config.ts#resolveJwtVerifyConfig`, `JWT_VERIFY_CONFIG`, `JwtModule` (qua `AuthModule`) |
| Mã lỗi `AUTH_TOKEN_*`, `FORBIDDEN_ROLE`, `TOO_MANY_REQUESTS`, `UPSTREAM_*` | DÙNG LẠI | `common/errors/error-codes.ts#ErrorCode` |
| Ném lỗi chuẩn, filter `{error, meta}` | DÙNG LẠI | `AppException`, `AllExceptionsFilter`, `buildMeta` (`common/response/response-meta.ts`) |
| Không bọc `{data, meta}` cho response proxy | DÙNG LẠI | `common/response/raw-response.decorator.ts#RawResponse` |
| Correlation ID, access log | DÙNG LẠI | `common/logging/*` (gắn bằng `app.use`) |
| Kiểm chữ ký, hạn, claims của JWT | **MỞ RỘNG** | `JwtAuthGuard.verify()` đang `private`. Tách thành provider `JwtTokenVerifier` (khớp `JwtVerifier` trong sơ đồ lớp) ở `_template-nest/src/common/auth/`, `JwtAuthGuard` gọi lại; `AccessGuard` của gateway dùng chung. Chạm phần kỹ thuật chung → sửa template trước, chép sang identity (ADR-0014) |
| `OUTBOX_RELAY_ENABLED` | MỞ RỘNG | Đã có ở `services/identity/src/messaging/outbox.relay.ts` + `config/env.validation.ts`; đưa vào template (C18) |
| `details.outcome` | MỞ RỘNG | `common/http/internal-http.service.ts#toAppException` (C14) |
| `RouteResolver`, `routes.ts`, `AccessGuard`, `InternalBlockMiddleware`, `ProxyMiddleware`, `gateway.errors.ts` | VIẾT MỚI | Nghiệp vụ riêng của gateway, nằm trong `services/api-gateway/src/gateway/` (không phải phần kỹ thuật chung). Đã quét `services/*/src` với `throttl`, `proxy`, `route`: không có |
| Rate limit theo IP và `sub` | VIẾT MỚI (thư viện mới) | Template không có. `@nestjs/throttler` đã chốt ở `architecture.md §5` nhưng **chưa cài** (không có trong `pnpm-lock.yaml`) |
| Proxy HTTP + WebSocket | VIẾT MỚI (thư viện mới) | `http-proxy-middleware` đã chốt ở `architecture.md §5`, **chưa cài** |

## Kế hoạch chi tiết

_Xem phần trình duyệt dưới đây (ghi sau khi user trả lời 2 câu hỏi ở "Blockers")._

### Bước 0 — vá template (TDD, chạy `pnpm --filter @realestate/template-nest test` + `test:e2e` sau mỗi vòng)

| File | Việc |
|---|---|
| `services/_template-nest/src/config/env.validation.ts` | Thêm `OUTBOX_RELAY_ENABLED: Joi.boolean().default(true)` + kiểu `EnvVars` |
| `services/_template-nest/src/config/env.validation.spec.ts` | Test mặc định `true`, ép `false` |
| `services/_template-nest/src/messaging/outbox.relay.ts` | Chép logic `enabled` từ identity |
| `services/_template-nest/.env.example` | `# OUTBOX_RELAY_ENABLED=true` |
| `services/_template-nest/src/common/http/internal-http.service.ts` | `details.outcome`: `NOT_EXECUTED` khi `ECONNREFUSED`/`ENOTFOUND`, còn lại `UNKNOWN` (cho cả 503 lẫn 504, và 5xx của đích) |
| `services/_template-nest/test/http-client.e2e-spec.ts` | Test: refused → `NOT_EXECUTED`; timeout, 503/504/500 của đích → `UNKNOWN`; 4xx của đích giữ nguyên `details` (không chèn outcome) |
| `services/_template-nest/src/common/auth/jwt-token.verifier.ts` (mới) + `jwt.guard.ts`, `auth.module.ts` | Tách `JwtTokenVerifier`; test `auth.e2e-spec.ts` hiện có phải xanh nguyên văn |
| `.env.example` (gốc) | `HTTP_TIMEOUT_MS=3000` (hiện `5000`) |
| `services/identity/src/{common/http,common/auth,config}/…`, `services/identity/.env.example` | Chép đúng phần đã vá; identity đã có `OUTBOX_RELAY_ENABLED`, chỉ đồng bộ `internal-http.service.ts` và `JwtTokenVerifier` |
| `project-knowledge/design/SHARED/RE.SERVICE_TEMPLATE/` | Chỉ nếu thiết kế cần chỉnh (thêm `JwtTokenVerifier` vào Component_Class_Design); kèm `CHANGELOG.md` v1.2 |

### Bước 1–4 — `services/api-gateway/`

Chép từ template (robocopy loại `node_modules`, `dist`, `.env`, `openapi.json`), đổi `name`=`@realestate/api-gateway`, `SERVICE_NAME`, `PORT=8080`, Dockerfile; xóa `src/example/`, `ExampleModule`, `test/example.e2e-spec.ts`, entity + migration mẫu. **Giữ nguyên** `src/database/`, `src/messaging/`, `src/redis/`, `src/storage/` và test của chúng (đã chốt 2026-11-16: chỉ không đặt `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`, nên các module này không bật; ADR-0014 không sửa riêng bản chép).

| File mới (trong `src/gateway/`) | Việc |
|---|---|
| `routes.ts` | 18 dòng bảng `API_Spec.md §3` dạng dữ liệu: `{ method?, pattern, service, access }`, thứ tự cụ thể → chung (dòng 4 trước 5, dòng 10 trước 11) |
| `route-resolver.ts` (+ `.spec.ts`) | `resolve(method, path)` → `{ target, access }` hoặc `GATEWAY_ROUTE_NOT_FOUND`; target đọc từ `INTERNAL_<SERVICE>_URL` |
| `internal-block.middleware.ts` (+ spec) | `/internal/*` mọi method → `404 GATEWAY_ROUTE_NOT_FOUND`, gắn bằng `app.use` trong `app.setup.ts` sau access log |
| `access.guard.ts` (+ spec) | Theo `access`: `public`/`payos` bỏ qua; còn lại `JwtTokenVerifier` → 401, so `roles` → 403 `FORBIDDEN_ROLE`; gắn `req.user` |
| `throttle.config.ts`, `gateway-throttler.guard.ts` (+ spec) | Một `ThrottlerGuard` đặt **sau** `AccessGuard`, bộ đếm bộ nhớ, `RATE_LIMIT_TTL_SECONDS` (60). Có `req.user` → tracker = `sub`, giới hạn `RATE_LIMIT_USER` (300). Không có user (`public`, `payos`) → tracker = IP, giới hạn `RATE_LIMIT_IP` (100). Không đếm IP cho request đã đăng nhập (SSR Next.js / NAT gom nhiều người về một IP). Tracker IP: `req.ip`; `trust proxy` chốt ở bước code (ngrok/cloudflared chèn `X-Forwarded-For`) |
| `proxy.middleware.ts` (+ spec) | `http-proxy-middleware`: `proxyTimeout`/`timeout` = `GATEWAY_PROXY_TIMEOUT_MS`, `on.proxyReq` gắn `X-Request-ID`, `on.error` → `503 UPSTREAM_UNAVAILABLE` (`ECONNREFUSED`/`ENOTFOUND`/`ECONNRESET`) hoặc `504 UPSTREAM_TIMEOUT`, dựng `{error, meta}` bằng `buildMeta`; `ws: true` cho `/ws` |
| `gateway.controller.ts` | Catch-all `@All` + `@Public()` + `@RawResponse()`, `@UseGuards(AccessGuard, GatewayThrottlerGuard)`; handler dùng `@Req()`/`@Res()` (Nest không tự gửi response) và gọi `ProxyMiddleware.use(req, res, next)`. Lỗi guard đi qua `AllExceptionsFilter`. Cần loại prefix `/api/v1` cho route này (`/ws` và webhook không cùng prefix) |
| `gateway.module.ts`, `errors/gateway.errors.ts` | Ghép module; mã `GATEWAY_ROUTE_NOT_FOUND` |
| `src/main.ts`, `test/helpers/create-test-app.ts` | `bodyParser: false`; main thêm `server.on('upgrade', …)` cho `/ws` |
| `src/config/env.validation.ts`, `.env.example` (service + gốc) | `GATEWAY_PROXY_TIMEOUT_MS` (>8000), `RATE_LIMIT_*`, `CORS_ORIGINS`, `INTERNAL_*_URL`, `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`; CORS qua `app.enableCors` trong `app.setup.ts` |
| `package.json` | Thêm `http-proxy-middleware`, `@nestjs/throttler` (ghim đúng phiên bản, `pnpm add --save-exact`; đã có trong `architecture.md §5`) |

### Test (TDD: RED → GREEN → REFACTOR từng cái)

Tầng `test` (unit, cạnh code): `route-resolver.spec.ts`, `access.guard.spec.ts`, `internal-block.middleware.spec.ts`.
Tầng `test:e2e` (`test/gateway.e2e-spec.ts`, upstream giả dựng từ `test/helpers/http-upstream.ts`): bắt buộc 1–12 theo `Component_Class_Design.md §4`:
1 `/internal` 404 không gọi đích · 2 chữ ký sai 401 · 3 hết hạn 401 · 4 TENANT vào `/admin` 403 · 5 route public · 6 webhook body nguyên (so byte) · 7 đích tắt 503 · 8 đích chậm 504 · 9 `X-Request-ID` xuyên suốt · 10 429, **hai nhánh**: ẩn danh vượt 100/60s → 429; có token vượt 300/60s → 429 (thêm: có token thì không bị đếm theo IP; hai `sub` cùng IP không chung bộ đếm) · 11 `409` chuyển nguyên · 12 upgrade `/ws` không qua AccessGuard.
Tầng `test:infra`: không có (gateway không dùng hạ tầng).

### Số truy vấn DB
Gateway không có DB: 0 truy vấn. `non-functional-standards.md §1` không áp dụng ngoài việc không tạo API danh sách.

### Playbook
`tdd` bật (`warn`). Mỗi file `.ts` trong `services/*/src/` tạo kèm `.spec.ts` cạnh nó; viết test trước.

## Trước khi mở PR

- [ ] **User tự chạy `test:infra`** khi bật Docker: `pnpm --filter @realestate/template-nest test:infra` và `pnpm --filter @realestate/identity test:infra` (thay đổi `OutboxRelay` / `OUTBOX_RELAY_ENABLED` chưa kiểm với RabbitMQ thật; Docker không chạy khi review 2026-11-16).
- [ ] PR T1.2 chạm `contracts/events/rental.viewing-*.v1.schema.json` (commit format, chỉ khoảng trắng): cần **người phụ trách service nghe sự kiện viewing** duyệt (`standards/git-workflow.md §3`).
- [ ] PR vào `develop` (không phải `main`).

## Ghi chú cho T1.3

- `trust proxy = false` (chốt 2026-11-16, `RE.GATEWAY/Component_Class_Design.md §6`): trong Docker, request từ host mang IP của bridge nên mọi request ẩn danh dùng chung một bộ đếm IP 100/60 giây. Chấp nhận; không thêm biến môi trường.

## Blockers / Ghi chú

**Kế hoạch đã được duyệt 2026-11-16 (kèm 3 điều chỉnh bên dưới). ĐỢI user báo đã merge `feature/identity` vào `develop` và tạo `feature/T1.2-api-gateway` rồi mới bắt đầu Bước 0.**

Quyết định đã chốt:

1. **GatewayController catch-all** (`@Public()`, `@RawResponse()`, `@Req()`/`@Res()`; lỗi guard qua `AllExceptionsFilter`) thay cho `ProxyMiddleware` gắn bằng `app.use`. Ghi vào `RE.GATEWAY/Component_Class_Design.md §3`, nâng v1.2 + `CHANGELOG.md` **trước khi code**.
2. **Rate limit một throttler đặt sau `AccessGuard`:** có `req.user` → tracker `sub`, `RATE_LIMIT_USER` (300/60s); không có user (public, payos) → tracker IP, `RATE_LIMIT_IP` (100/60s). Lý do: SSR Next.js / NAT gom nhiều người về một IP. Ghi vào `Component_Class_Design.md §3` và `API_Spec.md §5` (cùng v1.2, cùng `CHANGELOG.md`). Test 10 cần cả hai nhánh.
3. **Giữ nguyên** `database/`, `messaging/`, `redis/`, `storage/` và test của chúng; chỉ không đặt env (bảng "Bước 1–4" đã sửa).

Việc doc v1.2 chưa làm: chờ nhánh mới (working tree hiện đang lẫn thay đổi T0.3/T0.4 mà user sẽ tự commit).

Điểm cần lưu ý khác:
- `http-proxy-middleware`, `@nestjs/throttler` chưa cài: cần `pnpm add` (đã duyệt ở `architecture.md §5`; phiên bản ghim chốt khi cài).
- Webhook payOS (`payos`, không có user) bị đếm theo IP 100 request/phút: payOS retry thưa nên coi là đủ; không thêm ngoại lệ ngoài thiết kế.
- Nhánh: user tự commit/merge `feature/identity` vào `develop`, rồi tạo `feature/T1.2-api-gateway` từ `develop`. Không tự chạy lệnh git nào.
- `secrets/jwt-public.pem` chưa xác nhận tồn tại (thư mục bị chặn đọc); test e2e dùng cặp khóa sinh trong test, không phụ thuộc file này.
- `progress.md` chung chỉ tick sau merge.

## Chuyển sang T1.3

> Việc chưa làm ở T1.2 (gateway chỉ có `.env.example` của service). T1.3 làm cùng commit với compose (`developer.md` Bước 3: biến mới → `.env.example` gốc và `infra/compose/docker-compose.yml`).

- [ ] **`.env.example` gốc**: thêm `GATEWAY_PROXY_TIMEOUT_MS` (10000, phải > 8000), `RATE_LIMIT_TTL_SECONDS` (60), `RATE_LIMIT_IP` (100), `RATE_LIMIT_USER` (300), `CORS_ORIGINS` (`http://localhost:3000`). `INTERNAL_*_URL` đã có ở gốc (localhost; trong Docker dùng tên service, xem dưới).
- [ ] **`infra/compose/docker-compose.yml`** (profile `apps`), service `api-gateway`: `SERVICE_NAME`, `PORT: '8080'`, `JWT_PUBLIC_KEY_PATH` (mount khóa công khai, chỉ đọc) và `JWT_ISSUER`, `INTERNAL_IDENTITY_URL` … `INTERNAL_NOTIFICATION_URL` dùng **tên service** (`http://identity:3001`…; mặc định của code đã đúng nếu bỏ trống), `GATEWAY_PROXY_TIMEOUT_MS`, `RATE_LIMIT_*`, `CORS_ORIGINS`. Không đặt `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`. Chỉ gateway publish `127.0.0.1:8080`.
- [ ] `HTTP_TIMEOUT_MS` gốc đã `3000` (T1.2); gateway không dùng `InternalHttpService` nên không bị ảnh hưởng.
- [ ] Ghi nhận (đã chốt 2026-11-16, `RE.GATEWAY/Component_Class_Design.md §6`): `trust proxy=false` nên trong Docker, request từ host mang IP của bridge, mọi request ẩn danh dùng chung một bộ đếm IP 100/60 giây. Chấp nhận.
- [ ] Healthcheck container gateway: Dockerfile gọi `GET /health` theo `PORT` (đặt `PORT=8080` trong compose, mặc định của ảnh là 3000).
- [ ] Kiểm chứng DoD T1.3: đăng ký, đăng nhập, `/me` qua 8080; cùng `X-Request-ID` ở log gateway và identity; đặt tag `v0.1-skeleton`.
