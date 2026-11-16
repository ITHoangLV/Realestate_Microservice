# RE.GATEWAY — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.2] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv
- **summary:** Proxy chạy sau guard qua `GatewayController` catch-all; rate limit đặt sau `AccessGuard`, đếm theo `sub` hoặc IP; giữ nguyên thư mục tùy chọn của template.

### Thay đổi

**1.** Proxy không còn là middleware `app.use`.

| # | Vị trí | Loại |
|---|---|---|
| 1 | `Component_Class_Design.md` §1, §2, §3 | Sửa |

- **Cũ:** §3 xếp `Throttler → RouteResolver → AccessGuard → ProxyMiddleware` như một chuỗi middleware.
- **Mới:** §3.1 middleware `app.use` (correlation, access log, `InternalBlock`, CORS); §3.2 `GatewayController` catch-all (`@Public`, `@RawResponse`, `@Req/@Res`) chạy `AccessGuard`, `GatewayThrottlerGuard` rồi gọi `ProxyMiddleware`. Lỗi guard đi qua `AllExceptionsFilter`; lỗi proxy dựng `{ error, meta }` trong `on.error`. `/ws` đi qua `server.on('upgrade')`.
- **Lý do:** middleware Express chạy trước guard Nest nên không thể đứng sau `AccessGuard`. Hành vi nhìn từ ngoài (mã lỗi, thứ tự 401/403/404) không đổi.

**2.** Cách đếm rate limit.

| # | Vị trí | Loại |
|---|---|---|
| 2 | `Component_Class_Design.md` §1, §3.2, §4 (test 10) | Sửa |
| 3 | `API_Spec.md` §1, §5, §6 | Sửa |
| 4 | `Processing_Flow.md` §1 | Sửa |

- **Cũ:** throttler trước route resolver, 100 request/IP và 300 request/`sub` áp đồng thời.
- **Mới:** một throttler sau `AccessGuard`: có người dùng thì tracker `sub`, giới hạn `RATE_LIMIT_USER` (300); không có (`public`, `payos`) thì tracker IP, giới hạn `RATE_LIMIT_IP` (100). Test 10 kiểm cả hai nhánh.
- **Lý do:** SSR Next.js và NAT gom nhiều người về một IP; đếm IP cho mọi request làm giới hạn theo `sub` vô nghĩa. Giá trị mặc định không đổi.
- **Đã chốt:** `trust proxy = false` cho IP của request không có người dùng: không tin `X-Forwarded-For`, không thêm biến môi trường (`Component_Class_Design.md §6`). Hệ quả chấp nhận: qua đường hầm hoặc bridge Docker, request ẩn danh dùng chung một bộ đếm IP.

**3.** Thư mục tùy chọn của template.

| # | Vị trí | Loại |
|---|---|---|
| 5 | `Component_Class_Design.md` §1 | Sửa |

- **Cũ:** "Copy từ `_template-nest`, không bật `DATABASE_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`".
- **Mới:** giữ nguyên `database/`, `messaging/`, `redis/`, `storage/` và test của chúng, không đặt env (thêm `REDIS_URL`).
- **Lý do:** ADR-0014, không sửa riêng bản chép.

### File design đã sửa

- `Component_Class_Design.md` §1, §2, §3, §4, §5, §6
- `API_Spec.md` §1, §5, §6
- `Processing_Flow.md` §1
- Header 3 file: v1.1 → v1.2

### Ảnh hưởng

- api-gateway (A, T1.2). Cần `JwtTokenVerifier` trong template (`RE.SERVICE_TEMPLATE` v1.2).
- Không đổi API công khai, mã lỗi, `contracts/`.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Chốt CORS_ORIGINS.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §5, §6 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §5, §6
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- api-gateway (A, T1.2).
