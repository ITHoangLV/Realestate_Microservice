# RE.IDENTITY — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv
- **summary:** Đổi vai trò mà Redis lỗi khi thu hồi phiên trả `503` thay vì `200`, giống luồng khóa tài khoản.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `Processing_Flow.md` §3 bước 2, §5 | Sửa |
| 2 | `API_Spec.md` §1.5 | Thêm dòng 4 |
| 3 | `Component_Class_Design.md` §5 test 10 | Sửa |

- **Cũ:** Redis lỗi → log `warn`, trả `200`; quyền cũ còn dùng được tới khi refresh token hết hạn (7 ngày) `[cần xác nhận]`.
- **Mới:** `503 DEPENDENCY_UNAVAILABLE`; vai trò đã đổi trong DB, quản trị viên gọi lại để thu hồi phiên.
- **Lý do:** không để quyền cũ sống tới 7 ngày; thống nhất với khóa tài khoản (`API_Spec.md §1.9`). Ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md`, `Component_Class_Design.md`, `Processing_Flow.md` (header v1.0 → v1.1)

### Ảnh hưởng

- identity (A, T2.1): `UserAdminService.changeRole`, test 10.
