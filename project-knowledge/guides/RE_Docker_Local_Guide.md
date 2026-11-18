# Hướng dẫn chạy Docker trên máy

> Nguồn: README gốc, `infra/compose/docker-compose.yml`, `services/_template-nest/README.md §6`. Lệnh viết cho PowerShell; bash tương tự.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-18 (T1.3: profile `apps`) |

## 1. Yêu cầu

| Công cụ | Phiên bản |
|---|---|
| Node.js | 22 LTS (`.nvmrc`) |
| pnpm | ≥ 10 (`corepack enable`) |
| Docker Desktop | Compose v2 |

## 2. Lần đầu

```powershell
pnpm install
Copy-Item .env.example .env       # không commit .env
pnpm keys:generate                # secrets/jwt-private.pem, jwt-public.pem
pnpm infra:up                     # profile dev: Postgres+PostGIS, Redis, RabbitMQ, Silo
pnpm infra:check                  # OK/FAIL từng thành phần
pnpm contracts:check
```

`rabbitmq-init` chạy một lần, trạng thái đúng là `Exited (0)`.

## 3. Profile

| Profile | Gồm | Lệnh |
|---|---|---|
| `dev` | Postgres, Redis, RabbitMQ, S3 | `pnpm infra:up` |
| `demo` | `dev` + Elasticsearch, Kibana (`http://127.0.0.1:5601`) | `pnpm infra:demo` |
| `apps` | `identity`, `api-gateway` (thêm dần listing, rental, payment, notification) | Lệnh compose đầy đủ bên dưới; không có script `pnpm` riêng (chốt 2026-11-17) |

### 3.1 Chạy profile `apps`

Điều kiện trước khi `up` (làm một lần, hoặc khi đổi khóa/migration):

1. `secrets/jwt-private.pem`, `secrets/jwt-public.pem` có sẵn (`pnpm keys:generate`). Compose mount qua `secrets:` tại `/run/secrets/jwt_private_key` (chỉ identity) và `/run/secrets/jwt_public_key` (identity, gateway). Thiếu file thì `up` báo lỗi.
2. Hạ tầng đang chạy (`pnpm infra:up`) và migration đã chạy từ laptop: `pnpm --filter @realestate/identity migration:run` (service để `migrationsRun=false`).

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps ps   # re-identity, re-api-gateway: healthy
```

- Chỉ `api-gateway` publish `127.0.0.1:8080`; identity không publish cổng, chỉ gọi được qua gateway.
- Trong container, compose tự đặt `INTERNAL_*_URL` theo tên service (`http://identity:3001`…) và host hạ tầng (`postgres:5432`…); các biến `*_HOST`, `INTERNAL_*_URL`, `JWT_*_PATH` trong `.env` gốc chỉ dành cho tiến trình chạy trên laptop.
- Gateway khởi động sau khi identity `healthy` (healthcheck của ảnh chạy mỗi 30 giây, nên lần đầu có thể chờ tới ~30 giây).
- Gateway để `trust proxy=false`: mọi request ẩn danh từ laptop vào container mang IP của bridge, dùng chung một bộ đếm `RATE_LIMIT_IP` (100/60 giây). Đã chấp nhận (`RE.GATEWAY/Component_Class_Design.md §6`).

Kiểm chứng nhanh (đi qua gateway, cùng `X-Request-ID` ở hai log):

```powershell
curl.exe -i http://localhost:8080/health
curl.exe -i -X POST http://localhost:8080/api/v1/auth/register -H "Content-Type: application/json" -H "X-Request-ID: t13-trace-001" -d '{\"email\":\"t1@x.com\",\"password\":\"Matkhau@123\",\"fullName\":\"T1\",\"role\":\"TENANT\"}'
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile apps logs api-gateway identity | Select-String t13-trace-001
curl.exe -i http://localhost:8080/internal/users/x    # 404 GATEWAY_ROUTE_NOT_FOUND
```

## 4. Cổng

| Thành phần | Trên laptop | Trong Docker |
|---|---|---|
| api-gateway | `127.0.0.1:8080` | `api-gateway:8080` |
| identity, listing, rental, payment, notification | 3001–3005 khi chạy `pnpm dev` | `<service>:<cổng>`, **không** publish khi chạy trong Docker |
| Postgres | `localhost:5433` | `postgres:5432` |
| Redis | `localhost:6379` | `redis:6379` |
| RabbitMQ | `localhost:5672`, UI `15672` | `rabbitmq:5672` |
| S3 (Silo) | `localhost:9000`, console `9001` | `s3:9000`; `S3_PUBLIC_ENDPOINT=http://localhost:9000` |
| Mailpit (thêm ở T2.5) | SMTP `localhost:1025`, giao diện `8025` | `mailpit:1025`; xem email OTP, đặt lại mật khẩu |

Hạ tầng chỉ publish ra `127.0.0.1`.

## 5. Dữ liệu và seed

| Việc | Lệnh |
|---|---|
| Migration một service | `pnpm --filter @realestate/<service> migration:run` |
| Tạo ADMIN | `$env:SEED_ADMIN_EMAIL='admin@example.com'; $env:SEED_ADMIN_PASSWORD='<≥12 ký tự>'; pnpm --filter @realestate/identity seed:admin` |
| Seed tin đăng | T2.4: 30 tin Hà Nội, 3 chủ trọ, 5 người thuê. Id cố định: `[cần xác nhận]` khi viết script |

## 6. Đặt cọc thật với payOS thử nghiệm

1. Đặt `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (môi trường thử nghiệm) trong `.env`.
2. Mở đường hầm tới gateway: `ngrok http 8080` hoặc `cloudflared tunnel --url http://localhost:8080`.
3. Khai URL webhook `https://<đường-hầm>/api/v1/payments/payos/webhook` `[cần xác nhận]` trong trang quản trị payOS.
4. Demo hết hạn nhanh: `HOLD_TTL_SECONDS=60`.

## 7. Reset

```powershell
pnpm infra:down                                       # giữ volume; dừng cả profile demo và apps
docker volume rm realestate_postgres_data             # chạy lại script init DB (mất dữ liệu)
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile demo --profile apps down -v   # xóa mọi volume
```

Áp lại topology RabbitMQ: `docker start -a re-rabbitmq-init`. Đổi tham số queue đã có → xóa queue hoặc volume `realestate_rabbitmq_data`.

## 8. Dockerfile mỗi service

Build từ gốc repo: `docker build -f services/<service>/Dockerfile -t realestate/<service> .`. Ảnh 3 stage `node:22-alpine`, user `node`, `HEALTHCHECK` gọi `/health`, tắt gọn khi SIGTERM, không chứa `.env`.

## 9. Gỡ lỗi nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Service thoát ngay | Log in danh sách biến thiếu (`env.validation.ts`) |
| `503 AUTH_NOT_CONFIGURED` | Thiếu `JWT_PUBLIC_KEY_PATH` |
| `up` profile `apps` báo thiếu file secret | Chưa chạy `pnpm keys:generate` |
| Gateway trả `503 UPSTREAM_UNAVAILABLE` | Service đích chưa chạy hoặc chưa `healthy` (`docker compose ... ps`) |
| Đăng ký lỗi 500 ngay sau `up` | Chưa chạy `migration:run` của identity |
| `DEPENDENCY_UNAVAILABLE` | `pnpm infra:check`; trên laptop dùng cổng 5433 |
| Consumer không nhận | Queue có binding chưa (`definitions.json`), `RABBITMQ_URL` có `%2F` |
| Presigned URL không mở được | `S3_PUBLIC_ENDPOINT` |
| Webhook không tới | Đường hầm còn chạy, URL trong trang payOS đúng |
| Theo một request | Lọc log theo `correlationId` |

Xem thêm `standards/gotchas.md`.
