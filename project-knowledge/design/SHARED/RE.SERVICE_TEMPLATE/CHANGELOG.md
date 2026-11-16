# RE.SERVICE_TEMPLATE — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Thêm details.outcome cho InternalHttpService, ghi hành vi idempotency đã kiểm.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §3, §5, §6 | Sửa |
| 2 | `Processing_Flow.md` §3, §5 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §3, §5, §6
- `Processing_Flow.md` §3, §5
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- `services/_template-nest` (A, bước 0 T1.2), chép sang identity và các service mới; `.env` gốc `HTTP_TIMEOUT_MS=3000`.
