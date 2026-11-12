# RE.MESSAGING — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.MESSAGING` — RabbitMQ, outbox, consumer chống trùng, DLQ, danh mục sự kiện |
| **Service** | `src/messaging/` trong mọi service phát/nhận sự kiện |
| **Quy tắc** | NFR01, NFR08; BR-08 (một lần ghi nhận), BR-16 |
| **Quyết định** | ADR-0006, ADR-0012 |
| **CSDL** | `outbox_events`, `processed_events` trong DB của từng service |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Topology

| Exchange / queue | Loại | Ghi chú |
|---|---|---|
| `domain.events` | topic, durable | Mọi sự kiện |
| `domain.events.dlx` | direct | Nhận message bị loại |
| `notification.events` | queue, bind `identity.*`, `rental.*`, `payment.*` | Có trong `definitions.json` |
| `rental.payment-events` | queue, bind `payment.deposited` | Có. **Cần thêm** binding §3 `[cần xác nhận]` |
| `<queue>.dlq` | queue | Message lỗi quá 3 lần, header `x-death` |
| `payment.rental-events`, `listing.rental-events`, `listing.indexer` | queue dự phòng | Chưa có consumer trong Báo cáo v2: bỏ hay giữ `[cần xác nhận]` |

Topology nạp bằng container `rabbitmq-init` từ `infra/rabbitmq/definitions.json`. Service **không** tự tạo exchange/queue.

## 2. Phong bì sự kiện

`contracts/events/envelope.v1.schema.json`, `additionalProperties: false`:

```json
{
  "eventId": "uuid",
  "eventType": "payment.deposited",
  "version": 1,
  "occurredAt": "2026-11-10T08:00:00.000Z",
  "correlationId": "X-Request-ID gốc",
  "producer": "payment",
  "payload": { }
}
```

`eventType` bằng routing key `<miền>.<sự kiện>`. Schema hiện ép `^[a-z]+\.[a-z]+$`; nới thành `^[a-z]+\.[a-z-]+$` để dùng khóa có gạch ngang ở §3 (A4, sửa `contracts/events/envelope.v1.schema.json` ở T0.4).

## 3. Danh mục sự kiện

Tên sự kiện và payload theo Báo cáo v2 Bảng 3.13. Cột "Khóa" ghi `Có` nếu đã có schema trong `contracts/events/`; khóa còn lại chốt 2026-11-12 (A4), viết schema ở T0.4.

| Sự kiện | Routing key | Khóa | Phát bởi | Payload chính | Bên nghe | Thiết kế |
|---|---|---|---|---|---|---|
| UserRegistered | `identity.registered` | Có | identity | `userId, email, fullName, role` | notification | `RE.IDENTITY` |
| ViewingRequested | `rental.viewing-requested` | Mới (A4) | rental | `viewingId, listingId, tenantId, ownerId, scheduledAt` | notification | `RE.VIEWING` |
| ViewingResponded | `rental.viewing-responded` | Mới (A4) | rental | như trên + `decision` | notification | `RE.VIEWING` |
| ViewingConfirmed | `rental.viewing-confirmed` | Mới (A4) | rental | như trên | notification | `RE.VIEWING` |
| DepositCreated | `rental.deposit-created` | Mới (A4) | rental | `depositId, listingId, tenantId, ownerId, amountVnd, expiresAt` | notification | `RE.DEPOSIT_SAGA` |
| DepositPaid | `payment.deposited` | Có (payload cũ, cần cập nhật) | payment | `depositId, orderId, tenantId, ownerId, amountVnd, payosReference, paidAt` | rental, notification | `RE.PAYMENT` |
| DepositExpired | `rental.deposit-expired` | Mới (A4) | rental | `depositId, listingId, tenantId, ownerId` | notification | `RE.DEPOSIT_SAGA` |
| DepositCancelled | `rental.deposit-cancelled` | Mới (A4) | rental | `depositId, listingId, tenantId, ownerId` | notification | `RE.DEPOSIT_SAGA` |
| AdminConfirmedToSeller | `rental.deposit-handed-over` | Mới (A4) | rental | `depositId, listingId, ownerId, adminId` | notification | `RE.DEPOSIT_LIFECYCLE` |
| DepositReleased | `rental.deposit-released` | Mới (A4) | rental | `depositId, listingId, ownerId, trigger` (`TENANT`/`AUTO`) | notification | `RE.DEPOSIT_LIFECYCLE` |
| (nhắc giải ngân) | `rental.release-reminder` | Mới, không có trong báo cáo | rental | `depositId, tenantId, autoReleaseAt` | notification | `RE.DEPOSIT_LIFECYCLE` |
| DepositRefunded | `payment.refunded` | Có (payload cũ, cần cập nhật) | payment | `depositId, refundRequestId, tenantId, ownerId, amountVnd, requesterType` | rental, notification | `RE.PAYOUT` |
| RefundRejected | `payment.refund-rejected` | Mới (A4) | payment | `depositId, refundRequestId, tenantId, ownerId, reason` | rental, notification | `RE.PAYOUT` |
| LatePaymentCredited | `payment.late-payment-credited` | Mới (A4) | payment | `orderId, depositId, tenantId, amountVnd, payosReference` | notification | `RE.PAYMENT` |
| WithdrawalRequested | `payment.withdrawal-requested` | Mới (A4) | payment | `withdrawalId, depositId, ownerId, amountVnd` (đơn `REFUNDED`: phần còn lại) | rental, notification | `RE.PAYOUT` |
| WithdrawalCompleted | `payment.withdrawal-completed` | Mới (A4) | payment | như trên | rental, notification | `RE.PAYOUT` |
| WithdrawalFailed | `payment.withdrawal-failed` | Mới (A4) | payment | như trên + `reason` | rental, notification | `RE.PAYOUT` |

Mọi sự kiện của rental mang đủ `tenantId`, `ownerId` để notification không phải gọi lại rental. Sự kiện của payment cũng mang `tenantId`, `ownerId` (thêm vào payload v1 so với Báo cáo, A5) để notification biết người nhận.

Schema cũ còn trong repo (`rental.requested/accepted/rejected/expired/cancelled/completed`, `payment.released`) thuộc luồng reservation trước Báo cáo v2 → bỏ hay giữ `[cần xác nhận]`.

**Binding cần cho `rental.payment-events`:** `payment.deposited`, `payment.refunded`, `payment.refund-rejected`, `payment.withdrawal-requested`, `payment.withdrawal-completed`, `payment.withdrawal-failed`.

## 4. DDL (đã có trong migration `CreateMessagingTables`)

```sql
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,                 -- = eventId
  event_type text NOT NULL,
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,            -- null = chưa gửi
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX "IDX_outbox_events_pending" ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE processed_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
```

## 5. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `RABBITMQ_URL` | tắt | Bật module; bắt buộc kèm `DATABASE_URL`; vhost `/` viết `%2F` |
| `RABBITMQ_EXCHANGE` | `domain.events` | |
| `RABBITMQ_QUEUE` | trống | Queue service đọc; trống = chỉ phát |
| `RABBITMQ_PREFETCH` | `10` | |
| `RABBITMQ_MAX_RETRIES` | `3` | Sau đó vào `<queue>.dlq` |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | |
| `OUTBOX_BATCH_SIZE` | `50` | |
| `OUTBOX_RELAY_ENABLED` | `true` | `false` để test |

| Service | `RABBITMQ_QUEUE` |
|---|---|
| identity, payment | trống (chỉ phát) — payment không nghe sự kiện trong Báo cáo v2 |
| rental | `rental.payment-events` |
| notification | `notification.events` |
| listing | trống (không phát, không nghe) |

## 6. Điểm [cần xác nhận]

1. Xóa hay giữ queue dự phòng và schema của luồng reservation cũ.
2. Rental có xử lý gì với `WithdrawalRequested`, `WithdrawalFailed` không: báo cáo liệt kê rental là bên nghe nhưng không nêu xử lý.
