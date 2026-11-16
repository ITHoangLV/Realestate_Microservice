# RE.VIEWING — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Chốt route, chặn chủ tin tự đặt lịch, cách ghi outbox khi tự hủy.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1, §3, §5 | Sửa |
| 2 | `Component_Class_Design.md` §2, §4 | Sửa |
| 3 | `Processing_Flow.md` §4 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §1, §3, §5
- `Component_Class_Design.md` §2, §4
- `Processing_Flow.md` §4
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- rental (C, T3.2): `RENTAL_VIEWING_OWN_LISTING` đổi `409` → `403`. `contracts/` không đổi.
