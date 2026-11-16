---
name: service-scaffold
description: >
  Tạo service mới (api-gateway, listing, rental, payment, notification) từ services/_template-nest đúng
  cách, rồi nối vào compose, gateway, .env.example. Kích hoạt khi task có bước "tạo service từ template"
  (T1.2, T2.2, T3.1, T3.2, T4.2) hoặc khi nghe "tạo service", "khởi tạo service", "scaffold". Chạy bên
  trong developer Bước 3, sau khi kế hoạch đã được duyệt.
---

# service-scaffold

Nguồn chuẩn: `services/_template-nest/README.md §1` (lệnh PowerShell) + `design/SHARED/RE.SERVICE_TEMPLATE/Component_Class_Design.md §3`.
Skill này là checklist để không quên bước; **không** viết lại template (ADR-0014).

**NEVER** copy phần kỹ thuật chung rồi sửa riêng trong service. Cần khác → sửa `_template-nest` trước, PR do A duyệt, rồi chép sang.

## Bước 0 — Điều kiện

- Đang trong task có `current-task.md` `in_progress`, kế hoạch chi tiết đã được duyệt (`developer` Bước 2).
- Người làm sở hữu service đó (`implementation/README.md §2`). B, C không tạo service ngoài phần mình.

## Bước 1 — Thông số service

Lấy từ bảng "Cổng và DB" ở `services/_template-nest/README.md §1` và `architecture.md §3`:

| Service | Cổng | DB | S3 | RabbitMQ | Người |
|---|---|---|---|---|---|
| api-gateway | 8080 | không | không | không | A |
| listing | 3002 | `listing_db` (PostGIS) | `listing-images` | không phát, không nghe | B |
| rental | 3003 | `rental_db` | không | phát + nghe | C |
| payment | 3004 | `payment_db` | `payment-proofs` (chứng từ) | phát (+ nghe theo `RE.MESSAGING`) | C |
| notification | 3005 | `notification_db` | không | nghe | A |

Đối chiếu lại với `API_Spec.md` (mục biến môi trường) của chức năng trước khi làm; lệch → dừng, hỏi.

## Bước 2 — Copy và đổi tên

Theo đúng `services/_template-nest/README.md §1` bước 1–3 (robocopy loại `node_modules`, `dist`, `.env`, `openapi.json`; đổi `name`, `description`, `SERVICE_NAME`, `PORT`, đường dẫn trong `Dockerfile`; ghi UTF-8 không BOM).

Kiểm: `pnpm install` rồi `pnpm --filter @realestate/<service> dev` → `GET http://localhost:<cổng>/api/v1/health` trả `status: ok`.

## Bước 3 — Dọn module mẫu

Theo README §1 "Việc cần làm tiếp" mục 1: xóa `src/example/`, `ExampleModule` trong `app.module.ts`, `test/example.e2e-spec.ts`, entity + migration mẫu. Giữ mọi test hạ tầng còn lại.

Kiểm: `pnpm --filter @realestate/<service> build`, `test`, `test:e2e` xanh — dán output.

## Bước 4 — Bật phần cần dùng

- DB: `DATABASE_URL` theo user/DB riêng; migration đầu tiên theo DDL trong `API_Spec.md` của chức năng (`coding-convention.md §5`).
- Gateway: tắt DB, Redis tùy `RE.GATEWAY` (không bật module không dùng).
- Messaging: queue nghe đã có trong `infra/rabbitmq/definitions.json`? Chưa có → đó là việc của A (T4.1), **không** tự tạo queue trong code.
- Biến riêng của service → `src/config/env.validation.ts` + `.env.example` của service.
- So `src/` vừa chép với `services/identity/src/` phần kỹ thuật chung: thấy identity có mà template không có (ví dụ `OUTBOX_RELAY_ENABLED` trong `outbox.relay.ts`) → ghi vào `current-task.md`, báo A; không tự vá riêng.

## Bước 5 — Nối vào hệ thống

| Nơi | Việc | Ai |
|---|---|---|
| `infra/compose/docker-compose.yml` | Thêm service vào profile `apps`; `INTERNAL_*_URL` dùng tên service; chỉ gateway publish `127.0.0.1:8080` | Người làm, A duyệt |
| `.env.example` gốc | Biến dùng chung mới (nếu có) | Người làm |
| `services/api-gateway/src/gateway/routes.ts` | Route công khai theo `RE.GATEWAY/API_Spec.md §3` | Nhờ A |
| `contracts/openapi/<service>-internal.v1.yaml` | Chỉ khi service có `/internal/*` — đã có từ T0.3 thì đối chiếu, không viết lại | Người làm |
| `project-knowledge/project-structure.md` | Cây thật lệch cây ghi → cập nhật | Người làm |

## Bước 6 — Kiểm chứng và ghi

- `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check`, test của service — dán output.
- Chạy compose: `docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build` → `/health` qua gateway (nếu đã có route).
- Gọi `progress-tracker`. Walkthrough của service viết sau khi có nghiệp vụ đầu tiên (`code-walkthrough`).
