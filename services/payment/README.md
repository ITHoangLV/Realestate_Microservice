# @realestate/payment

Payment-service: payment order, tích hợp payOS (link, VietQR), ví trung gian, hoàn, rút. Cổng **3004**, DB `payment_db`.
Dựng từ `services/_template-nest` nên dùng chung log JSON, correlation ID, định dạng lỗi, health check (đọc README của template cho các phần đó). T3.1 mới có payment order và payOS; webhook payOS, tiền đến muộn, sự kiện (T3.4) và ví, hoàn, rút, chứng từ (T3.6) làm sau. Migration đã tạo đủ bảng cho các phần đó.

Thiết kế: `project-knowledge/design/PAYMENT/RE.PAYMENT/`, `RE.PAYOUT/`. Giải thích code: `project-knowledge/guides/RE_Payment_Code_Walkthrough.md`.

## Chức năng (T3.1)

API nội bộ, chỉ rental gọi (gateway trả `404` cho `/internal/*` từ ngoài). Hợp đồng: `contracts/openapi/payment-internal.v1.yaml`.

| Route                                             | Mô tả                                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /internal/payment-orders`                   | Tạo order `PENDING` (INSERT **trước**) rồi gọi payOS tạo link hết hạn đúng `expiresAt`: `201`. Gọi lại cùng `depositId`: `200` order cũ. `409` khi `expiresAt` đã qua, order đã `PAID`/`CANCELLED`. payOS lỗi: `503` |
| `GET /internal/payment-orders/:depositId`         | Trạng thái order (đối soát saga); `404` nếu chưa có                                                                                                                                                                  |
| `POST /internal/payment-orders/:depositId/cancel` | Hủy link payOS rồi `UPDATE ... WHERE status='PENDING'`: `200 CANCELLED` (gọi lại vẫn `200`). Webhook thắng trước: `409 PAYMENT_ORDER_ALREADY_PAID`. payOS lỗi: `503`, giữ `PENDING`                                  |

## Chạy

```powershell
pnpm infra:up                                            # postgres, ... (ở gốc repo)
pnpm --filter @realestate/payment dev                    # tự tạo .env từ .env.example; điền 3 khóa PAYOS_* thử nghiệm
pnpm --filter @realestate/payment migration:run          # lần đầu, và khi có migration mới
pnpm --filter @realestate/payment test                   # unit (payOS giả)
pnpm --filter @realestate/payment test:e2e               # e2e trong tiến trình (không cần hạ tầng)
pnpm --filter @realestate/payment test:infra             # Postgres + RabbitMQ thật; payOS GIẢ qua PAYOS_BASE_URL (không cần khóa thật)
```

Trong Docker: `docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build payment`
(chạy migration từ host trước). Payment không publish cổng ra host.

## Biến môi trường riêng

Bắt buộc (thiếu thì dừng khi khởi động, in rõ biến nào, không in giá trị): `DATABASE_URL`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `JWT_PUBLIC_KEY` hoặc `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`.
Tùy chọn: `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL` (trang Next.js), `PAYOS_TIMEOUT_MS` (2500, phải < 3000 của rental). Chi tiết ở `.env.example`.

## Lưu ý

- Khóa payOS thật chỉ ghi trong `.env` (không commit). Log của payment không ghi khóa; log của SDK payOS bị tắt (`logLevel: 'off'`).
- Tạo link payOS **không retry** (retry có thể tạo trùng). Hủy link dùng retry mặc định 2 của SDK (idempotent).
- Tiền là `bigint` VND. Đổi trạng thái order luôn là `UPDATE ... WHERE status='PENDING'` (hủy và webhook đua nhau, Postgres chọn một bên thắng).
- Sửa phần kỹ thuật chung (`src/common`, `src/messaging`, ...) thì sửa `_template-nest` trước rồi chép sang (ADR-0014).
