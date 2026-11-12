# Cạm bẫy đã gặp

> Bài học rút ra khi làm. Thêm mục khi gặp lỗi tốn thời gian mà người sau dễ lặp lại (skill `debug` Bước 4 đề xuất).
> Mỗi mục ngắn, có cách tránh. Các mục dưới lấy từ `services/_template-nest/README.md §7` và README gốc.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## NestJS 12 là ESM-only
- **Bối cảnh:** cài `@nestjs/*@latest`.
- **Vấn đề:** bản 12.x chỉ có ESM, `tsconfig.base.json` của repo là CommonJS.
- **Cách xử lý:** giữ NestJS 11.
- **Nguồn:** template README §7.

## `nest build` bỏ sót file khi xóa `dist/`
- **Bối cảnh:** bật `incremental` trong `tsconfig.json`.
- **Vấn đề:** `.tsbuildinfo` nằm ngoài `dist/`, build tưởng đã biên dịch.
- **Cách xử lý:** để `incremental` tắt như template.
- **Nguồn:** template README §7.

## Middleware không chạy ở `/health`, `/internal/*`
- **Bối cảnh:** gắn middleware trong module.
- **Vấn đề:** Nest tự thêm prefix `/api/v1`, bỏ sót `/health`, `/internal/*` và request 404.
- **Cách xử lý:** gắn bằng `app.use` trong `app.setup.ts`.
- **Nguồn:** template README §7.

## Test đổi biến môi trường không ăn
- **Bối cảnh:** test đổi `HTTP_TIMEOUT_MS` sau khi import `AppModule`.
- **Vấn đề:** `ConfigModule` chốt giá trị lúc import.
- **Cách xử lý:** đặt env **trước** khi import (xem `test/http-client-defaults.e2e-spec.ts`).
- **Nguồn:** template README §7.

## `amqp-connection-manager` 5.0.1 làm Jest lỗi
- **Bối cảnh:** nâng phụ thuộc.
- **Vấn đề:** kéo `promise-breaker` 7 (ESM) vào bản CommonJS.
- **Cách xử lý:** ghim 5.0.0.
- **Nguồn:** template README §7.

## `@InjectPinoLogger` không chạy
- **Bối cảnh:** class được import trước `LoggerModule`.
- **Cách xử lý:** inject `PinoLogger` trực tiếp rồi `setContext(...)`.
- **Nguồn:** template README §7.

## vhost `/` trong `RABBITMQ_URL`
- **Vấn đề:** viết `/` thì kết nối sai vhost.
- **Cách xử lý:** viết `%2F`.
- **Nguồn:** template README §4.

## Sửa tham số queue đã tồn tại
- **Vấn đề:** RabbitMQ từ chối `PRECONDITION_FAILED` khi đổi `x-dead-letter-*`.
- **Cách xử lý:** xóa queue trong Management UI hoặc reset volume `realestate_rabbitmq_data`, rồi `docker start -a re-rabbitmq-init`.
- **Nguồn:** README gốc mục RabbitMQ.

## Postgres cổng 5432 bị chiếm trên Windows
- **Cách xử lý:** laptop dùng `5433` (`POSTGRES_PORT`); trong Docker vẫn `postgres:5432`.
- **Nguồn:** README gốc.

## Script init DB không chạy lại
- **Vấn đề:** chỉ chạy khi volume trống; thêm DB mới không thấy.
- **Cách xử lý:** `pnpm infra:down`, `docker volume rm realestate_postgres_data`, `pnpm infra:up` (mất dữ liệu dev).
- **Nguồn:** README gốc, ADR-0008.

## `nvm use 22` treo trên Windows
- **Cách xử lý:** chạy terminal quyền Administrator hoặc bật Developer Mode.
- **Nguồn:** README gốc.

## Presigned PUT không giới hạn kích thước
- **Cách xử lý:** sau khi client báo tải xong, `HeadObject` kiểm kích thước trước khi chấp nhận key.
- **Nguồn:** template README §3, Báo cáo v2 §3.6.3.

## Webhook payOS không tới máy local
- **Cách xử lý:** chạy ngrok/cloudflared trỏ vào gateway 8080, cập nhật URL webhook trong trang payOS mỗi lần đường hầm đổi địa chỉ.
- **Nguồn:** Báo cáo v2 §1.3.

<!-- Mẫu một mục:
## <Tiêu đề ngắn>
- **Bối cảnh:** khi nào gặp
- **Vấn đề:** chuyện gì xảy ra
- **Cách xử lý:** tránh hoặc sửa thế nào
- **Nguồn:** task / PR / ngày
-->
