# Quy ước viết code

> Áp dụng cho `services/*` (gồm `api-gateway`) và `services/_template-nest`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 1. Ranh giới service — quy tắc cứng

| Không được | Thay bằng |
|---|---|
| Import code từ `services/<service-khác>/` | HTTP qua `clients/` hoặc sự kiện |
| Kết nối database của service khác | API nội bộ |
| `@ManyToOne` trỏ sang entity của service khác | Cột `uuid` + bản chụp nếu cần hiển thị |
| Đặt luật nghiệp vụ trong phần dùng chung (`src/common`, `src/messaging`, `src/storage`) hoặc gateway | Đặt trong module nghiệp vụ của service sở hữu |
| Gọi `axios`, `fetch` trực tiếp tới service khác | `InternalHttpService` |
| Dùng địa chỉ cố định | Biến môi trường `INTERNAL_<SERVICE>_URL` |
| Tự tạo exchange/queue trong code | Sửa `infra/rabbitmq/definitions.json` |

## 2. Cấu trúc module

Theo mẫu `services/identity/src/identity/`: mỗi miền nghiệp vụ một thư mục `src/<miền>/`, chia theo vai trò file.

```text
src/<miền>/
  <miền>.module.ts
  controllers/     nhận request, gọi service; *.internal.controller.ts cho /internal
  services/        luật nghiệp vụ, transaction
  dto/             validate bằng class-validator
  entities/        khai báo cột
  clients/         gọi service khác hoặc payOS, đổi kiểu dữ liệu
  jobs/            công việc nền (@nestjs/schedule)
  events/          handler sự kiện (EventHandlerRegistry)
  errors/          mã lỗi <MIỀN>_* và hàm dựng AppException
  config/          biến môi trường riêng của service
```

| Thành phần | Được làm | Không được làm |
|---|---|---|
| Controller | Nhận request, gọi service, chọn status code | Truy vấn DB, luật nghiệp vụ |
| Service | Luật nghiệp vụ, transaction | Biết `Request`, `Response` của Express |
| DTO | Validate | Chứa logic |
| Entity | Khai báo cột | Gọi repository |
| Client | Gọi bên ngoài, đổi kiểu | Quyết định nghiệp vụ |
| Job | Quét bản ghi đến hạn, gọi service | Tự chuyển trạng thái ngoài bảng §5 `RE.BUSINESS_RULES` |

## 3. Đặt tên

| Loại | Quy ước | Ví dụ |
|---|---|---|
| File | kebab-case + hậu tố | `deposit-saga.service.ts` |
| Class | PascalCase | `DepositSagaService` |
| API nội bộ | `*.internal.controller.ts` | `listings.internal.controller.ts` |
| Client | `<đích>.client.ts` | `listing.client.ts` |
| Job | `<việc>.job.ts` | `hold-expiry.job.ts` |
| Biến môi trường | UPPER_SNAKE_CASE | `INTERNAL_LISTING_URL` |
| Cột, bảng | snake_case | `seller_acknowledged_at` |
| Package | `@realestate/<service>` | `@realestate/rental` |
| Routing key sự kiện | `<miền>.<sự kiện>` chữ thường | `payment.deposited` |
| Mã lỗi | `<MIỀN>_<LÝ_DO>` | `RENTAL_REFUND_WINDOW_CLOSED` |

## 4. Thao tác ghi

Với mỗi thao tác ghi phải trả lời được:

1. **Transaction gồm những bước nào?** `dataSource.transaction(...)`; sự kiện ghi bằng `OutboxService.add(manager, ...)` trong cùng transaction.
2. **Hai request đồng thời thì sao?** `UPDATE ... WHERE status = <mong đợi>`; 0 dòng là bên thua (BR-18). Hoặc ràng buộc duy nhất.
3. **Gọi lại lần hai thì sao?** API ghi quan trọng dùng `@Idempotent()`; API nội bộ idempotent theo khóa nghiệp vụ (`depositId`).
4. **Bước sau lỗi thì bước trước xử lý sao?** Xem `design/RENTAL/RE.DEPOSIT_SAGA/`.

**Không giữ transaction khi gọi HTTP.** Chia: transaction ngắn → gọi HTTP → transaction ngắn.

## 5. TypeORM và migration

- `synchronize: false`. Schema chỉ đổi qua migration (ADR-0013).
- UUID dùng `gen_random_uuid()` (`uuidExtension: 'pgcrypto'`).
- Khóa ngoại chỉ trong cùng service. Không `CASCADE` sang dữ liệu service khác.
- `bigint` trả về chuỗi: dùng transformer ở `src/database/transformers.ts` hoặc `Number()` trước khi tính.
- Giữ migration `CreateMessagingTables` nếu service phát hoặc nhận sự kiện.
- Không sửa migration đã merge.

```powershell
pnpm --filter @realestate/rental migration:generate src/database/migrations/<Tên>
pnpm --filter @realestate/rental migration:run
```

## 6. Cấu hình

- Validate bằng Joi ở `src/config/env.validation.ts`; biến riêng của service ở `src/<miền>/config/`.
- Thiếu biến bắt buộc → dừng khởi động, in rõ biến nào.
- Thêm biến: cùng commit thêm vào `.env.example` của service, `.env.example` gốc (nếu dùng chung) và `infra/compose/docker-compose.yml`.

## 7. Log

- pino JSON một dòng: `level, time, service, correlationId, msg`. Inject `PinoLogger` rồi `setContext(...)`.
- Không log mật khẩu, token, số tài khoản, chữ ký payOS, nội dung `.env`.
- Nhánh bất thường log `warn`: bù trừ, webhook sai chữ ký/số tiền, tiền đến muộn, bên thua `UPDATE` có điều kiện.
- Lỗi hệ thống log `error` kèm stack; response chỉ trả mã lỗi.

## 8. Test

| Tầng | Công cụ | Lệnh | Bắt buộc cho |
|---|---|---|---|
| Unit | Jest, `*.spec.ts` cạnh code | `pnpm test` | Bảng chuyển trạng thái, tính tiền hoàn, ghi ví, `BR-xx` |
| E2E trong tiến trình | Jest + supertest, `test/*.e2e-spec.ts` | `pnpm test:e2e` | Controller, envelope, lỗi, idempotency |
| Hạ tầng thật | `test/*.infra-spec.ts` | `pnpm test:infra` | Transaction, ràng buộc duy nhất, outbox, inbox, DLQ, đồng thời |
| Hợp đồng | `expectEventMatchesContract`, `pnpm contracts:check` | | Mọi sự kiện phát ra |
| API | Postman + Newman | | Luồng chính và lỗi nghiệp vụ qua gateway |
| Tải, lỗi | k6, `docker compose stop` | | E1–E10 |

**Tối thiểu cho mỗi service:** test các `BR-xx` thuộc service đó, cả nhánh đúng và nhánh sai. Test đồng thời chạy với Postgres thật.

## 9. Trước khi mở PR

```powershell
pnpm lint
pnpm format:check
pnpm contracts:check
pnpm build
pnpm --filter @realestate/<service> test
pnpm --filter @realestate/<service> test:e2e
pnpm --filter @realestate/<service> test:infra   # khi chạm DB, Redis, RabbitMQ
```
