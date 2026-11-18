---
task: T1.3 Compose profile `apps`, identity sau gateway
created: 2026-11-17
status: in_progress
phase: implementation/PHASE-1.md#T1.3
---

## Mô tả

Thêm `api-gateway` và `identity` vào `infra/compose/docker-compose.yml` (profile `apps`): build từ Dockerfile từng service, mount khóa công khai JWT, `INTERNAL_*_URL` dùng tên service, chỉ gateway publish `127.0.0.1:8080`. Bổ sung biến của gateway vào `.env.example` gốc. Kiểm chứng đăng ký, đăng nhập, `/me` qua 8080 và cùng `X-Request-ID` ở log gateway và identity; đặt tag `v0.1-skeleton`.

## Thiết kế liên quan

- `design/SHARED/RE.GATEWAY/` v1.3 (biến môi trường, `trust proxy=false` `§6`)
- `guides/RE_Docker_Local_Guide.md §3–4, §8`; `services/_template-nest/README.md §4, §6` (mẫu compose)
- Không có thiết kế riêng cho compose. Không đổi `contracts/`, không migration mới (identity chạy migration có sẵn)

## Definition of Done

- [ ] Đăng ký, đăng nhập, `/me` qua `127.0.0.1:8080`
- [ ] Cùng `X-Request-ID` ở log gateway và identity (dán output)
- [ ] Chỉ gateway publish cổng (`127.0.0.1:8080`); identity không publish
- [ ] Đặt tag `v0.1-skeleton` (A tự chạy sau merge; xem `git-workflow.md §5`)
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi
- [ ] Lệnh "Kiểm chứng" của task chạy đúng (dán output)
- [ ] `docker compose ... config` hợp lệ; `.env.example` gốc có biến gateway; không secret thật vào repo

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế (2026-11-17)
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết, đã ghi file; 4 câu hỏi đã trả lời (**chờ user duyệt kế hoạch**)
- [ ] 3. Sửa `.env.example` gốc (biến gateway, `JWT_PUBLIC_KEY_PATH` cho container) + `docker-compose.yml` (profile `apps`)
- [ ] 4. Build ảnh, `up`, chạy lệnh kiểm chứng, so `X-Request-ID` ở hai log
- [ ] 5. Cập nhật `RE_Docker_Local_Guide.md §3–4` (bỏ `[cần xác nhận]`), walkthrough compose nếu cần
- [ ] 6. `code-review` 5 chiều, chuẩn bị PR vào `develop`

## Tái sử dụng

> Quét 2026-11-17 · Nguồn: `infra/compose/docker-compose.yml`, `services/api-gateway/{Dockerfile,.env.example}`, `services/identity/{Dockerfile,.env.example,src/config/env.validation.ts}`, `.env.example` gốc, `_template-nest/README.md §4, §6`
> Task này là cấu hình hạ tầng (YAML, `.env.example`, tài liệu): **không tạo thành phần dùng chung trong `src/`** nên không có `VIẾT MỚI`.

| Thành phần cần | Nhóm | Vị trí đã có / lý do |
|---|---|---|
| Mạng `realestate-net`, anchor `x-restart`, `name: realestate` | DÙNG LẠI | `docker-compose.yml` (đầu file, cuối file) |
| Mẫu khối service `identity` (build context, `profiles: [apps]`, `depends_on` theo healthcheck) | DÙNG LẠI | `_template-nest/README.md §6`; chỉnh: không publish cổng identity, thêm `RABBITMQ_URL` |
| Dockerfile 3 stage, `HEALTHCHECK` gọi `/health` theo `PORT` | DÙNG LẠI | `services/{api-gateway,identity}/Dockerfile` (không sửa; compose đặt `PORT`, `SERVICE_NAME`) |
| Biến của gateway (`GATEWAY_PROXY_TIMEOUT_MS`, `RATE_LIMIT_*`, `CORS_ORIGINS`) | DÙNG LẠI | `services/api-gateway/.env.example` (đã có, chỉ chép sang `.env.example` gốc) |
| Khóa JWT RS256 | DÙNG LẠI | `pnpm keys:generate` → `secrets/jwt-{private,public}.pem`; biến `JWT_PUBLIC_KEY_PATH`, `JWT_PRIVATE_KEY_PATH` đã được code đọc |
| Healthcheck container postgres/redis/rabbitmq | DÙNG LẠI | đã khai báo trong `docker-compose.yml` |
| Script chạy profile `apps` | KHÔNG TẠO (xem câu hỏi 3) | `package.json` chỉ có `infra:up|down|demo|check` |

## Kế hoạch chi tiết

**Playbook:** `tdd` bật (`warn`) nhưng hook chỉ áp cho `.ts` trong `services/*/src/`; task này không sửa `.ts`. "Test" là kiểm chứng chạy thật bên dưới. Không đổi `contracts/`, không migration, không thư viện mới. Số truy vấn DB: không thêm endpoint, không áp dụng.

### File sửa

| File | Việc |
|---|---|
| `infra/compose/docker-compose.yml` | (1) Cập nhật comment đầu file: thêm profile `apps`. (2) Thêm service `identity` (profile `apps`): `build.context: ../..`, `dockerfile: services/identity/Dockerfile`, `container_name: re-identity`, `PORT=3001`, `SERVICE_NAME=identity`, `DATABASE_URL=postgres://${IDENTITY_DB_USER}:${IDENTITY_DB_PASSWORD}@postgres:5432/${IDENTITY_DB_NAME}`, `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379`, `RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672/%2F`, `JWT_PUBLIC_KEY_PATH`/`JWT_PRIVATE_KEY_PATH` trỏ `/run/secrets/...`, `JWT_ISSUER`, `LOG_LEVEL`. **Không `ports:`** (không publish). `depends_on`: postgres, redis, rabbitmq `service_healthy`; `rabbitmq-init` `service_completed_successfully`. (3) Thêm service `api-gateway` (profile `apps`): `PORT=8080`, `SERVICE_NAME=api-gateway`, `JWT_PUBLIC_KEY_PATH` + `JWT_ISSUER` (chỉ khóa công khai), `INTERNAL_{IDENTITY,LISTING,RENTAL,PAYMENT,NOTIFICATION}_URL` = `http://<tên service>:<cổng>`, `GATEWAY_PROXY_TIMEOUT_MS`, `RATE_LIMIT_*`, `CORS_ORIGINS` (qua `${VAR:-mặc định}`); **`ports: ['127.0.0.1:${GATEWAY_PORT:-8080}:8080']`**; `depends_on: identity: service_healthy`. Không đặt `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`. (4) Khối `secrets:` cấp cao: `jwt_public_key` (file `../../secrets/jwt-public.pem`) cho cả hai service, `jwt_private_key` (file `../../secrets/jwt-private.pem`) **chỉ identity**. |
| `.env.example` gốc | Thêm mục "api-gateway": `GATEWAY_PROXY_TIMEOUT_MS=10000`, `RATE_LIMIT_TTL_SECONDS=60`, `RATE_LIMIT_IP=100`, `RATE_LIMIT_USER=300`, `CORS_ORIGINS=http://localhost:3000`, kèm chú thích tiếng Việt (giữ quy ước: không dấu cách/nháy trong giá trị). Không đổi các biến cũ. |
| `project-knowledge/guides/RE_Docker_Local_Guide.md` | §3: xóa `[cần xác nhận]` ở dòng `apps` (chốt theo câu hỏi 3), nêu điều kiện cần `pnpm keys:generate` và `migration:run` của identity trước khi `up`; §4: giữ bảng cổng (gateway publish, identity không); §7: lệnh `down` phải kèm `--profile apps`. |
| `project-knowledge/CLAUDE.md §2.5` | Chỉ nếu viết walkthrough mới (xem câu hỏi 4). |

### Quy trình làm và kiểm chứng (thứ tự)

1. Sửa `.env.example` gốc, rồi compose. Chạy `docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps config` (cú pháp hợp lệ, biến đã nội suy; **không dán** giá trị mật khẩu vào báo cáo).
2. Tiền điều kiện (user/tôi chạy, xin phép từng lệnh): `secrets/jwt-*.pem` có (`pnpm keys:generate`), `pnpm infra:up`, `pnpm --filter @realestate/identity migration:run` (host → `localhost:5433`; `migrationsRun=false`).
3. `docker compose ... --profile dev --profile apps up -d --build`; `docker compose ps` thấy `re-identity`, `re-api-gateway` `healthy`.
4. Lệnh kiểm chứng của task: `POST /api/v1/auth/register` qua 8080; thêm login và `GET /api/v1/auth/me` với access token; `GET /health` (gateway).
5. Cùng `X-Request-ID`: gửi `X-Request-ID: t13-trace-001`, rồi `docker compose logs api-gateway identity | grep t13-trace-001` thấy ở cả hai log.
6. Kiểm: `docker compose ps`/`docker port` chỉ gateway publish; `curl http://127.0.0.1:3001` từ host bị từ chối; `curl /internal/...` qua 8080 → 404.
7. `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check`.
8. Cập nhật tài liệu; `code-review` 5 chiều; PR vào `develop`.

### Rủi ro đã thấy
- Nếu `secrets/jwt-*.pem` thiếu: bind mount sẽ tạo thư mục rỗng thay file. Dùng `secrets:` cấp cao của compose để thiếu file thì `up` **lỗi rõ ràng**.
- Tag `v0.1-skeleton` gắn sau merge, bạn tự chạy (`git-workflow.md §5`); tôi không chạy.
- `trust proxy=false`: request ẩn danh từ host cùng một bộ đếm IP 100/60 giây trong Docker (đã chấp nhận).
- `pnpm infra:down` hiện chỉ `--profile demo`: sẽ không dừng container `apps` và có thể báo network còn dùng (xem câu hỏi 2).

### Quyết định của user (2026-11-17): chọn đúng 4 đề xuất

1. Khóa JWT: `secrets:` cấp cao của compose; identity nhận cả khóa riêng, gateway chỉ khóa công khai.
2. `pnpm infra:down`: **thêm `--profile apps`** (sửa một dòng `package.json`).
3. Không thêm script `apps:up`/`apps:down`; ghi lệnh compose đầy đủ vào guide, gỡ `[cần xác nhận]` ở §3.
4. Walkthrough: cập nhật `RE_Docker_Local_Guide.md`, không tạo file mới.

→ Thêm `package.json` (gốc, dòng `infra:down`) vào bảng "File sửa". **Chờ user nói "duyệt kế hoạch" để bắt đầu Bước 3.**

### Câu hỏi đã hỏi (mặc định đề xuất để trước)
1. **Khóa JWT:** dùng `secrets:` cấp cao của compose (thiếu file thì lỗi rõ), identity nhận cả khóa riêng, gateway chỉ khóa công khai. Hay bind mount `volumes:`?
2. **`pnpm infra:down`:** thêm `--profile apps` vào script để dừng luôn hai service (thay đổi một dòng ở `package.json`, thuộc A), hay giữ nguyên và chỉ ghi lệnh đầy đủ vào guide?
3. **Script chạy apps:** thêm `apps:up`/`apps:down` ở `package.json`, hay chỉ ghi lệnh `docker compose ... --profile apps` vào guide (đề xuất, đúng PHASE-1 bước 1–2)?
4. **Walkthrough:** `RE_Docker_Local_Guide.md` đã là tài liệu chạy Docker; task này không có code `.ts`. Đề xuất cập nhật guide thay vì tạo `RE_Compose_Code_Walkthrough.md` mới. Đồng ý không (`CLAUDE.md §8` yêu cầu walkthrough cho task có code; cấu hình compose coi là có)?

## Blockers / Ghi chú

- Phụ thuộc T1.2: đã merge (PR #7, `d4dcb14`, `79db043` "đóng T1.2"), nhưng `implementation/progress.md` trên nhánh này vẫn còn `[ ] T1.2`. Không sửa ở task này (chỉ A tick sau merge) — cần A tick cho khớp.
- Nhánh hiện tại: `feature/T1.3-compose` (user đã tạo).
- `secrets/` bị chặn đọc: không xác nhận được `jwt-public.pem` có tồn tại; user chạy `pnpm keys:generate` nếu thiếu. `.env` gốc có thể chưa có.
- Cần chốt khi lập kế hoạch:
  - `.env.example` gốc đặt `JWT_PUBLIC_KEY_PATH=./secrets/jwt-public.pem` (đường dẫn trên host); trong container phải là đường dẫn mount (ví dụ `/run/secrets/jwt-public.pem`), nên compose đặt riêng, không dùng biến gốc.
  - Identity cần khóa riêng để ký: mount `jwt-private.pem` (chỉ identity) hoặc cách khác; xem `services/identity` env.
  - Identity cần `DATABASE_URL`, `REDIS_URL`, có thể `RABBITMQ_URL`; `depends_on` với health của postgres/redis/rabbitmq.
  - Ảnh Dockerfile đang `EXPOSE 3000` và `PORT=3000` mặc định: compose đặt `PORT`.
  - Tag `v0.1-skeleton`: theo `git-workflow.md §5` gán ở M0 sau merge; không tự chạy.
  - `.env.example` gốc còn nhiều biến cũ (`ASSISTANT_*`, luồng reservation cũ, `docs/adr/...`): ngoài phạm vi, không sửa.
- Từ T1.2 (nợ kỹ thuật #4): tắt gateway khi còn WebSocket mở có thể chờ lâu; để ý khi `docker compose down`.
- `trust proxy=false` (chốt 2026-11-16): trong Docker mọi request ẩn danh từ host chung một bộ đếm IP 100/60 giây; chấp nhận.

## Việc còn dở của T1.2 (đã merge, không chặn T1.3)

- User tự chạy `test:infra`: `pnpm --filter @realestate/template-nest test:infra`, `pnpm --filter @realestate/identity test:infra` (`OutboxRelay` / `OUTBOX_RELAY_ENABLED` chưa kiểm với RabbitMQ thật).
- `services/api-gateway/README.md` còn là README của template (tech-debt #2): viết sau T1.3.
