# RE.MESSAGING — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.MESSAGING` — RabbitMQ, outbox, consumer chống trùng, DLQ, danh mục sự kiện |
| **Service** | `src/messaging/` trong mọi service phát/nhận sự kiện |
| **Quy tắc** | NFR01, NFR08; BR-08 (một lần ghi nhận), BR-16 |
| **Quyết định** | ADR-0006, ADR-0012 |
| **CSDL** | `outbox_events`, `processed_events` trong DB của từng service |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-16 — v1.1 |

## 1. Topology

| Exchange / queue | Loại | Ghi chú |
|---|---|---|
| `domain.events` | topic, durable | Mọi sự kiện |
| `domain.events.dlx` | direct | Nhận message bị loại |
| `notification.events` | queue, bind `identity.*`, `rental.*`, `payment.*` | Có trong `definitions.json` |
| `rental.payment-events` | queue, bind `payment.deposited`, `payment.refunded`, `payment.refund-rejected`, `payment.withdrawal-completed` | Chốt 2026-11-13. `withdrawal-requested`, `withdrawal-failed` chưa bind (chờ C10) |
| `<queue>.dlq` | queue | Message lỗi quá 3 lần, header `x-death` |

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

Tên sự kiện và payload theo Báo cáo v2 Bảng 3.13. Schema và example của mọi sự kiện ở `contracts/events/` (T0.4, 2026-11-13); schema là nguồn chi tiết về kiểu trường.

| Sự kiện | Routing key | Khóa | Phát bởi | Payload chính | Bên nghe | Thiết kế |
|---|---|---|---|---|---|---|
| UserRegistered | `identity.registered` | Có | identity | `userId, email, fullName, role` | notification | `RE.IDENTITY` |
| ViewingRequested | `rental.viewing-requested` | Có | rental | `viewingId, listingId, tenantId, ownerId` (bỏ `scheduledAt` 2026-11-16) | notification | `RE.VIEWING` |
| ViewingResponded | `rental.viewing-responded` | Có | rental | như trên + `decision` (chỉ `DECLINED`) | notification | `RE.VIEWING` |
| ViewingConfirmed | `rental.viewing-confirmed` | Có | rental | như trên | notification | `RE.VIEWING` |
| (hủy lịch xem) | `rental.viewing-cancelled` | Có (không có trong báo cáo, 2026-11-16) | rental | như trên + `reason` (`TENANT`/`LISTING_DEPOSITED`) | notification | `RE.VIEWING` |
| DepositCreated | `rental.deposit-created` | Có | rental | `depositId, listingId, tenantId, ownerId, amountVnd, expiresAt` | notification | `RE.DEPOSIT_SAGA` |
| DepositPaid | `payment.deposited` | Có | payment | `depositId, orderId, tenantId, ownerId, amountVnd, payosReference, paidAt` | rental, notification | `RE.PAYMENT` |
| DepositExpired | `rental.deposit-expired` | Có | rental | `depositId, listingId, tenantId, ownerId` | notification | `RE.DEPOSIT_SAGA` |
| DepositCancelled | `rental.deposit-cancelled` | Có | rental | `depositId, listingId, tenantId, ownerId` | notification | `RE.DEPOSIT_SAGA` |
| AdminConfirmedToSeller | `rental.deposit-handed-over` | Có | rental | `depositId, listingId, tenantId, ownerId, adminId` | notification | `RE.DEPOSIT_LIFECYCLE` |
| DepositReleased | `rental.deposit-released` | Có | rental | `depositId, listingId, tenantId, ownerId, trigger` (`TENANT`/`AUTO`) | notification | `RE.DEPOSIT_LIFECYCLE` |
| (nhắc giải ngân) | `rental.release-reminder` | Có (không có trong báo cáo) | rental | `depositId, listingId, tenantId, ownerId, autoReleaseAt` | notification | `RE.DEPOSIT_LIFECYCLE` |
| DepositRefunded | `payment.refunded` | Có | payment | `depositId, refundRequestId, tenantId, ownerId, amountVnd, requesterType` | rental, notification | `RE.PAYOUT` |
| RefundRejected | `payment.refund-rejected` | Có | payment | `depositId, refundRequestId, tenantId, ownerId, reason` | rental, notification | `RE.PAYOUT` |
| LatePaymentCredited | `payment.late-payment-credited` | Có | payment | `orderId, depositId, tenantId, amountVnd, payosReference` | notification | `RE.PAYMENT` |
| WithdrawalRequested | `payment.withdrawal-requested` | Có | payment | `withdrawalId, depositId, ownerId, amountVnd` (đơn `REFUNDED`: phần còn lại) | notification | `RE.PAYOUT` |
| WithdrawalCompleted | `payment.withdrawal-completed` | Có | payment | như trên | rental, notification | `RE.PAYOUT` |
| WithdrawalFailed | `payment.withdrawal-failed` | Có | payment | như trên + `reason` | notification | `RE.PAYOUT` |

Mọi sự kiện của rental mang đủ `tenantId`, `ownerId` để notification không phải gọi lại rental. Sự kiện của payment cũng mang `tenantId`, `ownerId` (thêm vào payload v1 so với Báo cáo, A5) để notification biết người nhận.

Schema luồng reservation cũ (`rental.requested/accepted/rejected/expired/cancelled/completed`, `payment.released`) và ba queue dự phòng (`payment.rental-events`, `listing.rental-events`, `listing.indexer`) đã xóa (2026-11-13). `payment.deposited`, `payment.refunded` viết lại trong `v1` vì chưa có code phát hay nghe.

**Binding cần cho `rental.payment-events`:** `payment.deposited`, `payment.refunded`, `payment.refund-rejected`, `payment.withdrawal-completed` (rental không nghe `withdrawal-requested`, `withdrawal-failed`; C10, chốt 2026-11-16).

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

## 6. Đã chốt 2026-11-16

1. Rental không nghe `payment.withdrawal-requested`, `payment.withdrawal-failed` (C10); chỉ notification nghe.
