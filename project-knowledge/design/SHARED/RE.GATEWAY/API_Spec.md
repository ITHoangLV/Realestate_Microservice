# RE.GATEWAY — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.GATEWAY` — điểm vào duy nhất |
| **Service** | `api-gateway` (cổng 8080), dựng từ `_template-nest` |
| **Quy tắc** | NFR03, NFR06; không chứa `BR-xx` |
| **Quyết định** | ADR-0003 |
| **CSDL** | Không. Redis cho rate limit `[cần xác nhận]` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Việc gateway làm và không làm

| Làm | Không làm |
|---|---|
| Định tuyến theo bảng §3 (một file cấu hình) | Kiểm chủ sở hữu tài nguyên |
| Kiểm JWT RS256 (chữ ký, hạn, `iss`) bằng khóa công khai | Gọi identity để xác thực |
| Kiểm vai trò mức tuyến | Gộp dữ liệu nhiều service |
| Sinh `X-Request-ID` nếu thiếu, chuyển tiếp | Retry (không biết lệnh có idempotent không) |
| CORS cho giao diện Next.js | Đọc database |
| Rate limit theo IP và người dùng | Luật nghiệp vụ |
| `404` cho mọi `/internal/*` | |
| Mở công khai đường dẫn webhook payOS | Kiểm chữ ký webhook (payment làm) |

## 2. Mức truy cập

| Mức | Điều kiện |
|---|---|
| `public` | Không cần token |
| `user` | Token hợp lệ, vai trò bất kỳ |
| `tenant` | `TENANT` |
| `landlord` | `LANDLORD` |
| `admin` | `ADMIN` |
| `payos` | Không cần token; payment kiểm chữ ký |

Gateway chỉ kiểm thô. Service kiểm lại vai trò và chủ sở hữu.

## 3. Bảng định tuyến

Đường dẫn chốt 2026-11-12 (A6), chi tiết ở `API_Spec.md` của chức năng.

| # | Tiền tố | Service đích | Mức mặc định | Thiết kế |
|---|---|---|---|---|
| 1 | `/api/v1/auth/*` | identity | `public` (`/me`: `user`); gồm OTP, quên mật khẩu, Google | `RE.IDENTITY` |
| 2 | `/api/v1/users/me`, `/api/v1/users/me/*` | identity | `user` | `RE.IDENTITY` |
| 3 | `/api/v1/admin/users/*` | identity | `admin` | `RE.IDENTITY` |
| 4 | `GET /api/v1/listings`, `GET /api/v1/listings/:id` | listing | `public` | `RE.LISTING` |
| 5 | `/api/v1/listings/*` (còn lại) | listing | `landlord` | `RE.LISTING` |
| 6 | `/api/v1/admin/listings/*` | listing | `admin` | `RE.LISTING` |
| 7 | `/api/v1/viewings/*` | rental | `user` | `RE.VIEWING` |
| 8 | `/api/v1/deposits/*` | rental | `user` | `RE.DEPOSIT_SAGA`, `RE.DEPOSIT_LIFECYCLE` |
| 9 | `/api/v1/admin/deposits/*` | rental | `admin` | `RE.DEPOSIT_LIFECYCLE` |
| 10 | `POST /api/v1/payments/payos/webhook` | payment | `payos` | `RE.PAYMENT` |
| 11 | `/api/v1/payments/*` (còn lại) | payment | `user` | `RE.PAYOUT` |
| 12 | `/api/v1/withdrawals/*` | payment | `landlord` | `RE.PAYOUT` |
| 13 | `/api/v1/admin/withdrawals/*`, `/api/v1/admin/refund-requests/*`, `/api/v1/admin/wallet`, `/api/v1/admin/audit-logs` | payment | `admin` | `RE.PAYOUT` |
| 14 | `/api/v1/notifications/*` | notification | `user` | `RE.NOTIFICATION` |
| 15 | `/api/v1/conversations/*` | notification | `user` | `RE.CHAT` |
| 16 | WebSocket `/ws` | notification | `user` | `RE.CHAT` |
| 17 | `/internal/*` | — | trả `404` | |
| 18 | `GET /health` | chính gateway | `public` | |

Mức chi tiết từng route (ví dụ route chỉ `tenant` trong `/api/v1/deposits/*`) do service kiểm bằng `@Roles`.

## 4. Mã lỗi của gateway

| Mã | HTTP | Khi nào | Nguồn |
|---|---|---|---|
| `AUTH_TOKEN_MISSING` | 401 | Route cần token mà thiếu | Code (template) |
| `AUTH_TOKEN_INVALID` | 401 | Sai chữ ký, sai `iss` | Code |
| `AUTH_TOKEN_EXPIRED` | 401 | Hết hạn | Code |
| `FORBIDDEN_ROLE` | 403 | Sai vai trò mức tuyến | Code |
| `GATEWAY_ROUTE_NOT_FOUND` | 404 | Không khớp bảng §3, gồm `/internal/*` | Đề xuất |
| `TOO_MANY_REQUESTS` | 429 | Vượt rate limit | Code |
| `UPSTREAM_UNAVAILABLE` | 503 | Service đích không kết nối được | Code |
| `UPSTREAM_TIMEOUT` | 504 | Service đích quá `GATEWAY_PROXY_TIMEOUT_MS` | Code |

Lỗi `4xx`/`5xx` của service đích chuyển nguyên về client.

## 5. Biến môi trường

| Biến | Mặc định dev | Ý nghĩa |
|---|---|---|
| `PORT` | `8080` | |
| `SERVICE_NAME` | `api-gateway` | |
| `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER` | `./secrets/jwt-public.pem`, `realestate-identity` | |
| `INTERNAL_IDENTITY_URL` … `INTERNAL_NOTIFICATION_URL` | `http://<service>:<cổng>` | Đích proxy |
| `GATEWAY_PROXY_TIMEOUT_MS` | `[cần xác nhận]`, phải > 8.000 (NFR07) | Đề xuất tên biến |
| `RATE_LIMIT_TTL_SECONDS`, `RATE_LIMIT_IP`, `RATE_LIMIT_USER` | `[cần xác nhận]` | Đề xuất tên biến |
| `CORS_ORIGINS` | `http://localhost:3000` `[cần xác nhận]` | Giao diện Next.js |

## 6. Điểm [cần xác nhận]

1. Thư viện proxy (ví dụ `http-proxy-middleware`) và cách giữ body thô cho webhook payOS (chữ ký tính trên body).
2. Timeout proxy, ngưỡng rate limit, nơi lưu bộ đếm (bộ nhớ hay Redis).
3. Cách gateway chuyển tiếp nâng cấp kết nối WebSocket.
4. `/health/services` tổng hợp trạng thái các service có cần không.
