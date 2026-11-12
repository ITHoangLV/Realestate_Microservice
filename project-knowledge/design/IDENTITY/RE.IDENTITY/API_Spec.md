# RE.IDENTITY — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.IDENTITY` — tài khoản, xác minh email OTP, quên mật khẩu, đăng nhập Google, phiên, khóa tài khoản, tài khoản nhận tiền, vai trò |
| **Service** | `identity` (cổng 3001) |
| **Quy tắc** | BR-01, BR-02; quy tắc phụ Bảng 2.6 |
| **CSDL** | `identity_db` / `identity_user`; Redis (refresh token, OTP, token đặt lại mật khẩu); SMTP (Mailpit khi dev) |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. API công khai

| # | Method, đường dẫn | Quyền | Kết quả | Nguồn |
|---|---|---|---|---|
| 1 | `POST /api/v1/auth/register` | public | `201` user `PENDING_VERIFICATION`; chỉ `TENANT`/`LANDLORD`; gửi OTP | Code, sửa theo B10 |
| 2 | `POST /api/v1/auth/login` | public | `200` `{ accessToken, refreshToken, tokenType, expiresIn }`; chặn tài khoản chưa xác minh, bị khóa | Code, sửa theo B10, C2 |
| 3 | `POST /api/v1/auth/refresh` | public | `200` cặp token mới; token cũ dùng một lần | Code |
| 4 | `POST /api/v1/auth/logout` | public | `204`; thu hồi cả họ refresh token | Code |
| 5 | `GET /api/v1/auth/me` | user | `200` người đang đăng nhập | Code |
| 6 | `GET /api/v1/users/me/bank-account` | user | `200` `{ bankName, accountHolder, accountLast4 }` hoặc `404` | Chốt 2026-11-13 |
| 7 | `PUT /api/v1/users/me/bank-account` | user | `200`; số tài khoản mã hóa khi lưu | Chốt 2026-11-13 |
| 8 | `GET /api/v1/admin/users` | admin | `200` danh sách phân trang | Chốt 2026-11-13 |
| 9 | `PATCH /api/v1/admin/users/:id/role` | admin | `200`; thu hồi refresh token của người đó | Chốt 2026-11-13 |
| 10 | `POST /api/v1/auth/verify-otp` | public | `200` cặp token; tài khoản `ACTIVE` | Chốt 2026-11-13 (B10) |
| 11 | `POST /api/v1/auth/resend-otp` | public | `202` luôn (không lộ email) | Chốt 2026-11-13 (B10) |
| 12 | `POST /api/v1/auth/forgot-password` | public | `202` luôn (Bảng 2.6: không lộ email có tồn tại) | Chốt 2026-11-13 (B10) |
| 13 | `POST /api/v1/auth/reset-password` | public | `204`; thu hồi mọi phiên | Chốt 2026-11-13 (B10) |
| 14 | `POST /api/v1/auth/google` | public | `200` cặp token | Chốt 2026-11-13 (B10) |
| 15 | `PATCH /api/v1/users/me` | user | `200`; sửa `fullName`, `phone` | Chốt 2026-11-13 (B9) |
| 16 | `POST /api/v1/admin/users/:id/lock`, `POST /api/v1/admin/users/:id/unlock` | admin | `200` | Chốt 2026-11-13 (C2) |

Mỗi tài khoản đúng một vai trò ở `users.role`; ai vừa thuê vừa cho thuê thì đăng ký thêm tài khoản bằng email khác (B9, 2026-11-12).

### 1.1 `POST /auth/register`

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `email` | string | email |
| `password` | string | theo `register.dto.ts` |
| `fullName` | string | ≤ 200 |
| `role` | string | `TENANT` hoặc `LANDLORD` |
| `phone` | string, không bắt buộc | Duy nhất khi có (B9); định dạng `[cần xác nhận]` |

Thứ tự kiểm tra:

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | DTO sai, hoặc `role` khác `TENANT`/`LANDLORD` (gồm `ADMIN`) | `400 VALIDATION_FAILED` (BR-01) |
| 2 | Vi phạm `UQ_users_email_lower` | `409 IDENTITY_EMAIL_TAKEN` (BR-02) |
| 3 | Vi phạm `UQ_users_phone` | `409 IDENTITY_PHONE_TAKEN` |
| 4 | Hợp lệ | `INSERT users` (`status = PENDING_VERIFICATION`) + outbox `identity.registered` cùng transaction; sau commit sinh OTP (Redis) và gửi email → `201` |

Gửi email lỗi sau commit: vẫn `201`, log `warn`; người dùng bấm gửi lại (route 11). Redis dừng: `503 DEPENDENCY_UNAVAILABLE` trước khi ghi DB.

### 1.2 `POST /auth/login`

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Sai email hoặc sai mật khẩu, hoặc tài khoản chỉ có Google (không có mật khẩu) | `401 IDENTITY_INVALID_CREDENTIALS` (không lộ email đã đăng ký) |
| 2 | `status = PENDING_VERIFICATION` | `403 IDENTITY_EMAIL_NOT_VERIFIED` |
| 3 | `status = LOCKED` | `403 IDENTITY_ACCOUNT_LOCKED` |
| 4 | Hợp lệ | `200` cặp token |

Kiểm trạng thái **sau** khi đúng mật khẩu, để người không biết mật khẩu không dò được trạng thái tài khoản. Redis dừng → `503 DEPENDENCY_UNAVAILABLE`.

### 1.3 `POST /auth/refresh`

Token không có, hết hạn, đã thu hồi, bị dùng lại → `401 IDENTITY_INVALID_REFRESH_TOKEN`. Token đã dùng bị gửi lại → thu hồi cả họ.

### 1.4 `PUT /users/me/bank-account`

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `bankName` | string | `[cần xác nhận]` danh sách ngân hàng |
| `accountNumber` | string | chỉ chữ số, 6–19 ký tự `[cần xác nhận]` |
| `accountHolder` | string | |

Một người một tài khoản nhận tiền `[cần xác nhận]`. Response không bao giờ có số đầy đủ.

### 1.5 `PATCH /admin/users/:id/role`

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | `role` không thuộc `TENANT`, `LANDLORD`, `ADMIN` | `400 VALIDATION_FAILED` |
| 2 | Người dùng không tồn tại | `404 IDENTITY_USER_NOT_FOUND` |
| 3 | Hợp lệ | Đổi vai trò, thu hồi mọi họ refresh token của người đó → `200` |

### 1.6 Xác minh email OTP (route 10, 11) — Bảng 2.6

OTP 6 chữ số, hiệu lực 5 phút, sai 5 lần thì hủy, gửi lại sau 60 giây (Báo cáo Bảng 2.6). Lưu Redis dạng băm, không lưu DB.

Route 10, body `{ email, otp }`:

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | DTO sai | `400 VALIDATION_FAILED` |
| 2 | Không có tài khoản `PENDING_VERIFICATION` với email, hoặc không có OTP còn hiệu lực | `400 IDENTITY_OTP_INVALID` |
| 3 | Sai mã: tăng số lần sai; lần thứ 5 xóa OTP | `400 IDENTITY_OTP_INVALID` |
| 4 | Đúng | Xóa OTP; `UPDATE users SET status='ACTIVE', email_verified_at=now() WHERE id AND status='PENDING_VERIFICATION'`; cấp phiên → `200` cặp token |

Route 11, body `{ email }`: còn trong 60 giây kể từ lần gửi trước → `429 IDENTITY_OTP_RESEND_TOO_SOON`; email không tồn tại hoặc đã xác minh → `202` không gửi; còn lại sinh OTP mới (thay mã cũ, đặt lại số lần sai) và gửi → `202`.

### 1.7 Quên mật khẩu (route 12, 13) — Bảng 2.6

Route 12, body `{ email }`: luôn `202`. Có tài khoản không bị khóa → sinh token ngẫu nhiên 32 byte, lưu Redis `sha256(token)` → `userId` TTL `PASSWORD_RESET_TTL_SECONDS`, gửi email link `PASSWORD_RESET_URL?token=<token>` (trang Next.js).

Route 13, body `{ token, newPassword }`:

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | DTO sai, mật khẩu không đạt `register.dto.ts` | `400 VALIDATION_FAILED` |
| 2 | Token không có, hết hạn, đã dùng | `400 IDENTITY_RESET_TOKEN_INVALID` |
| 3 | Hợp lệ | Xóa token (dùng một lần); cập nhật `password_hash`; thu hồi mọi họ refresh token của người đó → `204` |

### 1.8 Đăng nhập Google (route 14)

Frontend lấy ID token bằng Google Sign-In rồi gọi route 14. Body `{ idToken, role? }`.

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | ID token sai chữ ký, sai `aud` (`GOOGLE_CLIENT_ID`), hết hạn | `401 IDENTITY_GOOGLE_TOKEN_INVALID` |
| 2 | Token không có email hoặc `email_verified = false` | `401 IDENTITY_GOOGLE_TOKEN_INVALID` (Bảng 2.6: bắt buộc có email) |
| 3 | Đã có `user_identities (google, sub)` | Lấy user đó |
| 4 | Chưa có liên kết nhưng email đã có tài khoản | Tự liên kết: `INSERT user_identities`; vai trò giữ nguyên. Tài khoản còn `PENDING_VERIFICATION` → `ACTIVE` và **xóa `password_hash`** (mật khẩu do người chưa chứng minh sở hữu email đặt; chủ email đặt lại qua route 12) |
| 5 | Chưa có tài khoản, thiếu `role` hoặc `role` khác `TENANT`/`LANDLORD` | `400 IDENTITY_ROLE_REQUIRED` (client hiện bước chọn vai trò rồi gọi lại) |
| 6 | Chưa có tài khoản, có `role` | Transaction: `INSERT users` (`password_hash = null`, `status = ACTIVE`, `email_verified_at = now()`) + `user_identities` + outbox `identity.registered` |
| 7 | `status = LOCKED` | `403 IDENTITY_ACCOUNT_LOCKED` |
| 8 | Hợp lệ | `200` cặp token |

Thư viện kiểm ID token: `google-auth-library` (`OAuth2Client.verifyIdToken`), chốt 2026-11-13, ghi ở `architecture.md §5`.

### 1.9 Khóa, mở khóa tài khoản (route 16) — C2, Bảng 2.6

Body route khóa `{ reason }` (bắt buộc). Chỉ thay đổi identity: tin đăng, đơn, tiền của người đó không bị động tới; quản trị viên dùng chức năng sẵn có nếu cần.

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Người dùng không tồn tại | `404 IDENTITY_USER_NOT_FOUND` |
| 2 | Khóa chính mình | `409 IDENTITY_CANNOT_LOCK_SELF` |
| 3 | Khóa: `UPDATE users SET status='LOCKED', locked_at, locked_by, lock_reason WHERE id AND status <> 'LOCKED'`; 0 dòng → đã khóa, vẫn chạy bước 4 (idempotent) | |
| 4 | Thu hồi mọi họ refresh token của người đó; Redis lỗi | `503 DEPENDENCY_UNAVAILABLE`; trạng thái đã `LOCKED` nên đăng nhập mới bị chặn; quản trị viên gọi lại để thu hồi |
| 5 | Xong | `200`. Access token còn hạn tối đa 15 phút (Báo cáo §7.2) |

Mở khóa: về trạng thái trước khi khóa: `email_verified_at` có → `ACTIVE`, chưa có → `PENDING_VERIFICATION` (phải nhập OTP); xóa `locked_*` (chốt 2026-11-13).

### 1.10 `PATCH /users/me` (route 15)

Body `{ fullName?, phone? }`. `phone` trùng người khác → `409 IDENTITY_PHONE_TAKEN`; `phone: null` xóa số.

## 2. API nội bộ

| Method, đường dẫn | Bên gọi | Kết quả | Hợp đồng |
|---|---|---|---|
| `GET /internal/users/:id/bank-account` | payment (S3) | `200 { userId, bankName, accountHolder, accountNumber }`; chưa khai → `404 IDENTITY_BANK_ACCOUNT_NOT_FOUND` | Tạo `contracts/openapi/identity-internal.v1.yaml` ở T0.3 |

Payment cần số tài khoản đầy đủ để quản trị viên chuyển khoản; payment chỉ lưu bản chụp đã che (`RE.PAYOUT`). Có trả số đầy đủ qua API nội bộ hay quản trị viên xem ở identity `[cần xác nhận]`.

## 3. Sự kiện phát

| Sự kiện | Khi nào |
|---|---|
| `identity.registered` | Đăng ký thành công |

## 4. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn |
|---|---|---|---|---|
| `IDENTITY_EMAIL_TAKEN` | 409 | Email này đã được đăng ký | BR-02 | Code |
| `IDENTITY_INVALID_CREDENTIALS` | 401 | Email hoặc mật khẩu không đúng | | Code |
| `IDENTITY_INVALID_REFRESH_TOKEN` | 401 | Refresh token không hợp lệ hoặc đã hết hạn, hãy đăng nhập lại | | Code |
| `IDENTITY_USER_NOT_FOUND` | 404 | Không tìm thấy người dùng | | Đề xuất |
| `IDENTITY_BANK_ACCOUNT_NOT_FOUND` | 404 | Chưa khai tài khoản nhận tiền | | Đề xuất |
| `IDENTITY_PHONE_TAKEN` | 409 | Số điện thoại đã được dùng | B9 | Đề xuất |
| `IDENTITY_EMAIL_NOT_VERIFIED` | 403 | Email chưa được xác minh, hãy nhập mã OTP | FR01 | Đề xuất |
| `IDENTITY_ACCOUNT_LOCKED` | 403 | Tài khoản đã bị khóa | Bảng 2.6 | Đề xuất |
| `IDENTITY_OTP_INVALID` | 400 | Mã OTP không đúng hoặc đã hết hạn | Bảng 2.6 | Đề xuất |
| `IDENTITY_OTP_RESEND_TOO_SOON` | 429 | Vui lòng chờ trước khi gửi lại mã | Bảng 2.6 | Đề xuất |
| `IDENTITY_RESET_TOKEN_INVALID` | 400 | Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn | Bảng 2.6 | Đề xuất |
| `IDENTITY_GOOGLE_TOKEN_INVALID` | 401 | Không xác thực được tài khoản Google | Bảng 2.6 | Đề xuất |
| `IDENTITY_ROLE_REQUIRED` | 400 | Hãy chọn vai trò cho tài khoản mới | BR-01 | Đề xuất |
| `IDENTITY_CANNOT_LOCK_SELF` | 409 | Không thể khóa tài khoản của chính mình | | Đề xuất |

## 5. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | |
| `DATABASE_URL` | `postgres://identity_user:…@localhost:5433/identity_db` | |
| `REDIS_URL`, `REFRESH_TOKEN_REDIS_PREFIX` | bắt buộc, `identity:` | |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PRIVATE_KEY` | bắt buộc một | Ký RS256 |
| `JWT_PUBLIC_KEY_PATH` / `JWT_PUBLIC_KEY` | bắt buộc một | |
| `JWT_ISSUER` | `realestate-identity` | |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` | `900`, `604800` | |
| `RABBITMQ_URL`, `OUTBOX_RELAY_ENABLED` | | Chỉ phát |
| `BANK_ACCOUNT_ENCRYPTION_KEY` | `[cần xác nhận]` | Khóa mã hóa số tài khoản, đề xuất tên biến |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | dev: `mailpit`, `1025`, trống, trống, `no-reply@realestate.local` | Gửi OTP, link đặt lại (B10) |
| `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | `300`, `5`, `60` | Báo cáo Bảng 2.6 |
| `PASSWORD_RESET_TTL_SECONDS` | `900` | Đề xuất |
| `PASSWORD_RESET_URL` | `http://localhost:3000/reset-password` | Trang Next.js |
| `GOOGLE_CLIENT_ID` | bắt buộc khi bật đăng nhập Google | `aud` của ID token |

## 6. DDL

Đã có (`1731000000000-create-identity-tables.ts`):

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,                       -- null cho tài khoản chỉ đăng nhập Google
  full_name varchar(200) NOT NULL,
  role text NOT NULL CHECK (role IN ('TENANT','LANDLORD','ADMIN')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "UQ_users_email_lower" ON users (lower(email));

CREATE TABLE user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),
  provider_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- UNIQUE (provider, provider_user_id), UNIQUE (user_id, provider)
```

Thêm (migration mới, B9, B10, C2):

```sql
ALTER TABLE users
  ADD COLUMN phone varchar(20),
  ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','LOCKED')),
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by uuid,
  ADD COLUMN lock_reason varchar(500);
CREATE UNIQUE INDEX "UQ_users_phone" ON users (phone) WHERE phone IS NOT NULL;
```

Tài khoản đã có trước migration giữ `ACTIVE` (mặc định); đăng ký mới ghi `PENDING_VERIFICATION`. Seed ADMIN ghi `ACTIVE`.

Đề xuất `[cần xác nhận]`:

```sql
CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  bank_name varchar(100) NOT NULL,
  account_holder varchar(200) NOT NULL,
  account_number_encrypted bytea NOT NULL,  -- AES-GCM
  account_last4 char(4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 7. Điểm [cần xác nhận]

1. DTO chi tiết của route 6–7 (danh sách ngân hàng, độ dài số tài khoản). Đường dẫn route 1–16 và API nội bộ đã chốt 2026-11-13.
2. Định dạng số điện thoại.
3. Tên biến khóa mã hóa và cách quản trị viên xem số tài khoản đầy đủ.
