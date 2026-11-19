# RE.IDENTITY — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v2.1] — 2026-11-18

- **type:** MINOR
- **author:** hoang.lv
- **summary:** Chốt chi tiết T2.1: route 6–8, định dạng mã hóa số tài khoản, thời điểm khai tài khoản nhận tiền; sơ đồ lớp bỏ `changeRole` còn sót.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1 (route 6, 7, 8), §1.4, §1.11, §2, §5, §6, §8 | Sửa, thêm |
| 2 | `Component_Class_Design.md` §1, §2, §5 | Sửa, thêm test 9a–9d |

- **Cũ:** route 6–7 chưa có `updatedAt`, quy tắc `accountHolder`, hành vi `PUT`; route 8 chưa có chi tiết; định dạng mã hóa chỉ ghi "AES-GCM"; DDL `bank_accounts` dùng ràng buộc không đặt tên; sơ đồ lớp `UserAdminService` còn `changeRole`.
- **Mới:**
  - Response route 6–7 `{ bankName, accountHolder, accountLast4, updatedAt }`; `PUT` luôn `200`, ghi đè bằng `INSERT … ON CONFLICT (user_id) DO UPDATE … RETURNING`; `accountHolder` 1–200 ký tự sau khi cắt khoảng trắng.
  - Mã hóa `iv(12) ‖ authTag(16) ‖ ciphertext`, IV ngẫu nhiên mỗi lần ghi, AAD = `userId`; khóa sai hoặc dữ liệu hỏng → `500 INTERNAL_ERROR`, log không kèm số; không xoay khóa.
  - Route 8: `page`, `pageSize` (20/50), `role?`, sắp `created_at DESC, id DESC`, tối đa hai truy vấn (TypeORM bỏ truy vấn đếm khi trang đầu chưa đầy), chỉ chọn cột của `UserDto`.
  - Thêm hai index cho danh sách: `IDX_users_created_at_id (created_at DESC, id DESC)`, `IDX_users_role_created_at_id (role, created_at DESC, id DESC)` (`non-functional-standards.md §1`: MUST có index cho cột lọc, sắp xếp).
  - DDL `bank_accounts` đặt tên `UQ_bank_accounts_user`, `FK_bank_accounts_user`.
  - Khai tài khoản nhận tiền khi rút lần đầu hoặc hoàn lần đầu, không có mục riêng ở hồ sơ.
  - Sơ đồ lớp: `UserAdminService.list(query)` thay `changeRole`; thêm `BankAccountCipher`; `revokeAllForUser` trả số họ.
  - `rotate` thành công `SADD familyId` rồi gia hạn TTL của set `user-families` (phát hiện khi viết test Bước 2: nếu không gia hạn, họ xoay vòng ở ngày thứ 6 sống tới ngày 13 còn set hết hạn ở ngày 7; `SADD` để phiên cũ tự vào set ở lần refresh kế tiếp, A chốt 2026-11-19).
  - Ghi hạn chế: phiên tạo trước thay đổi `user-families` không nằm trong set nên chưa refresh thì `revokeAllForUser` không thu hồi được; chưa bao giờ refresh thì tự hết hạn ≤ 7 ngày; refresh một lần thì thu hồi được.
- **Lý do:** chốt trước khi code T2.1 (`implementation/van-de-can-quyet-dinh.md` mục D, 2026-11-18). Không phá hợp đồng: `identity-internal.v1.yaml` không đổi.

### File design đã sửa

- `API_Spec.md`, `Component_Class_Design.md`, `Processing_Flow.md` (header v2.0 → v2.1; `Processing_Flow.md` không đổi nội dung)

### Ảnh hưởng

- identity (A, T2.1): làm theo bản này.
- payment (C, T3.6): `RE.PAYOUT` v1.2 ghi `[cần xác nhận]` về cách quản trị viên xem tài khoản người thuê.
- gateway, `contracts/`: không đổi.

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
