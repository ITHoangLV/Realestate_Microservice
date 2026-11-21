---
task: T2.5 identity: xác minh OTP, quên mật khẩu, Google, khóa tài khoản, số điện thoại
created: 2026-11-20
status: done
phase: implementation/PHASE-2.md#T2.5
branch: feature/T2.5-identity-otp-account (từ `develop` tại `d253f01`, working tree sạch lúc nhận task)
---

## Mô tả

Hoàn thiện identity theo B10, B9, C2: đăng ký sinh tài khoản `PENDING_VERIFICATION` và gửi OTP qua SMTP (Mailpit khi dev); `verify-otp`, `resend-otp`; quên và đặt lại mật khẩu; đăng nhập Google; khóa, mở khóa; `PATCH /users/me`; `phone` duy nhất. Người làm: A. Hạn M2 — 2026-12-04, ước ~12 giờ.

## Thiết kế liên quan

`design/IDENTITY/RE.IDENTITY/` v2.2: `API_Spec §1.1–1.11, §4, §5, §6`, `Processing_Flow §3a–3d`, `Component_Class_Design §1–3, §5 (test 13–23, 22a)`. `contracts/`: **không đổi** (`identity.registered` giữ nguyên payload, không có `status`; route công khai không nằm trong `contracts/openapi`).

## Definition of Done

- [x] Test 13–23 (gồm 22a), 12b, 24 ở `RE.IDENTITY/Component_Class_Design.md §5` pass: `otp.infra-spec` (13–17), `password-reset.infra-spec` (18, 19), `google.infra-spec` + `google-disabled.infra-spec` (20, 21, 24), `account.infra-spec` (22, 22a, 23)
- [x] identity `test` 357, `test:e2e` 97, `test:infra` 201 PASS (2026-11-21, sau sửa R1, R2; trước đó 354/97/200 ngày 2026-11-20)
- [x] Đăng ký qua gateway 8080, Mailpit nhận đúng 1 thư OTP từ `no-reply@realestate.local`; verify-otp 200; login 200; log identity không chứa OTP, email, phone
- [x] Đủ ba nhóm: SMTP/Mailpit + biến môi trường; migration `users`; service mới + route 10–16
- [x] Tech-debt #16 xử lý: `seed:users`, `seed:admin` ghi `status='ACTIVE'`, `email_verified_at=now()` kèm test
- [x] Số truy vấn đếm bằng log SQL trong infra-spec: register 2, verify-otp 2, forgot 1, reset 1, google mới 5 / đã liên kết 2 / liên kết 3–4, lock 2, unlock 2, PATCH me 2 (ngưỡng ghi 6)
- [x] `pnpm lint`, `format:check`, `build`, `contracts:check` sạch; gateway unit 239 + e2e 137 PASS
- [x] `openapi.json` của identity sinh lại (file bị `.gitignore`, không commit)
- [x] `guides/RE_Identity_Code_Walkthrough.md` cập nhật (không tạo file mới), README identity, `RE_Docker_Local_Guide.md` (Mailpit), `.env.example` cả hai chỗ

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (A duyệt 2026-11-20, kèm chỉnh sửa)
- [x] 3. Cấu hình: Mailpit, biến `SMTP_*`/`OTP_*`/`PASSWORD_RESET_*`/`GOOGLE_CLIENT_ID`, dependency (cần A cho phép `pnpm add`)
- [x] 4. Migration + entity + seed (có migration) — kèm TDD
- [x] 5. Code + test theo TDD (playbook `tdd` bật, `warn`): MailService → OTP + register/login → quên mật khẩu → Google → khóa/mở khóa + PATCH me
- [x] 6. Chạy test, kiểm chứng qua gateway + Mailpit, đếm truy vấn
- [ ] 7. Walkthrough, tài liệu, `code-review` 5 chiều, chuẩn bị PR

## Tái sử dụng

Quét trên source hiện tại (`services/_template-nest/src`, `services/identity/src`, `services/listing/src`, `services/api-gateway/src`):

| Nhu cầu | Quyết định | Chỗ có sẵn |
|---|---|---|
| Băm, so sánh mật khẩu; dummy verify chống đo độ trễ | DÙNG LẠI | `identity/services/password.service.ts` |
| Cấp phiên (họ refresh token + cặp token) | DÙNG LẠI | `AuthService.issueSession` (verify-otp, Google gọi lại) |
| Thu hồi mọi phiên của user | DÙNG LẠI | `RefreshTokenStore.revokeAllForUser` (reset mật khẩu, khóa) |
| Ghi `identity.registered` cùng transaction | DÙNG LẠI | `OutboxService.add(manager, ...)` (đăng ký, Google tạo mới) |
| Chuẩn hóa email, trim | DÙNG LẠI | `normalizeEmail`, `trim` trong `dto/register.dto.ts` |
| sha256 hex của token (token đặt lại) | DÙNG LẠI | `hashToken` trong `stores/redis-refresh-token.store.ts` (export sẵn) |
| Redis client | DÙNG LẠI | `RedisService.client` (đã có health check); tiền tố key dùng lại `REFRESH_TOKEN_REDIS_PREFIX` (`identity:`), khớp tên key ở `Component_Class_Design §3` |
| Lỗi 503/504 khi Redis, DB, SMTP lỗi kết nối | DÙNG LẠI | `all-exceptions.filter.ts` map sẵn sang `DEPENDENCY_UNAVAILABLE`/`TIMEOUT` |
| `AppException`, `@Public`, `@Roles('ADMIN')`, `@CurrentUser('sub')`, `createUuidParamPipe`, `ApiEnvelope`, `Paginated` | DÙNG LẠI | `src/common/*` của identity |
| Test hạ tầng: schema riêng, `readRootEnv`, `createTestApp`, `expectEventMatchesContract` | DÙNG LẠI | `test/helpers/*`, mẫu `test/auth.infra-spec.ts`, `test/admin-users.infra-spec.ts` |
| `isUniqueViolation` | **MỞ RỘNG** (cục bộ) | Hiện là hàm riêng trong `auth.service.ts` (không export) và chỉ biết mã `23505`. T2.5 cần phân biệt `UQ_users_email_lower` với `UQ_users_phone` theo tên constraint → thêm hàm `uniqueViolationConstraint(err): string \| undefined` cạnh nó (`identity/errors/` hoặc file nhỏ trong `services/`), **không** chạm `_template-nest` (không phải phần kỹ thuật chung của template). Listing có `isUniqueViolation` riêng ở `listing.sql.ts`: là service khác, không import |
| `MailService` (nodemailer, mẫu email) | VIẾT MỚI | Không có gì tương đương (template không có SMTP). Là code nghiệp vụ riêng của identity, không đưa vào `_template-nest` |
| `EmailVerificationService`, `PasswordResetService`, `GoogleAuthService` | VIẾT MỚI | Không có |
| Khóa, mở khóa trong `UserAdminService`; `ProfileController`; `UserStatus` enum | VIẾT MỚI | Mở rộng class có sẵn / thêm hằng cạnh `USER_ROLES` |
| Verifier ID token Google | VIẾT MỚI (interface + provider) | `GoogleIdTokenVerifier` bọc `google-auth-library`, token DI để test thay bằng bản giả |

Không có thành phần dùng chung mới cho nhiều service; không chạm `_template-nest`.

## Kế hoạch chi tiết

> **Trạng thái: A ĐÃ DUYỆT 2026-11-20 kèm chỉnh sửa dưới đây (ghi đè bảng Q1–Q6 bên dưới).** TDD bật (`warn`): mỗi hành vi viết test thấy FAIL rồi mới code.
>
> **Chỉnh sửa khi duyệt:**
> 1. `pnpm add nodemailer@10.3.1 google-auth-library@11.3.4`, ghim chính xác; **không** cài `@types/nodemailer` (nodemailer 10 kèm kiểu).
> 2. `UserDto` thêm `status`, `phone`; đã sửa `API_Spec`, `Component_Class_Design`, `Processing_Flow`, `CHANGELOG` v2.3 **trước** code.
> 3. `GOOGLE_CLIENT_ID` tùy chọn; trống → log `warn` lúc khởi động; route 14 `503 DEPENDENCY_UNAVAILABLE` **trước** khi kiểm token.
> 4. Backfill `email_verified_at = created_at` cho `ACTIVE` (đã ghi DDL `API_Spec §6`); `seed:admin` cũng ghi `status`, `email_verified_at`.
> 5. Gửi mail **không `await`**, `.catch` log `warn`, **áp dụng cả `register`**. Test Mailpit hỏi lại vài lần. Đã ghi `van-de-can-quyet-dinh.md` C21 (cooldown `resend-otp` theo `lower(email)`), **không sửa trong T2.5**.
> 6. Bỏ bước gateway.
>
> Hệ quả với kế hoạch: `register` không chờ mail nên test 13 phải đợi Mailpit; `EmailVerificationService.issue` chạy nền sau commit (lỗi Redis chỉ log), nhưng vẫn kiểm Redis sống **trước khi ghi DB** (`503`).

### A. Điểm cần A quyết trước khi code

| # | Vấn đề | Đề xuất của tôi |
|---|---|---|
| Q1 | **Dependency mới.** `nodemailer` và `google-auth-library` đã chốt ở `architecture.md §5`, nhưng `pnpm add` cần A cho phép (§6 `permissions.ask`); thêm `@types/nodemailer` (dev) | Cho phép `pnpm add --filter @realestate/identity` các gói trên, **ghim phiên bản chính xác**, ưu tiên bản ≥ 2 tuần tuổi (nodemailer `10.6.0` mới 5 ngày → dùng `10.3.1`; `google-auth-library` chốt khi cài) |
| Q2 | **Hình dạng `UserDto`.** `API_Spec §1.11` nói T2.5 thêm `status`; thiết kế **không ghi** route 15 (`PATCH /users/me`) trả gì và `phone` có nằm trong `UserDto` không | Thêm `status` và `phone` (null khi chưa khai) vào `UserDto`, dùng chung cho `/auth/me`, `PATCH /users/me`, danh sách quản trị. Nếu A đồng ý: sửa `API_Spec` + `CHANGELOG.md` v2.3 **trước** code |
| Q3 | **`GOOGLE_CLIENT_ID` trống** (thiết kế chỉ ghi "bắt buộc khi bật đăng nhập Google") | Biến tùy chọn; trống → route 14 trả `503 DEPENDENCY_UNAVAILABLE` (dùng mã chung có sẵn, không thêm mã mới), service vẫn khởi động. Thay vì bắt buộc, vì dev, CI, Postman không cần Google |
| Q4 | **Backfill `email_verified_at`.** Migration thêm cột `NULL` cho tài khoản có sẵn (mặc định `ACTIVE`): sau khi bị khóa rồi mở khóa sẽ về `PENDING_VERIFICATION` (cùng hiểm họa tech-debt #16) | Trong migration: `UPDATE users SET email_verified_at = created_at WHERE status = 'ACTIVE'`. Dữ liệu thôi, không đổi luật |
| Q5 | **Chống dò email bằng độ trễ.** `resend-otp`, `forgot-password` luôn `202` nhưng gửi mail chỉ khi có tài khoản → độ trễ lộ ra | Hai route này **không `await`** việc gửi mail (`void send().catch(log warn)`); `register` thì `await` (cần `201` sau khi mail đã giao cho SMTP để test, UX) với timeout SMTP 5 giây |
| Q6 | **Bước 7 (cập nhật gateway) không còn việc.** `routes.ts` dòng `/api/v1/auth/*` (public), `/users/me/*` (khớp cả `/users/me`), `/admin/users/*` đã phủ route 10–16; `route-resolver.spec.ts` đã có `verify-otp`, `PATCH /users/me`, `lock`, `unlock` | Không sửa gateway; chạy lại test gateway làm bằng chứng. `RE.GATEWAY §3` dòng 1–3 đã đúng. Báo A nếu muốn khác |

Mặc định của tôi nếu A không nói gì: theo đề xuất ở cột phải, và **dừng** nếu A không cho phép Q1.

### B. File sẽ tạo / sửa

**Hạ tầng, cấu hình (không cần test riêng)**

| File | Việc |
|---|---|
| `infra/compose/docker-compose.yml` | Thêm `mailpit` (image ghim phiên bản, profile `dev` và `demo`, cổng `127.0.0.1:1025`, `127.0.0.1:8025`); `identity` thêm `SMTP_*`, `MAIL_FROM`, `OTP_*`, `PASSWORD_RESET_*`, `GOOGLE_CLIENT_ID`, `depends_on: mailpit` |
| `.env.example` (gốc), `services/identity/.env.example` | Thêm biến mới, giá trị dev vô hại, `GOOGLE_CLIENT_ID` để trống |
| `services/identity/src/config/env.validation.ts` (+ `env.validation.spec.ts`) | `EnvVars` và `envSchema`: `SMTP_HOST/PORT/USER/PASSWORD`, `MAIL_FROM`, `OTP_TTL_SECONDS` (300), `OTP_MAX_ATTEMPTS` (5), `OTP_RESEND_COOLDOWN_SECONDS` (60), `PASSWORD_RESET_TTL_SECONDS` (900), `PASSWORD_RESET_URL`, `GOOGLE_CLIENT_ID?` |
| `services/identity/src/identity/config/identity.env.ts` (+ spec) | `SMTP_HOST`, `MAIL_FROM` bắt buộc cho identity (thiếu → in danh sách rồi dừng) |
| `services/identity/package.json`, `pnpm-lock.yaml` | Sau khi A cho phép Q1 |

**Dữ liệu**

| File | Việc |
|---|---|
| `src/database/migrations/1732000000002-add-user-account-columns.ts` | `phone`, `status` (CHECK), `email_verified_at`, `locked_at`, `locked_by`, `lock_reason`, `UQ_users_phone`; backfill Q4. Không sửa migration đã merge. Có `down` |
| `src/identity/entities/user.entity.ts` | Thêm `USER_STATUSES`, `UserStatus`, các cột mới |
| `src/identity/seed/seed-users.ts`, `seed-admin.ts` (+ spec, infra-spec) | Ghi `status='ACTIVE'`, `email_verified_at=now()` (tech-debt #16); chạy lại vẫn không đổi dữ liệu có sẵn |

**Nghiệp vụ (mỗi file `.service.ts` có `.spec.ts` cạnh nó)**

| File | Việc |
|---|---|
| `services/mail.service.ts` | nodemailer, timeout 5 giây; `sendOtp`, `sendPasswordReset`; **không log** OTP, link, token |
| `services/email-verification.service.ts` | `issue` (OTP 6 số `crypto.randomInt`, lưu Redis `{otpHash, attempts}` TTL, cooldown), `verify` (tăng `attempts` bằng `HINCRBY` nguyên tử **trước** khi so → hai request song song không né được giới hạn; so `timingSafeEqual`; lần thứ 5 sai xóa mã), `resend` |
| `services/password-reset.service.ts` | `request` (luôn xong êm; user có và không `LOCKED` mới sinh token 32 byte, lưu `sha256`), `reset` (`GETDEL`, cập nhật `password_hash`, `revokeAllForUser`) |
| `services/google-auth.service.ts`, `services/google-id-token.verifier.ts` | Verifier bọc `OAuth2Client.verifyIdToken` (provider `GOOGLE_ID_TOKEN_VERIFIER` để test thay); luồng 8 bước ở `API_Spec §1.8`; Google không tải được JWKS → `503` |
| `services/auth.service.ts` (+ spec) | `register` ghi `status`, `phone`, bắt `23505` theo tên constraint (`email` → `409 IDENTITY_EMAIL_TAKEN`, `phone` → `409 IDENTITY_PHONE_TAKEN`), kiểm Redis sống **trước khi ghi DB**, sau commit gọi `EmailVerificationService.issue` + gửi mail (lỗi mail: `201`, log `warn`); `login` kiểm trạng thái **sau** mật khẩu; `verifyOtp` = `verify` + `issueSession`. AuthService phụ thuộc `EmailVerificationService` (không vòng) |
| `services/user-admin.service.ts` (+ spec) | `lock(adminId, userId, reason)`, `unlock(userId)`: một câu `UPDATE ... WHERE status <> 'LOCKED'`, idempotent, rồi `revokeAllForUser`; mở khóa về `ACTIVE` nếu `email_verified_at` có, ngược lại `PENDING_VERIFICATION` (một `UPDATE ... CASE`) |
| `services/profile.service.ts` hoặc thêm vào `AuthService` | `PATCH /users/me`: `fullName`, `phone` (`null` xóa), `409 IDENTITY_PHONE_TAKEN`. Đặt theo `Component_Class_Design §1` (`profile.controller.ts`); chốt chỗ đặt logic khi viết (nghiêng về `UserProfileService` nhỏ để `AuthService` không phình) |

**API (controller + DTO, kiểm bằng infra/e2e)**

| File | Việc |
|---|---|
| `controllers/auth.controller.ts` | `verify-otp` (200), `resend-otp` (202), `forgot-password` (202), `reset-password` (204), `google` (200); đều `@Public()` |
| `controllers/profile.controller.ts` | `PATCH /users/me` |
| `controllers/users.admin.controller.ts` | `POST :id/lock` (body `{reason}`), `POST :id/unlock`; `@Roles('ADMIN')`, `:id` qua `createUuidParamPipe` |
| `dto/`: `verify-otp.dto`, `email-only.dto` (resend, forgot), `reset-password.dto`, `google-login.dto`, `update-profile.dto`, `lock-user.dto`; sửa `register.dto` (`phone?` `^0\d{9}$`), `user.dto` (Q2) | Có spec cho DTO có quy tắc (phone, reason ≤ 500, mật khẩu mới theo `register.dto`) |
| `errors/identity.errors.ts` | Thêm đúng 9 mã trong catalog `API_Spec §4` (`PHONE_TAKEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED`, `OTP_INVALID`, `OTP_RESEND_TOO_SOON`, `RESET_TOKEN_INVALID`, `GOOGLE_TOKEN_INVALID`, `ROLE_REQUIRED`, `CANNOT_LOCK_SELF`) + `USER_NOT_FOUND`; không thêm mã khác |
| `identity.module.ts` | Đăng ký provider, controller mới |

**Tài liệu**

`guides/RE_Identity_Code_Walkthrough.md` (cập nhật), `guides/RE_Docker_Local_Guide.md` (Mailpit), `services/identity/README.md`, `services/identity/openapi.json` (sinh lại), `RE.IDENTITY/CHANGELOG.md` + `API_Spec.md` nếu Q2 được duyệt (v2.3), tech-debt #16 → resolved.

### C. Test (bám `Component_Class_Design §5`; hạ tầng thật gồm Postgres, Redis, Mailpit)

| Tầng | Test |
|---|---|
| `test` (unit) | `mail.service`, `email-verification.service` (hash OTP, hết hạn, 5 lần, cooldown, song song), `password-reset.service`, `google-auth.service` (8 nhánh với verifier giả), `user-admin.service` (lock/unlock, tự khóa, idempotent), `auth.service` (thứ tự kiểm login, bắt constraint), DTO, `env.validation`/`identity.env` |
| `test:infra` | **13** đăng ký → `PENDING_VERIFICATION`, Mailpit nhận **một** email OTP; **14** login chưa xác minh/bị khóa `403`, sai mật khẩu `401`; **15** OTP đúng → `ACTIVE` + token; **16** sai 5 lần, mã đúng sau đó `400`; **17** resend < 60 giây → `429`; **18** forgot email lạ `202`, không email; **19** reset: lần 1 `204` + refresh cũ `401`, lần 2 `400`; **20, 21** Google (verifier giả); **22** khóa: refresh cũ `401`, login `403`, khóa lần hai `200`; **22a** mở khóa về đúng trạng thái; **23** `phone` trùng `409`. Thêm: `UQ_users_phone` thật, hai `verify-otp` song song, `identity.registered` khớp contract, seed #16. Các test cũ (`auth.infra-spec`, `admin-users`, `bank-account`, `internal-users`) phải **sửa**: đăng ký xong phải qua OTP (helper đọc OTP từ Mailpit `GET :8025/api/v1/messages`) hoặc dựng user `ACTIVE` bằng SQL |
| `test:e2e` | Không đổi hành vi hạ tầng; chạy lại, sửa nếu `UserDto` đổi (Q2) |
| gateway | `pnpm --filter @realestate/api-gateway test` chạy lại, không sửa (Q6) |

### D. Số truy vấn DB dự kiến (đếm bằng log SQL trước khi xong)

| Endpoint | Truy vấn | Ngưỡng |
|---|---|---|
| register | 2 (INSERT users + outbox, một transaction) | ≤ 6 |
| login | 1 | ≤ 6 |
| verify-otp | 2 (SELECT user, UPDATE) | ≤ 6 |
| resend-otp, forgot-password | 1 | ≤ 6 |
| reset-password | 1 (UPDATE; userId lấy từ token Redis) | ≤ 6 |
| google (tài khoản mới) | 5 (SELECT identity, SELECT email, INSERT users, INSERT identity, INSERT outbox) | ≤ 6 |
| google (liên kết) | 3 | ≤ 6 |
| lock / unlock | 1–2 (UPDATE, SELECT khi 0 dòng để phân biệt `404` với "đã khóa") | ≤ 6 |
| PATCH /users/me | 1–2 | ≤ 6 |

Không vòng lặp truy vấn. Không giữ transaction khi gọi SMTP, Google, Redis. Không đạt ngưỡng nào → dừng, báo A.

### E. Thứ tự làm (mỗi bước: RED → GREEN → REFACTOR, `progress-tracker` sau mỗi bước)

1. Q1–Q6 được A trả lời; (Q2 duyệt) sửa tài liệu thiết kế + CHANGELOG trước code.
2. Cấu hình, Mailpit, dependency (`env.validation`).
3. Migration, entity, seed (#16), `UserDto`.
4. `MailService`.
5. `EmailVerificationService` + `register`/`login`/`verify-otp`/`resend-otp`; sửa test cũ.
6. `PasswordResetService`.
7. `GoogleAuthService`.
8. Khóa/mở khóa, `PATCH /users/me`.
9. Kiểm chứng: toàn bộ test, lint, format, build, contracts, gateway, compose `apps` + Mailpit, đếm truy vấn.
10. Walkthrough, tài liệu, `code-review`, báo A xem diff, rồi commit/PR (không tự commit).

## Sửa sau review (2026-11-20)

> A duyệt 2026-11-20 (trả lời "ok" cho đề xuất sửa). Chỉ sửa hai lỗi dưới; **không** thêm kiểm `LOCKED` ở `refresh` (đổi hành vi code đã merge, chờ A quyết riêng).

| # | Lỗi | File sửa | Test (RED trước) |
|---|---|---|---|
| R1 | `PATCH /users/me` `{"fullName": null}` lọt `@IsOptional()`, ghi `full_name = NULL` vào cột `NOT NULL` → `500 INTERNAL_ERROR` | `dto/update-profile.dto.ts`: `fullName` dùng `@ValidateIf(v !== undefined)` thay `@IsOptional()` (`phone` giữ `@IsOptional()`, `null` vẫn là xóa số) | `dto/account-dtos.spec.ts`, `test/account.infra-spec.ts` (test 23a) |
| R2 | Google: email đã có tài khoản liên kết với `sub` Google khác → `UQ_user_identities_user_provider`, thử lại một lần vẫn trùng → ném lỗi gốc → `500` | `services/google-auth.service.ts` (`resolveUser`): lần thử lại vẫn trùng `UQ_user_identities_user_provider` → `401 IDENTITY_GOOGLE_TOKEN_INVALID`. Chỉ ở lần thử lại, vì đua cùng `sub` có thể báo chỉ mục này ở lần đầu | `services/google-auth.service.spec.ts`, `test/google.infra-spec.ts` (test 21a) |

Thiết kế sửa trước code: `API_Spec §1.8` (dòng 4a), `§1.10` (`fullName: null`), `Processing_Flow §3c`, `Component_Class_Design §5` (21a, 23a), `CHANGELOG` v2.4. Không mã lỗi mới, không đổi `contracts/`. Số truy vấn: R2 nhánh lỗi tối đa 6 (SELECT liên kết, SELECT email, INSERT lỗi, lặp lại 3) = ngưỡng ghi 6, chỉ ở nhánh lỗi hiếm; R1 không đổi (lỗi 400 trước DB).

- [x] R0. Thiết kế v2.4 (`API_Spec`, `Processing_Flow`, `Component_Class_Design`, `CHANGELOG`)
- [x] R1. `fullName: null` → 400: RED (`account-dtos.spec` 1 fail) → GREEN
- [x] R2. Google `sub` khác → 401: RED (`google-auth.service.spec` nhận `23505`) → GREEN
- [x] R3a. Unit 357 (354 + 3 mới): 350 PASS; 7 fail chỉ ở `env.bootstrap.spec` do bản sao Linux (ts-node con báo `fileExists` undefined; đã fail y hệt TRƯỚC khi sửa, không liên quan). `tsc --noEmit` (gồm `test/`), `nest build`, eslint, prettier các file đã sửa: sạch. Walkthrough cập nhật
- [x] R3b. (2026-11-21) Chạy trong workspace đám mây của Claude (Postgres 16.x không PostGIS, Redis, RabbitMQ 3.12.1 + `definitions.json`, Mailpit v1.32.0; vì Postgres trên máy A ngắt kết nối, xem dưới): identity `test` 357/357, `test:e2e` 97/97, `test:infra` 201/201; template unit 101 + e2e 111; gateway unit 239 + e2e 137; `pnpm lint`, `format:check`, `contracts:check` (4 spec OK), `build` sạch. Infra RED khi bỏ sửa: 23a nhận `500`, 21a nhận `500`. Lượt chạy đầu có 1 fail chập chờn ở `password-reset.infra-spec` (test 18 chờ 1 thư, thư OTP đăng ký tới trước thư đặt lại) → sửa chờ 2 thư như các test khác cùng file, chạy lại 3 lần + cả bộ đều xanh. Yêu cầu ban đầu: `pnpm --filter @realestate/identity test`, `test:e2e`, `test:infra` (test 21a, 23a mới chưa chạy với Postgres/Redis thật); `pnpm lint`, `format:check`, `contracts:check`. PASS hết mới trả `status: done`
  - 17:50 A chạy `test:infra`: 176 fail / 25 pass / 201. Mọi suite chạm Postgres lỗi `Connection terminated unexpectedly` ngay từ test đầu (kể cả suite không đổi: `seed-admin`, `admin-users`); hai suite chỉ dùng Redis (`otp.store`, `refresh-token.store`) PASS; `afterAll` vỡ theo (`redis` undefined, hook 30 giây). Đang ở `debug` Bước 1 (thu thập trạng thái `re-postgres`, log, cổng 5433), **chưa kết luận nguyên nhân**
  - Thu thập lần 1 (17:52): `re-postgres` Up 48 phút (healthy), `127.0.0.1:5433->5432`. Log: hoạt động bình thường tới 10:01:58 UTC (17:01, lỗi 23505 do test cố ý); 10:03:58 UTC khởi động lại sau khi **tắt không sạch** ("not properly shut down; automatic recovery"), 10:04:00 sẵn sàng. Sau đó **không có dòng log nào** dù lần `test:infra` ~17:48 (10:48 UTC) lẽ ra sinh lỗi 23505 cố ý → truy vấn của test có vẻ không tới tiến trình Postgres này. Còn thiếu: `pg_isready`, `netstat :5433`, probe node, chạy một suite

## Blockers / Ghi chú

- **Hoàn tất 2026-11-20.** Chưa commit: chờ A xem `git diff` (CLAUDE.md §6: `git commit` cần xác nhận).
- `code-review` 5 chiều: không CRITICAL. Một MAJOR (Reuse) đã sửa: `test/helpers/create-test-app.ts` thêm `overrides` ở identity thì phải sửa `_template-nest` trước (ADR-0014) → đã chép cùng bản vào template (template test 101, e2e 111 PASS). PR chạm `services/_template-nest/` nên A duyệt. Một MINOR đã sửa (assertion vô nghĩa ở `password-reset.infra-spec`).
- Lệch với kế hoạch đã duyệt: (1) thêm `services/profile.service.ts`, `google-id-token.verifier.ts`, `user-email.query.ts`, `unique-violation.ts`, `stores/otp.store.ts` + `redis-otp.store.ts` (đã ghi `Component_Class_Design` v2.3 các file đầu; ba file sau là chi tiết cài đặt, ghi ở walkthrough); (2) `GOOGLE_CLIENT_ID` trống test ở file riêng (ConfigModule chốt env lúc import).
- Việc A cần làm trên máy: `services/identity/.env` (không commit) cần thêm `SMTP_HOST=localhost`, `MAIL_FROM=no-reply@realestate.local` (chép từ `.env.example`) thì `pnpm dev`/`openapi:export` mới chạy; compose `apps` không cần. DB dev đã chạy migration `1732000000002`; có vài user `smoke*@example.com` do kiểm chứng.
- Nợ kỹ thuật mới: #17 (C21), #18 (test flaky), #19 (infra test viết sau code); #16 resolved.

- Chờ A duyệt kế hoạch và trả lời Q1–Q6 (Q1 chặn bước 2).
- Không chạm: `contracts/`, listing, gateway (Q6). (`_template-nest/test/helpers/create-test-app.ts` **có** sửa sau `code-review`, ADR-0014, A duyệt ở PR.)
- Ngoài phạm vi: tech-debt #10 (map `23503`) chỉ có nghĩa khi có API xóa người dùng; T2.5 không xóa người dùng nên giữ `open`.
- Không phụ thuộc chặn: T2.1 đã xong (`revokeAllForUser`); `van-de-can-quyet-dinh.md` không còn `[cần xác nhận]` mở cho identity T2.5.
