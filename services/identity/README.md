# @realestate/identity

Identity-service: đăng ký, đăng nhập và phát hành JWT cho cả hệ thống. Cổng **3001**, DB `identity_db`.
Dựng từ `services/_template-nest` nên dùng chung log JSON, correlation ID, định dạng lỗi, health
check và outbox (đọc README của template cho các phần đó).

## Chức năng

| Endpoint (`/api/v1/auth`) | Công khai | Mô tả                                                                                                                       |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST /register`          | có        | Đăng ký, chỉ `TENANT` hoặc `LANDLORD`. Email trùng: 409 `IDENTITY_EMAIL_TAKEN`                                              |
| `POST /login`             | có        | Trả `accessToken` (15 phút) và `refreshToken` (7 ngày). Sai email hay sai mật khẩu: cùng 401 `IDENTITY_INVALID_CREDENTIALS` |
| `POST /refresh`           | có        | Đổi refresh token lấy cặp mới. Token cũ chỉ dùng được một lần. Lỗi: 401 `IDENTITY_INVALID_REFRESH_TOKEN`                    |
| `POST /logout`            | có        | Thu hồi cả họ refresh token của phiên này. Luôn 204                                                                         |
| `GET /me`                 | không     | Thông tin người đang đăng nhập (cần `Authorization: Bearer <accessToken>`)                                                  |

Tài khoản `ADMIN` **không** đăng ký qua API; tạo bằng script seed (bên dưới).
Swagger: `http://localhost:3001/api/docs`.

## Định dạng response

Mọi response theo khung chung của template (xem README template, mục 2.1):

```jsonc
// POST /api/v1/auth/login → 200
{ "data": { "accessToken": "…", "refreshToken": "…", "tokenType": "Bearer", "expiresIn": 900 },
  "meta": { "correlationId": "abc-123", "timestamp": "2026-11-06T10:00:00.000Z" } }

// lỗi → 401
{ "error": { "code": "IDENTITY_INVALID_CREDENTIALS", "message": "Email hoặc mật khẩu không đúng" },
  "meta": { "correlationId": "abc-123", "timestamp": "2026-11-06T10:00:00.000Z" } }
```

`POST /logout` trả 204 không có body; `/health` giữ body phẳng.

## Cấu trúc thư mục

Code nghiệp vụ nằm trong `src/identity/`, chia theo vai trò của file:

```text
src/identity/
  identity.module.ts           ghép các phần bên dưới thành module
  controllers/                 nhận request HTTP, gọi service (auth.controller.ts)
  services/                    logic: auth.service (luồng), password.service (argon2id), token.service (JWT)
  stores/                      lưu refresh token: interface + cài đặt Redis (Lua)
  dto/                         dữ liệu vào/ra của API, có validate
  entities/                    bảng DB: users, user_identities
  errors/                      mã lỗi nghiệp vụ IDENTITY_*
  config/                      kiểm tra biến môi trường bắt buộc của identity
  seed/                        tạo tài khoản ADMIN
```

File test `*.spec.ts` nằm cạnh file được test. Phần dùng chung của template giữ nguyên:
`src/common/` (auth, lỗi, log), `src/messaging/` (outbox, inbox), `src/database/` (migration), `src/health/`.

## Thiết kế

### Hai loại token

|                            | Access token                                    | Refresh token                        |
| -------------------------- | ----------------------------------------------- | ------------------------------------ |
| Dạng                       | JWT RS256 (`sub`, `roles`, `iss`, `exp`, `jti`) | 32 byte ngẫu nhiên, base64url        |
| Lưu ở server               | Không                                           | Redis, chỉ lưu **SHA-256** của token |
| Service khác kiểm tra bằng | Khóa công khai, không hỏi identity              | Chỉ identity dùng                    |
| Thu hồi trước hạn          | Không (vì thế chỉ sống 15 phút)                 | Có                                   |

Identity ký bằng **khóa riêng**; mọi service khác chỉ cần **khóa công khai** (`JWT_PUBLIC_KEY_PATH`).

### Xoay vòng refresh token

Mỗi lần đăng nhập tạo một "họ" (`familyId`). Mỗi lần refresh: token cũ bị đánh dấu đã dùng, token mới
cùng họ được cấp. Nếu token đã dùng bị gửi lại (nghi bị đánh cắp), **cả họ bị thu hồi** và người
dùng phải đăng nhập lại. Việc đổi chạy trong một script Lua của Redis để hai request đồng thời cùng
token không thể cùng thành công.

```text
Redis  identity:rt:<sha256(token)>   hash {userId, familyId, used}   TTL 7 ngày
       identity:revoked:<familyId>   "1" khi cả họ bị thu hồi        TTL 7 ngày
```

Redis sập thì đăng nhập/refresh trả 503; các service khác vẫn kiểm tra được access token đang có.
Lớp lưu trữ nằm sau interface `RefreshTokenStore`, đổi sang nơi khác chỉ cần cài đặt mới.

### Đăng ký và event

`INSERT users` và ghi event `identity.registered` vào outbox nằm **cùng một transaction**; relay gửi
lên RabbitMQ (exchange `domain.events`) sau khi commit. Trùng email được phát hiện bằng ràng buộc
duy nhất `lower(email)` của DB, nên hai request đăng ký đồng thời vẫn chỉ một cái thành công.
Identity **chỉ publish, không consume** (`RABBITMQ_QUEUE` để trống).

### Chuẩn bị cho đăng nhập Google

Bảng `user_identities` (`provider`, `provider_user_id` duy nhất) và `users.password_hash` cho phép
rỗng đã có sẵn. Khi thêm Google chỉ cần một endpoint xác minh ID token của Google rồi gọi
`AuthService.issueSession(user)`; refresh, logout và `/me` không đổi.

## Chạy

Yêu cầu: hạ tầng đang chạy (`pnpm infra:up` ở gốc repo).

```powershell
pnpm keys:generate                                   # gốc repo, một lần: tạo secrets/jwt-*.pem
cd services/identity
Copy-Item .env.example .env                          # hoặc để pnpm dev tự tạo
pnpm migration:run                                   # tạo bảng users, user_identities, outbox_events...
pnpm dev                                             # http://localhost:3001
```

Thiếu DB, Redis, RabbitMQ hoặc khóa JWT thì service in danh sách thứ thiếu rồi thoát mã 1.

### Tạo tài khoản ADMIN

```powershell
$env:SEED_ADMIN_EMAIL='admin@example.com'
$env:SEED_ADMIN_PASSWORD='mat-khau-dai-it-nhat-12'   # tối thiểu 12 ký tự, KHÔNG ghi vào .env
pnpm seed:admin                                      # production sau build: node dist/scripts/seed-admin.js
```

Chạy lại an toàn: email đã là ADMIN thì không đổi gì; email đã là người dùng thường thì bị từ chối
(không tự nâng quyền).

### Biến môi trường riêng của identity

| Biến                                       | Mặc định               | Ý nghĩa                                                                                            |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PRIVATE_KEY` | bắt buộc một trong hai | Khóa riêng RS256 để ký (đường dẫn tính từ `services/identity`, hoặc PEM với `\n`)                  |
| `JWT_PUBLIC_KEY_PATH` / `JWT_PUBLIC_KEY`   | bắt buộc một trong hai | Khóa công khai để kiểm tra token ở `/me`                                                           |
| `JWT_ISSUER`                               | bắt buộc               | Ghi vào token và được kiểm tra khi verify                                                          |
| `JWT_ACCESS_TTL_SECONDS`                   | 900                    | Thời hạn access token                                                                              |
| `JWT_REFRESH_TTL_SECONDS`                  | 604800                 | Thời hạn refresh token                                                                             |
| `BANK_ACCOUNT_ENCRYPTION_KEY`              | bắt buộc               | Khóa AES-256-GCM mã hóa số tài khoản nhận tiền: base64 của đúng 32 byte (sinh: xem `.env.example`) |
| `REDIS_URL`                                | bắt buộc               | Nơi lưu refresh token                                                                              |
| `REFRESH_TOKEN_REDIS_PREFIX`               | `identity:`            | Tiền tố key Redis                                                                                  |
| `OUTBOX_RELAY_ENABLED`                     | `true`                 | `false`: ghi outbox nhưng không gửi (dùng khi test)                                                |

## Test

```powershell
pnpm test          # unit (không cần hạ tầng)
pnpm test:e2e      # e2e hạ tầng chung của template, không cần DB/Redis
pnpm test:infra    # cần hạ tầng đang chạy: Postgres + Redis + RabbitMQ thật
```

`test:infra` dùng schema Postgres, tiền tố key Redis và khóa RSA riêng của test (xóa sau khi chạy),
tắt relay để không đẩy event thử vào queue thật.

## Chưa làm (cố ý để sau)

Chống dò mật khẩu (rate limit), xác thực email, quên/đổi mật khẩu, đăng xuất mọi thiết bị,
đăng nhập Google, lưu refresh token trong cookie `HttpOnly` cho web.
