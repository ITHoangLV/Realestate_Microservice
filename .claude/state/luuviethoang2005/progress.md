---
task: T3.1 payment: khung, payment order, payOS
updated: 2026-11-21
percent: 100
---

## Đang làm
- Bước hiện tại: xong; commit trên `feature/T3.1-payment-order`, chờ push và PR (A merge)
- Tóm tắt: service payment từ template, migration đủ bảng payment + ví, `PayosClient`, `PaymentOrderService`, API nội bộ; test 7–10 pass với Postgres thật và SDK payOS thật trỏ vào payOS giả

## Đã xong (phiên này)
- `RE.PAYMENT` v1.2 (§8: C22, C23), `architecture.md §5` (phiên bản SDK, cách tắt retry)
- payment unit 150/150, e2e 97/97, infra: `payment-orders` 23/23, `messaging` 8/8; `storage` 5/6 (môi trường của Claude không có S3 thật, bản giả moto không kiểm chữ ký presigned; template chưa sửa gì cũng 5/6)
- `pnpm lint`, `format:check`, `build`, `contracts:check` sạch; `migration:run` + `node dist/main.js`: `/health` `db: up`, API nội bộ trả đúng mã lỗi; thiếu biến thì dừng, in rõ biến
- Compose (`payment`, profile `apps`), `.env.example` gốc và service, README, walkthrough mới, `CLAUDE.md §2.5`, `project-structure.md`

## Còn lại
- Push, mở PR vào `develop` (A merge); sau merge tick `implementation/progress.md` T3.1
- A chạy `test:infra` của payment trên máy (S3 thật cho `storage.infra-spec`) và `compose up --build payment` (Claude không kéo được image từ Docker Hub)
- C22, C23 chờ A chốt

## Blockers
_không có_
