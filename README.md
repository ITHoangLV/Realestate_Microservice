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

- Node.js 22 LTS (xem `.nvmrc`)
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

### Object storage (S3)

Dev dùng Silo (tương thích S3, xem `docs/adr/ADR-007-object-storage.md`). Bucket không được tạo
bằng `mc`/`mcli`: mỗi service tự đảm bảo bucket của mình tồn tại khi khởi động bằng AWS SDK
(`CreateBucket` chạy lại không lỗi). Việc này làm ở GĐ2 (template) và GĐ6 trở đi.

## Quy ước nhánh và commit

- Luồng nhánh: `main` <- `develop` <- `feature/*`.
- Mỗi tính năng làm trên `feature/<tên>` tách từ `develop`, mở PR vào `develop`.
- Commit theo Conventional Commits, ví dụ `chore(infra): ...`, `feat(listing): ...`, `fix(payment): ...`.
- Không commit `.env` hay bí mật thật; chỉ commit `.env.example`.
