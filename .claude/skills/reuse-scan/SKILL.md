---
name: reuse-scan
description: >
  Quét code ĐÃ CÓ trước khi viết thành phần dùng chung mới trong Real-estate (util, helper, guard,
  decorator, filter, interceptor, client, mapper, hằng, enum, hàm lặp lại). Kích hoạt ở Bước 2a của
  developer, hoặc khi nghe "có sẵn chưa", "tránh trùng", "dùng lại hay viết mới". Xuất Reuse Report
  DÙNG LẠI / MỞ RỘNG / VIẾT MỚI vào current-task.md.
---

# reuse-scan

**MUST** chạy trước khi tạo bất kỳ thành phần dùng chung nào, và luôn chạy ở `developer` Bước 2a.
**NEVER** viết thành phần dùng chung mới khi chưa có Reuse Report. **NEVER** kết luận "chưa có" mà không ghi đã quét ở đâu, bằng cách nào.

> Căn cứ duy nhất là **source hiện tại**, không phải danh sách viết tay trong tài liệu (tài liệu có thể đã cũ).

## Bước 0 — Nguồn quét

Theo thứ tự ưu tiên:

1. `services/<service đang làm>/src/` — cùng service, gồm phần kỹ thuật chung đã chép vào (`common/`, `messaging/`, `storage/`, `health/`, `database/`, `redis/`).
2. `services/_template-nest/src/` — bản gốc phần kỹ thuật chung: `InternalHttpService`, `AppException` + `error-codes.ts`, `JwtAuthGuard` / `RolesGuard` / `@Public` / `@Roles` / `@CurrentUser`, `@Idempotent`, `ResponseEnvelopeInterceptor` / `Paginated`, outbox/inbox, `StorageService`, `HealthRegistry`, `transformers.ts`, `test/helpers/`. Bản trong service lệch bản gốc → ghi lại.
3. `services/*/src/` khác — chỉ để **phát hiện trùng**; không được import chéo. Phần kỹ thuật trùng ở ≥ 2 service → ứng viên đưa vào `_template-nest` (ADR-0014).
4. `services/api-gateway/src/` — nếu đang sửa gateway.
5. `contracts/openapi/`, `contracts/events/` — kiểu dữ liệu, schema đã có cho API nội bộ và sự kiện.
6. `package.json` của service và gốc — thư viện đã cài (`class-validator`, `joi`, `amqplib`, `@aws-sdk/*`…). Không có thì không tự thêm (`architecture.md §5`).

Nguồn chưa tồn tại (ví dụ service chưa được tạo từ template) → ghi là **vùng mù**, không coi như đã quét.

## Bước 1 — Từ khóa

- Khái niệm nghiệp vụ (theo `domain-glossary.md`), cả Việt lẫn Anh: `deposit`, `hold`, `held_until`, `payment order`, `refund`, `withdrawal`, `receipt`, `wallet`, `outbox`, `saga`…
- Động từ kỹ thuật: validate, parse, format, map, retry, paginate, sign, verify, hash, presign.
- Biến thể tên theo `coding-convention.md §3`: `*.util.ts`, `*.guard.ts`, `*.decorator.ts`, `*.client.ts`, `*.interceptor.ts`, `*.job.ts`, `*Service`.

## Bước 2 — Tra cứu

- Đi rộng trước (Grep/Glob toàn bộ nguồn ở Bước 0), sâu sau (đọc ứng viên).
- Ghi lại công cụ, nguồn, từ khóa đã dùng.

## Bước 3 — Phân loại

| Nhóm | Nghĩa | Bắt buộc ghi |
|---|---|---|
| **DÙNG LẠI** | Đã có đúng nhu cầu | `path#symbol` + cách gọi |
| **MỞ RỘNG** | Gần đúng, bổ sung thay vì viết song song | Vị trí + thay đổi dự kiến. Chạm phần kỹ thuật chung → sửa `_template-nest` trước rồi chép sang service, PR do A duyệt |
| **VIẾT MỚI** | Thật sự chưa có | Lý do + đã quét nguồn nào, từ khóa nào |

Không thấy ≠ không có. Nghi có mà chưa xác nhận được → dừng, hỏi user.

## Bước 4 — Ghi vào `current-task.md`

```markdown
## Tái sử dụng
> Quét <YYYY-MM-DD> · Nguồn: <liệt kê> · Cách tra: <Grep/Glob/đọc file…>
> Từ khóa: <…> · Vùng mù: <… hoặc `không`>

| Thành phần cần | Nhóm | Vị trí đã có / lý do viết mới |
|---|---|---|
| Gọi listing có retry | DÙNG LẠI | `services/rental/src/common/http/internal-http.service.ts#InternalHttpService` |
| Kiểm `Idempotency-Key` cho tạo đơn | DÙNG LẠI | `services/rental/src/common/idempotency/idempotent.decorator.ts#Idempotent` |
| Tính 70% tiền hoàn | VIẾT MỚI | Đã quét services/payment, _template-nest với `refund`, `percent`: không có |
```

**NEVER** để Reuse Report chỉ trong chat — `code-reviewer` chiều 5 đối chiếu bảng này.
