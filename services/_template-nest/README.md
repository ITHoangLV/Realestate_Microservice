# @realestate/template-nest

Template service NestJS dùng chung cho monorepo `Realestate_Microservice`. Mọi service (api-gateway,
identity, listing, rental, payment, notification, assistant) **copy từ đây**, nên template đã có sẵn
các quy ước bắt buộc: log JSON, correlation ID, định dạng lỗi thống nhất, health check, JWT/roles,
idempotency, HTTP client gọi service khác, Swagger và Dockerfile.

- NestJS **11.2.8** (CommonJS), TypeScript strict, Node 22 LTS, pnpm workspace.
- Chạy được ngay, **không cần DB hay Redis**: `DATABASE_URL`/`REDIS_URL` chỉ bật module tương ứng khi có.
- Không có code nghiệp vụ. Thư mục `src/example/` là module **mẫu** để học cách dùng, xóa khi tạo service thật.

## Chạy thử template

```powershell
pnpm install                                     # ở gốc repo
pnpm --filter @realestate/template-nest dev      # tự tạo .env từ .env.example nếu chưa có
```

Mở `http://localhost:3000/api/v1/health` (hoặc `/health`) và Swagger tại `http://localhost:3000/api/docs`.

## 1. Tạo service mới từ template (trong 10 phút)

Ví dụ tạo `identity` (cổng 3001, DB `identity_db`). Chạy ở **gốc repo**, bằng PowerShell:

```powershell
# 1) Copy, bỏ node_modules/dist/.env (robocopy trả mã 1 nghĩa là copy thành công)
robocopy services\_template-nest services\identity /E /XD node_modules dist /XF .env openapi.json | Out-Null

# 2) Đổi tên package (name, description), SERVICE_NAME + PORT trong .env.example, thư mục trong Dockerfile
#    (ghi UTF-8 không BOM để tiếng Việt và .env không bị hỏng)
$utf8 = New-Object Text.UTF8Encoding($false)
function Edit-File($path, $pairs) {
  $t = [IO.File]::ReadAllText($path)
  foreach ($p in $pairs) { $t = $t.Replace($p[0], $p[1]) }
  [IO.File]::WriteAllText($path, $t, $utf8)
}
Edit-File 'services\identity\package.json' @(
  @('@realestate/template-nest', '@realestate/identity'),
  @('Template service NestJS dùng chung cho monorepo Realestate_Microservice', 'Identity service: đăng ký, đăng nhập, phát hành JWT'))
Edit-File 'services\identity\.env.example' @(
  @('SERVICE_NAME=template-nest', 'SERVICE_NAME=identity'), @('PORT=3000', 'PORT=3001'))
Edit-File 'services\identity\Dockerfile' @(
  @('services/_template-nest', 'services/identity'), @('template-nest', 'identity'))

# 3) Cài phụ thuộc và chạy (pnpm dev tự tạo .env từ .env.example)
pnpm install
pnpm --filter @realestate/identity dev
```

Kiểm tra: `curl.exe http://localhost:3001/api/v1/health` trả `{"status":"ok","service":"identity",...}`.

Việc cần làm tiếp để thành service thật:

1. Xóa module mẫu: thư mục `src/example/`, dòng `ExampleModule` trong `src/app.module.ts`,
   `test/example.e2e-spec.ts`, và (nếu không dùng DB) `src/database/entities/example-item.entity.ts` cùng
   migration mẫu. Giữ lại các `test/*.e2e-spec.ts` còn lại: chúng kiểm tra hạ tầng dùng chung.
2. Bật DB: bỏ comment `DATABASE_URL` trong `.env`, đổi sang user/DB của service (bảng bên dưới).
3. Viết module nghiệp vụ trong `src/<tên-module>/`, mã lỗi nghiệp vụ riêng khai báo trong module đó.
4. Thêm vào `docker-compose` (xem mục [Docker](#docker)) và thêm file OpenAPI vào `contracts/openapi/`.

### Bảng cổng và DB

| Service      | Cổng | Database (Postgres, user riêng cùng tên miền) |
| ------------ | ---- | --------------------------------------------- |
| template     | 3000 | không                                         |
| api-gateway  | 8080 | không                                         |
| identity     | 3001 | `identity_db` / `identity_user`               |
| listing      | 3002 | `listing_db` / `listing_user` (có PostGIS)    |
| rental       | 3003 | `rental_db` / `rental_user`                   |
| payment      | 3004 | `payment_db` / `payment_user`                 |
| notification | 3005 | MongoDB `notification_db` (xem lưu ý Mongo)   |
| assistant    | 3006 | tùy thiết kế                                  |

Mỗi service **chỉ** được kết nối DB của mình, không đọc DB của service khác. Từ laptop, Postgres ở
`localhost:5433`; trong Docker dùng host `postgres` cổng `5432` (xem README gốc).

## 2. Quy ước mà template thể hiện

| Chủ đề         | Quy ước                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| API công khai  | Prefix `/api/v1`.                                                                                                                                  |
| API nội bộ     | Prefix `/internal/...`, chỉ service gọi service, **gateway không expose**, không có trong Swagger.                                                 |
| Health         | `GET /health` (cho Docker) và alias `GET /api/v1/health`. Body `{ status, service, version, uptime, checks }`, 200 khi ổn, 503 khi phụ thuộc chết. |
| Lỗi            | Mọi lỗi có dạng `{ code, message, details?, correlationId }`. 4xx nghiệp vụ, 503/504 hạ tầng, 5xx không lộ stack/message.                          |
| Correlation ID | Đọc header `X-Request-ID` (gateway sinh), thiếu thì tự sinh UUID v4. Có ở response header, mọi dòng log, và tự truyền khi gọi service khác.        |
| Log            | JSON một dòng ra stdout: `level, time (ISO UTC), service, correlationId, msg` (+ `method, url, statusCode, responseTime` cho request).             |
| Tiền           | **Số nguyên VND** (`bigint` trong DB, `@IsInt()` trong DTO). Không bao giờ dùng float/decimal.                                                     |
| Thời gian      | Luôn UTC, ISO-8601 (`2026-11-05T10:00:00.000Z`); cột DB là `timestamptz`.                                                                          |
| Validation     | `ValidationPipe` toàn cục: bỏ trường thừa → báo lỗi (`forbidNonWhitelisted`), tự ép kiểu.                                                          |

### Lỗi: cách ném và mã lỗi

```ts
throw new AppException('DEPOSIT_ALREADY_PAID', 'Đơn đặt cọc đã được thanh toán', 409, {
  depositId,
});
```

Mã dùng chung (xem `src/common/errors/error-codes.ts`): `VALIDATION_FAILED` (400), `AUTH_TOKEN_MISSING|INVALID|EXPIRED` (401),
`FORBIDDEN_ROLE` (403), `NOT_FOUND` (404), `CONFLICT` (409), `IDEMPOTENCY_KEY_REUSED` (422),
`IDEMPOTENCY_IN_PROGRESS` (409), `INTERNAL_ERROR` (500), `DEPENDENCY_UNAVAILABLE`/`UPSTREAM_UNAVAILABLE` (503),
`DEPENDENCY_TIMEOUT`/`UPSTREAM_TIMEOUT` (504). Mã nghiệp vụ riêng đặt tên `<MIỀN>_<LÝ_DO>` trong module của service.

## 3. Cấu trúc thư mục

```text
src/
├── main.ts                 # bootstrap: nạp env, logger, Swagger, shutdown hooks
├── app.module.ts           # ghép module; DB/Redis chỉ bật khi có env
├── app.setup.ts            # prefix, middleware (dùng chung main.ts và test)
├── swagger.setup.ts        # Swagger UI /api/docs và dựng OpenAPI
├── config/                 # đọc + validate biến môi trường (Joi)
├── common/                 # phần dùng chung, xem bên dưới
├── health/                 # GET /health (Terminus) + HealthRegistry
├── database/               # TypeORM (TÙY CHỌN): module, entity mẫu, migration, data-source CLI
├── redis/                  # ioredis (TÙY CHỌN)
├── example/                # module MẪU: xóa khi tạo service thật
└── scripts/export-openapi.ts
test/                       # test e2e + helper (createTestApp, upstream giả)
```

### `src/common/` làm gì

| Thư mục        | Nội dung và khi nào dùng                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors/`      | `AppException` (ném lỗi chuẩn), `error-codes.ts` (mã dùng chung), `AllExceptionsFilter` (đưa MỌI lỗi về một format, giấu stack ở 5xx, đổi lỗi kết nối DB/Redis thành 503/504), `createValidationPipe` (lỗi DTO kèm `details` theo từng trường). |
| `logging/`     | `logger.module.ts` (pino, JSON, ẩn `authorization`/`cookie`/`password`...), `correlation-id.middleware.ts` (X-Request-ID, `getCorrelationId()` dùng ở mọi nơi), `access-log.middleware.ts` (một dòng log mỗi request).                          |
| `auth/`        | `JwtAuthGuard` (mặc định mọi route cần JWT), `RolesGuard`, `@Public()`, `@Roles('ADMIN',...)`, `@CurrentUser()`, `jwt.config.ts` (chọn khóa).                                                                                                   |
| `idempotency/` | `@Idempotent()` + interceptor: chống xử lý trùng cho thao tác ghi quan trọng (đặc biệt tiền). Cần Redis.                                                                                                                                        |
| `http/`        | `InternalHttpService`: gọi service khác với timeout, retry an toàn, truyền `X-Request-ID`, đổi lỗi thành `AppException`.                                                                                                                        |
| `lifecycle/`   | `ShutdownLoggerService`: ghi log trình tự tắt gọn khi nhận SIGTERM.                                                                                                                                                                             |

### Dùng nhanh

```ts
@Controller('deposits')
export class DepositController {
  constructor(private readonly http: InternalHttpService) {}

  @Public()
  @Get('health-ish') // không cần token
  open() {}

  @Roles('ADMIN')
  @Get('admin') // cần ADMIN (403 FORBIDDEN_ROLE nếu thiếu)
  admin(@CurrentUser('sub') adminId: string) {}

  @Post()
  @Idempotent() // client gửi header Idempotency-Key, cần REDIS_URL
  async create(@Body() dto: CreateDepositDto) {
    // Gọi service khác: tự gắn X-Request-ID, GET được retry, 4xx của đích giữ nguyên
    const room = await this.http.get<RoomDto>(
      `${process.env.INTERNAL_LISTING_URL}/internal/rooms/${dto.roomId}`,
    );
  }
}
```

`@Roles` nhận **chuỗi tự do**, template không cố định danh sách vai trò (identity-service sẽ quy định, ví dụ
`ADMIN`, `LANDLORD`, `TENANT`).

## 4. Biến môi trường

Validate khi khởi động (`src/config/env.validation.ts`): thiếu biến bắt buộc hoặc sai định dạng thì service
**dừng ngay** và in rõ biến nào sai.

| Biến                      | Mặc định        | Ý nghĩa                                                                                                            |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SERVICE_NAME`            | **không**       | Tên service (log, `/health`, Swagger). **Bắt buộc.**                                                               |
| `NODE_ENV`                | `development`   | `development` \| `test` \| `production`                                                                            |
| `PORT`                    | `3000`          | Cổng HTTP.                                                                                                         |
| `LOG_LEVEL`, `LOG_PRETTY` | `info`, `false` | Mức log; `LOG_PRETTY=true` bật pino-pretty (chỉ dev).                                                              |
| `HTTP_TIMEOUT_MS`         | `3000`          | Timeout gọi service khác. **Lưu ý:** `.env` gốc repo ghi `5000`; template dùng 3000 theo quy ước service.          |
| `HTTP_MAX_RETRIES`        | `2`             | Số lần thử lại tối đa (chỉ GET/lệnh idempotent).                                                                   |
| `SWAGGER_ENABLED`         | `true`          | Bật `/api/docs`. Ảnh Docker mặc định `false`.                                                                      |
| `IDEMPOTENCY_TTL_SECONDS` | `86400`         | Thời gian lưu kết quả `Idempotency-Key`.                                                                           |
| `DATABASE_URL`            | tắt             | Bật TypeORM + health `db`. Ví dụ laptop: `postgres://identity_user:change_me_identity@localhost:5433/identity_db`. |
| `REDIS_URL`               | tắt             | Bật Redis + health `redis`. Ví dụ: `redis://:change_me_redis@localhost:6379`.                                      |
| `RABBITMQ_URL`            | tắt             | Dành chỗ; template **chưa có** code RabbitMQ. vhost `/` phải viết `%2F`.                                           |
| `JWT_PUBLIC_KEY`          | tắt             | Khóa công khai PEM (xuống dòng viết `\n`), RS256. Ưu tiên 1.                                                       |
| `JWT_PUBLIC_KEY_PATH`     | tắt             | Đường dẫn file khóa công khai, RS256. Ưu tiên 2.                                                                   |
| `JWT_SECRET`              | tắt             | Bí mật HS256 (≥16 ký tự, **chỉ dev**). Ưu tiên 3.                                                                  |
| `JWT_ISSUER`              | tắt             | Nếu đặt, token phải có đúng `iss`.                                                                                 |

Không cấu hình JWT nào thì mọi route không `@Public()` trả `503 AUTH_NOT_CONFIGURED` (không bao giờ để hở).

## 5. Lệnh thường dùng

```powershell
pnpm --filter @realestate/template-nest dev              # chạy, tự build lại khi sửa
pnpm --filter @realestate/template-nest build            # biên dịch ra dist/
pnpm --filter @realestate/template-nest test:e2e         # test e2e (không cần hạ tầng)
pnpm --filter @realestate/template-nest openapi:export   # xuất openapi.json để so với contracts/openapi
pnpm lint                                                # ở gốc repo
```

Migration (cần `DATABASE_URL`): `pnpm migration:generate src/database/migrations/<tên>`,
`pnpm migration:run`, `pnpm migration:revert`. `synchronize` luôn tắt, schema chỉ đổi qua migration.
UUID dùng `gen_random_uuid()` của PostgreSQL (TypeORM `uuidExtension: 'pgcrypto'`), không cần extension `uuid-ossp`.

### Kiểm tra từng tiêu chí

```powershell
curl.exe http://localhost:3000/api/v1/health                                   # 200 + { status, service, version, uptime, checks }
curl.exe -i http://localhost:3000/api/v1/examples/0b0a8b5e-7f9e-4c3a-9d2a-2f5f4b9c1a11 -H "X-Request-ID: abc-123"
                                                                               # 404 { code, message, details, correlationId: "abc-123" } và header X-Request-ID: abc-123
pnpm lint; pnpm --filter @realestate/template-nest test:e2e                    # xanh
docker build -f services/_template-nest/Dockerfile -t realestate/template-nest .
```

## 6. Docker

Build từ **gốc repo** (ảnh cần `pnpm-lock.yaml` và `tsconfig.base.json`); `Dockerfile.dockerignore` nằm cạnh Dockerfile
(BuildKit ưu tiên file này vì build context là gốc repo):

```powershell
docker build -f services/identity/Dockerfile -t realestate/identity .
docker run --rm -p 3001:3001 -e SERVICE_NAME=identity -e PORT=3001 realestate/identity
```

Ảnh: 3 stage, `node:22-alpine`, chạy bằng user `node` (không phải root), `HEALTHCHECK` gọi `/health`,
tắt gọn khi nhận SIGTERM, mặc định `SWAGGER_ENABLED=false`, **không** chứa `.env`/devDependencies.

Thêm vào `infra/compose/docker-compose.yml` (dùng chung network và biến `.env` gốc; trong Docker dùng host `postgres:5432`,
`redis:6379`):

```yaml
identity:
  build:
    context: ../..
    dockerfile: services/identity/Dockerfile
  container_name: re-identity
  profiles: [apps]
  environment:
    SERVICE_NAME: identity
    PORT: '3001'
    DATABASE_URL: postgres://${IDENTITY_DB_USER}:${IDENTITY_DB_PASSWORD}@postgres:5432/${IDENTITY_DB_NAME}
    REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    # Chọn MỘT: JWT_SECRET (HS256, chỉ dev) hoặc mount khóa công khai vào container rồi đặt JWT_PUBLIC_KEY_PATH
    JWT_SECRET: ${JWT_SECRET_DEV:-bi-mat-dev-toi-thieu-16-ky-tu}
  ports:
    - '127.0.0.1:3001:3001'
  depends_on:
    postgres: { condition: service_healthy }
    redis: { condition: service_healthy }
  networks: [realestate-net]
```

## 7. Lưu ý và khác biệt so với giả định ban đầu

- **NestJS 11, không phải 12**: bản `latest` (12.x) là ESM-only, còn `tsconfig.base.json` của repo là CommonJS.
- **`incremental` tắt** trong `tsconfig.json` của template: `.tsbuildinfo` nằm ngoài `dist/` nên `nest build` bỏ sót file khi `dist/` bị xóa.
- **Middleware gắn bằng `app.use`** (xem `app.setup.ts`): middleware của module bị Nest gắn thêm prefix `/api/v1`,
  nên bỏ sót `/health`, `/internal/*` và các request 404.
- **`/health` có hai đường dẫn**: `/health` (Docker, không qua gateway) và `/api/v1/health` (alias).
- **ConfigModule bỏ qua file `.env`**: `env.bootstrap.ts` nạp file; test e2e vì vậy không đọc `.env` cục bộ.
- **Mongo chưa có**: notification/maintenance dùng MongoDB nhưng template chỉ có PostgreSQL + Redis. Thêm `MongoModule`
  (Mongoose) khi làm các service đó.
- **Inject `PinoLogger` trực tiếp** rồi `setContext(...)`; đừng dùng `@InjectPinoLogger` (chỉ chạy nếu class được import
  trước `LoggerModule`).
- **`/internal/*` đang `@Public()`**: tạm tin mạng nội bộ; nên thêm xác thực service-to-service khi triển khai thật.
- **`ConfigModule` chốt giá trị lúc import `AppModule`**: test đổi biến có giá trị mặc định (ví dụ `HTTP_TIMEOUT_MS`) phải
  đặt env **trước** khi import (xem `test/http-client-defaults.e2e-spec.ts`).
