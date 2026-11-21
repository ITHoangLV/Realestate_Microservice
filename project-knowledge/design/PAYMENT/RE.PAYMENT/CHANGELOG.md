# RE.PAYMENT — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.2] — 2026-11-21

- **type:** PATCH
- **author:** hoang.lv
- **summary:** Ghi hai chỗ thiết kế bỏ ngỏ phát hiện khi làm T3.1 (C22, C23); không đổi luật, route, mã lỗi, hợp đồng.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §8 (mới) | Thêm điểm `[cần xác nhận]` |

- **Cũ:** §2c "hỏi payOS nếu `PENDING` mà chưa có link" không nói dùng kết quả; §2a không có dòng cho "gọi lại khi `PENDING` chưa có link".
- **Mới:** ghi hai điểm vào §8 kèm cách T3.1 đang làm (chỉ đọc DB; trả `503`) và đề xuất.
- **Lý do:** bám `CLAUDE.md` §8 (chỗ chưa rõ ghi `[cần xác nhận]`, không tự thêm luật). Chờ A chốt.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Chốt trạng thái order, xử lý tiền đến muộn sai số, cấu hình payOS.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1, §2, §5, §6, §7 | Sửa |
| 2 | `Component_Class_Design.md` §5 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §1, §2, §5, §6, §7
- `Component_Class_Design.md` §5
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- payment (C, T3.1, T3.4). `contracts/` không đổi.
