# Hệ thống thuê nhà microservices

Nền tảng thuê nhà: đặt cọc qua ví trung gian, chatbot gợi ý phòng. Toàn bộ service dùng
NestJS (TypeScript strict), pnpm workspace.

## Cấu trúc thư mục

```text
services/            # Các service NestJS (tạo ở GĐ2-4)
contracts/
  openapi/           # Hợp đồng REST (OpenAPI)
  events/            # Schema sự kiện domain
infra/
  compose/           # docker-compose + script khởi tạo
  elk/               # Cấu hình Elasticsearch/Kibana/Filebeat (GĐ10)
  rabbitmq/          # definitions.json, rabbitmq.conf
  k6/                # Kịch bản tải
  postman/           # Collection Postman
  scripts/           # Script kiểm tra/tiện ích hạ tầng
docs/
  architecture/      # Tài liệu kiến trúc
  adr/               # Architecture Decision Records
  runbook/           # Hướng dẫn vận hành
```

## Service và cổng

| Service      | Cổng | Ghi chú  |
| ------------ | ---- | -------- |
| api-gateway  | 8080 |          |
| identity     | 3001 |          |
| listing      | 3002 |          |
| rental       | 3003 |          |
| payment      | 3004 |          |
| notification | 3005 |          |
| assistant    | 3006 |          |
| maintenance  | 3007 | tùy chọn |
| mobility     | 3008 | tùy chọn |

Mỗi service có DB riêng; không service nào đọc DB của service khác.

## Yêu cầu môi trường

- Node.js 22 LTS (xem `.nvmrc`). Trên Windows với nvm-windows, `nvm use 22` cần terminal
  chạy quyền Administrator (hoặc bật Developer Mode) để tạo symlink; chạy ở terminal thường
  sẽ treo và để lại máy không có `node` trên PATH.
- pnpm >= 10 (`corepack enable`)
- Docker Desktop + Docker Compose v2
- PowerShell (Windows) hoặc bash

## Cách chạy

```powershell
pnpm install
pnpm lint
pnpm format:check
pnpm build
```

Mục "Chạy hệ thống" (docker compose dev/demo) sẽ bổ sung ở Bước 6.

### Cổng kết nối: laptop và trong Docker

Hạ tầng chỉ publish cổng ra `127.0.0.1`. Có hai cách kết nối, đừng nhầm lẫn:

| Thành phần | Tiến trình chạy trên laptop        | Service chạy trong Docker |
| ---------- | ---------------------------------- | ------------------------- |
| Postgres   | `localhost:5433` (`POSTGRES_PORT`) | `postgres:5432`           |
| Redis      | `localhost:6379`                   | `redis:6379`              |
| RabbitMQ   | `localhost:5672` (UI `15672`)      | `rabbitmq:5672`           |
| MongoDB    | `localhost:27017`                  | `mongo:27017`             |
| S3 (Silo)  | `localhost:9000` (console `9001`)  | `s3:9000`                 |

Postgres dùng cổng **5433** trên laptop vì máy đã cài PostgreSQL trên Windows chiếm 5432.
Container luôn lắng nghe 5432 bên trong; `POSTGRES_DOCKER_HOST` và `POSTGRES_DOCKER_PORT`
(`postgres` / `5432`) dành cho service chạy trong Docker.

Lệnh nhanh (đã bọc `--env-file .env` và `-f infra/compose/docker-compose.yml`):

```powershell
pnpm infra:up      # profile dev
pnpm infra:demo    # dev + Elasticsearch + Kibana
pnpm infra:logs    # xem log
pnpm infra:down    # dừng tất cả
```

### Khởi tạo database

- Postgres: `infra/compose/postgres/init/01-create-databases.sh` tạo `identity_db`, `listing_db`,
  `rental_db`, `payment_db`, mỗi DB một user riêng (không phải superuser), `REVOKE CONNECT` từ
  PUBLIC nên user chỉ vào được DB của mình. `listing_db` bật `postgis`, `pgcrypto`, `uuid-ossp`.
- MongoDB: `infra/compose/mongo/init/01-create-users.sh` tạo `notification_db` và `maintenance_db`
  với user `readWrite` riêng. Chuỗi kết nối cần `authSource=<tên DB>`.
- Các script chỉ chạy **lần đầu** khi volume còn trống. Muốn chạy lại (sẽ mất dữ liệu dev):

```powershell
pnpm infra:down
docker volume rm realestate_postgres_data realestate_mongo_data
pnpm infra:up
```

### RabbitMQ

- Topology nằm ở `infra/rabbitmq/definitions.json` (không chứa bí mật): exchange `domain.events`
  (topic) và `domain.events.dlx` (direct); queue `listing.indexer`, `notification.events`,
  `rental.payment-events`, mỗi queue có DLQ `*.dlq`.
- Không dùng `load_definitions`. RabbitMQ tạo user từ `.env` như bình thường, rồi container
  `rabbitmq-init` chạy một lần để POST topology vào Management API. Chạy lại nhiều lần vẫn an toàn.
  Trạng thái đúng của nó là `Exited (0)`.
- Áp dụng lại topology thủ công: `docker start -a re-rabbitmq-init`.
- Nếu sửa tham số của queue đã tồn tại (ví dụ `x-dead-letter-*`), RabbitMQ từ chối
  (`PRECONDITION_FAILED`). Khi đó xóa queue đó trong Management UI (`http://127.0.0.1:15672`) hoặc
  reset volume `realestate_rabbitmq_data` rồi chạy lại.
- Routing key có dạng hai từ `<miền>.<sự kiện>` (ví dụ `listing.created`); `*` chỉ khớp đúng một từ.
- Message bị `reject` không requeue sẽ vào `<queue>.dlq` (header `x-death` ghi lý do và routing key gốc).

### Object storage (S3)

Dev dùng Silo (tương thích S3, xem `docs/adr/ADR-007-object-storage.md`). Bucket không được tạo
bằng `mc`/`mcli`: mỗi service tự đảm bảo bucket của mình tồn tại khi khởi động bằng AWS SDK
(`CreateBucket` chạy lại không lỗi). Việc này làm ở GĐ2 (template) và GĐ6 trở đi.

## Quy ước nhánh và commit

- Luồng nhánh: `main` <- `develop` <- `feature/*`.
- Mỗi tính năng làm trên `feature/<tên>` tách từ `develop`, mở PR vào `develop`.
- Commit theo Conventional Commits, ví dụ `chore(infra): ...`, `feat(listing): ...`, `fix(payment): ...`.
- Không commit `.env` hay bí mật thật; chỉ commit `.env.example`.
