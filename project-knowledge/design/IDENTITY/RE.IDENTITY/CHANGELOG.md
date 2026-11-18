# RE.IDENTITY — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v2.0] — 2026-11-18

- **type:** MAJOR
- **author:** hoang.lv
- **summary:** Bỏ đổi vai trò: vai trò cố định từ lúc tạo tài khoản, muốn vai trò khác thì dùng email mới.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1 dòng 9, đoạn dưới bảng, §1.5 | Bỏ endpoint |
| 2 | `Processing_Flow.md` header, §3, §5 mục 1 | Bỏ |
| 3 | `Component_Class_Design.md` §1 (`user-admin.service.ts`), §2 (`revokeAllForUser`), §5 test 10 | Sửa, bỏ test |

- **Cũ:** `PATCH /api/v1/admin/users/:id/role` (quản trị viên đổi vai trò, thu hồi phiên; v1.1 thêm `503` khi Redis lỗi).
- **Mới:** không có API đổi vai trò. Mỗi email một tài khoản, mỗi tài khoản một vai trò cố định (đăng ký, Google, `seed:admin`). Muốn vai trò khác thì đăng ký tài khoản mới bằng email khác.
- **Lý do:** A chốt 2026-11-18 (`implementation/van-de-can-quyet-dinh.md`, nhật ký 2026-11-18). Lệch Báo cáo v2 FR08 ("đổi vai trò"); báo cáo cuối kỳ (T7.1) ghi lại.

### File design đã sửa

- `API_Spec.md`, `Component_Class_Design.md`, `Processing_Flow.md` (header v1.1 → v2.0)

### Ảnh hưởng

- identity (A, T2.1): không làm `UserAdminService.changeRole`, route 9, test 10. `revokeAllForUser` vẫn làm ở T2.1 vì T2.5 dùng khi khóa tài khoản, đặt lại mật khẩu.
- gateway: không đổi (dòng `/api/v1/admin/users/*` vẫn cần cho danh sách, khóa, mở khóa).
- Tài liệu nghiệp vụ: `RE.SRS.md` FR08, `RE.BUSINESS_RULES.md` UC-ACC-03.

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
