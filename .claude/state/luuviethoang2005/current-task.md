---
task: T3.1 payment: khung, payment order, payOS
created: 2026-11-21
status: done
phase: implementation/PHASE-3.md#T3.1
branch: feature/T3.1-payment-order (từ `develop` tại `d253f01`; T2.5 chưa merge, T3.1 không phụ thuộc T2.5)
---

## Mô tả

Tạo `services/payment` từ `_template-nest` (cổng 3004, `payment_db`), migration theo `RE.PAYMENT/API_Spec.md §6` và `RE.PAYOUT/API_Spec.md §7`, `PayosClient` (timeout, không retry tạo link), `PaymentOrderService` (tạo, hủy, tra cứu) và controller nội bộ `/internal/payment-orders`. Người làm: A (Claude làm khi A vắng, quyết định 2026-11-21 trong `decisions-log.md`). Hạn M2 — 2026-12-04, ước ~10 giờ.

## Thiết kế liên quan

`design/PAYMENT/RE.PAYMENT/` v1.1 (`API_Spec §2, §4, §5, §6, §7`, `Component_Class_Design §1, §2, §4 test 7–10`, `Processing_Flow §1, §3, §4`), `RE.PAYOUT/API_Spec.md §7` (DDL ví), ADR-0009, `contracts/openapi/payment-internal.v1.yaml` (đối chiếu, **không đổi**), `standards/reliability-standard.md` (payOS: tạo link không retry, tra cứu/hủy có retry, timeout 2.500 ms).

## Definition of Done

- [x] Test 7–10 ở `RE.PAYMENT/Component_Class_Design.md §4` pass (`test` + `test:infra`, 2026-11-21)
- [x] Response `/internal/payment-orders*` khớp `payment-internal.v1.yaml` (mọi status trong infra-spec)
- [x] `pnpm --filter @realestate/payment test` 150/150, `test:e2e` 97/97, `test:infra` 36/37: `payment-orders` 23/23, `messaging` 8/8, `storage` 5/6 do môi trường (không có S3 thật; template chưa sửa cũng 5/6) — **A chạy lại `storage` với Silo**
- [x] `pnpm lint`, `format:check`, `build`, `contracts:check` sạch
- [x] Số truy vấn trong ngưỡng ghi 6: tạo 3, gọi lại 1, hủy 2, tra cứu 1 (đếm bằng log SQL trong infra-spec)
- [x] Walkthrough `guides/RE_Payment_Code_Walkthrough.md` (mới), dòng ở `project-knowledge/CLAUDE.md §2.5`, README payment, compose, `.env.example`

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (Claude tự duyệt 2026-11-21 theo quyền A trao)
- [x] 3. Dựng service từ template (`service-scaffold`), dọn module mẫu, build/test xanh
- [x] 4. Migration + entity (`payment_orders` + bảng ví, yêu cầu hoàn, rút, chứng từ, nhật ký)
- [x] 5. TDD: `PayosClient` → `PaymentOrderService` (tạo, hủy, tra cứu) → controller nội bộ
- [x] 6. Test hạ tầng 7–10, hợp đồng, đếm truy vấn
- [x] 7. Compose, `.env.example`, README, walkthrough, `code-review`, commit, PR

## Tái sử dụng

Quét trên source hiện tại (`services/_template-nest/src`, `services/listing/src`, `services/identity/src`):

| Nhu cầu | Quyết định | Chỗ có sẵn |
|---|---|---|
| Khung service (config, logging, envelope, lỗi, health, DB, outbox, InternalHttp) | DÙNG LẠI (chép nguyên) | `services/_template-nest` |
| Mẫu cờ bật module + kiểm biến bắt buộc lúc khởi động | DÙNG LẠI (cùng cách) | `listing/config/listing.env.ts`, `feature-flags.ts` `isListingEnabled`, `env.bootstrap.ts` |
| `AppException`, `createUuidParamPipe`, `@Public`, `ApiExcludeController` cho `/internal/*` | DÙNG LẠI | `src/common/*`, mẫu `listings.internal.controller.ts` |
| Nhận biết `23505` theo tên ràng buộc | DÙNG LẠI cách làm (hàm nhỏ cục bộ) | identity `unique-violation.ts`, listing `listing.sql.ts`: là service khác, **không import**; payment viết hàm riêng 1 dòng trong `payment/errors` |
| Kiểm response theo OpenAPI, test hạ tầng, `createTestApp` | DÙNG LẠI | template `test/helpers/contracts.ts`, `infra.ts`, `create-test-app.ts` |
| `PayosClient` (bọc `@payos/node`) | VIẾT MỚI | Không có; SDK đã chốt ở `architecture.md §5` |
| `PaymentOrderService`, entity, DTO, lỗi `PAYMENT_*` | VIẾT MỚI | Nghiệp vụ riêng payment |

Không có thành phần dùng chung mới cho nhiều service; không chạm `_template-nest`.

## Kế hoạch chi tiết

> **Claude tự duyệt 2026-11-21** (A trao quyền, `decisions-log.md`). TDD bật (`warn`).

### A. Điểm chưa rõ trong thiết kế (ghi `van-de-can-quyet-dinh.md` C22, C23; không chặn phần còn lại)

| # | Chỗ | Cách làm trong T3.1 |
|---|---|---|
| C22 | `API_Spec §2c`: `GET` "hỏi payOS nếu `PENDING` mà chưa có link" — không nói làm gì với kết quả; SDK payOS tra cứu không trả `checkoutUrl` | **Chưa làm phần hỏi payOS**: `GET` chỉ đọc DB (đúng mô tả "Chỉ đọc" của hợp đồng). Chờ A chốt |
| C23 | `API_Spec §2a`: gọi lại khi order `PENDING` **chưa có** link (lần đầu payOS lỗi) — bảng chỉ có dòng "`PENDING` có link → 200" | Trả `503 PAYMENT_PROVIDER_UNAVAILABLE`, không gọi lại payOS (theo `§7.3`: "order giữ `PENDING` không link; job của rental xử lý"); đề xuất cho A: tra payOS theo `orderCode`, chưa có thì tạo lại |

Chi tiết cài đặt (không đổi luật, ghi walkthrough): hủy order chưa có link thì **không** gọi payOS (link chưa từng được tạo thành công, và link payOS tự hết hạn đúng `expiresAt`); `description` gửi payOS là `DC<orderCode>` (payOS giới hạn 25 ký tự), `listingTitle` vào `items[0].name`.

### B. File

| File | Việc |
|---|---|
| `services/payment/**` | Chép `services/_template-nest` (bỏ `node_modules`, `dist`, `.env`, `openapi.json`); đổi `name`, `description`, `SERVICE_NAME=payment`, `PORT=3004`, `Dockerfile`; xóa module mẫu (`src/example/`, entity + migration mẫu, `test/example.e2e-spec.ts`) |
| `package.json` (payment), `pnpm-lock.yaml` | `@payos/node@2.0.5` ghim chính xác (2.0.6 mới 9 ngày) |
| `src/config/env.validation.ts` (+spec) | `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (tùy chọn ở schema chung), `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_TIMEOUT_MS` (2500) |
| `src/payment/config/payment.env.ts` (+spec), `src/config/env.bootstrap.ts`, `feature-flags.ts` | Bắt buộc `DATABASE_URL`, `PAYOS_*` ba khóa, `JWT_ISSUER`, khóa công khai JWT; `isPaymentEnabled = isDatabaseEnabled()` |
| `src/database/migrations/1734000000000-create-payment-tables.ts` | DDL `RE.PAYMENT §6` + `RE.PAYOUT §7` (+ một dòng `admin_wallet` id 1); có `down` |
| `src/payment/entities/payment-order.entity.ts` | Bảng `payment_orders` |
| `src/payment/clients/payos.client.ts` (+spec) | `createLink` (`maxRetries: 0`), `cancelLink` (retry mặc định của SDK tắt, dùng `maxRetries: 2`), timeout `PAYOS_TIMEOUT_MS`; lỗi mạng/timeout/5xx → `503 PAYMENT_PROVIDER_UNAVAILABLE`; không log khóa, không chép lỗi gốc |
| `src/payment/services/payment-order.service.ts` (+spec) | `create`, `cancel`, `get` theo `API_Spec §2` |
| `src/payment/controllers/payment-orders.internal.controller.ts` | `POST /internal/payment-orders` (201/200), `GET /internal/payment-orders/:depositId`, `POST …/:depositId/cancel` (200); `@Public` + `@ApiExcludeController` như listing |
| `src/payment/dto/payment-order.dto.ts` (+spec) | Body tạo order (khớp `CreateOrderRequest`, `additionalProperties: false`), view |
| `src/payment/errors/payment.errors.ts` | 5 mã của `API_Spec §4` |
| `src/payment/payment.module.ts`, `src/app.module.ts` | Nối module |
| `test/setup-infra-env.ts`, `test/payment-orders.infra-spec.ts` | `payment_db`; test 7–10, hợp đồng, đếm truy vấn |
| `infra/compose/docker-compose.yml`, `.env.example` gốc, `services/payment/.env.example` | Service `payment` profile `apps`; biến `PAYOS_*` |
| `services/payment/README.md`, `guides/RE_Payment_Code_Walkthrough.md`, `project-knowledge/CLAUDE.md §2.5`, `project-structure.md` | Tài liệu |

Gateway: không đổi (route webhook đã có, xử lý ở T3.4). `contracts/`: không đổi.

### C. Test

| Tầng | Test |
|---|---|
| `test` | `payos.client` (tham số gửi SDK, `maxRetries: 0` khi tạo, map lỗi → 503, không lộ khóa), `payment-order.service` (bảng §2a, §2b với SDK giả: thứ tự gọi, `expiresAt` ≤ now, trạng thái), DTO, `payment.env`, `env.validation` |
| `test:infra` | **7** tạo hai lần cùng `depositId` → một order, một lần gọi payOS; **8** payOS timeout → `503`, order có trong DB trước khi gọi; **9** hủy `PENDING` → payOS `cancel` gọi trước `UPDATE`; **10** hủy khi webhook vừa thắng (`PAID`) → `409`. Thêm: hai lần tạo đồng thời, hợp đồng OpenAPI mọi response, đếm truy vấn. payOS thay bằng bản giả qua `overrides` (không gọi payOS thật) |
| `test:e2e` | Các e2e chung của template giữ nguyên |

### D. Số truy vấn (ngưỡng ghi 6)

| Endpoint | Truy vấn |
|---|---|
| tạo (mới) | 3: SELECT theo `depositId`, INSERT (`nextval` trong câu), UPDATE link |
| tạo (đã có) | 1 |
| hủy | 2: SELECT, UPDATE (+1 SELECT khi UPDATE 0 dòng) |
| tra cứu | 1 |

## Blockers / Ghi chú

- `code-review` 5 chiều (2026-11-21): không CRITICAL, không MAJOR. Security: `/internal/*` `@Public` như listing (hạn chế đã biết), không log khóa, log SDK tắt. Performance: 3/1/2/1 truy vấn, `deposit_id`, `payos_order_code` có UNIQUE (index). Correctness: không transaction bao payOS; `bigint` qua `bigintToNumber`; đua hủy/webhook bằng `UPDATE ... WHERE status='PENDING'`. Style: đúng `project-structure.md`, controller mỏng, env và 5 mã lỗi khai đủ. Reuse: không import chéo service. MINOR: SDK payOS tự đọc `PAYOS_BASE_URL` nếu có (test dùng), ghi walkthrough.
- TDD: DTO spec và infra-spec viết sau code (tech-debt #20).

- T2.5 (`feature/T2.5-identity-otp-account`) đã commit, chưa push: GitHub chưa liên kết với Claude (2026-11-21). Đã nhắn A.
