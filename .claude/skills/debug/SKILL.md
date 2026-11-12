---
name: debug
description: >
  Gỡ lỗi Real-estate có hệ thống 4 bước: Reproduce → Isolate → Diagnose → Fix. Kích hoạt khi nghe
  "lỗi", "bug", "exception", "không chạy", "tại sao", "container chết", "503/504", "webhook không
  tới", hoặc khi sắp đoán nguyên nhân mà chưa tái hiện.
---

# debug

**MUST** theo đúng 4 bước. **NEVER** nêu nguyên nhân khi chưa qua Bước 1.

## Bước 1 — Reproduce

- Triệu chứng cụ thể, input gây lỗi, request/response, `X-Request-ID`.
- Thu thập: stack trace, `docker compose --env-file .env -f infra/compose/docker-compose.yml logs --tail=200 <service>`, `GET /health` của gateway và service liên quan.
- Tái hiện trong phạm vi nhỏ nhất: gọi thẳng service (bỏ gateway, tự gắn `Authorization`), test đơn vị, curl.
- Chưa tái hiện được → không đoán.

## Bước 2 — Isolate

Khoanh tầng theo `architecture.md`:

| Tầng | Kiểm |
|---|---|
| Gateway | Bảng định tuyến, mức truy cập, JWT, chặn `/internal`, rate limit (`RE.GATEWAY`) |
| Controller / guard | `JwtAuthGuard`, `@Public()`, `RolesGuard`, `ValidationPipe`, `@Idempotent()` |
| Service | Transaction đúng chỗ? Có giữ transaction khi gọi HTTP? `UPDATE` có điều kiện trả 0 dòng? |
| TypeORM / DB | Bật log SQL, đếm truy vấn, lazy relation, migration đã chạy chưa, `bigint` là chuỗi, đúng database và cổng (laptop `5433`) |
| Client liên service | Timeout, retry, `INTERNAL_<SERVICE>_URL`; `not_executed` hay `unknown`? (`reliability-standard.md`) |
| RabbitMQ | Outbox đã gửi chưa, binding trong `definitions.json`, consumer ack/nack, `processed_events`, DLQ (`RE.MESSAGING`) |
| Redis | Refresh token, `Idempotency-Key`, khóa giữ chỗ |
| payOS | Chữ ký webhook, đường hầm ngrok/cloudflared, `payos_webhook_events` (`RE.PAYMENT`) |
| S3 (Silo) | `S3_PUBLIC_ENDPOINT`, presigned URL |
| Docker | Biến môi trường, healthcheck, profile, thứ tự khởi động (`guides/RE_Docker_Local_Guide.md §9`) |

Dấu vết sang service khác → đọc `API_Spec.md` và log của service đó theo cùng `correlationId`.

## Bước 3 — Diagnose

- Tìm nguyên nhân gốc (hỏi "tại sao" tới khi chạm nguyên nhân), không dừng ở triệu chứng.
- So cấu hình `env.validation.ts` / `config/` với `.env`, `infra/compose/docker-compose.yml`.
- Đọc `standards/gotchas.md` xem lỗi đã gặp chưa.

## Bước 4 — Fix

- Sửa nhỏ nhất đúng nguyên nhân gốc, qua procedure `developer` nếu là code production.
- Viết test tái hiện lỗi trước (TDD bật thì bắt buộc), rồi sửa cho pass.
- Lỗi đáng nhớ → đề xuất thêm vào `standards/gotchas.md`.

## Dừng và hỏi khi

- Lỗi lúc có lúc không, không tái hiện được.
- Nguyên nhân ở phần người khác sở hữu (`implementation/README.md §2`).
- Sửa đòi đổi kiến trúc, hợp đồng API hoặc sự kiện.
