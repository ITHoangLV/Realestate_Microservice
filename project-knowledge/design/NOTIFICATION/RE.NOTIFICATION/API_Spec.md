# RE.NOTIFICATION — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.NOTIFICATION` — thông báo trong ứng dụng từ sự kiện, đẩy WebSocket |
| **Service** | `notification` (cổng 3005) |
| **Quy tắc** | BR-19; US07; NFR08 |
| **Quyết định** | ADR-0006, ADR-0008 (PostgreSQL `jsonb`) |
| **CSDL** | `notification_db` / `notification_user`: `notifications`, `processed_events` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-16 — v1.1 |

## 1. API công khai

Đường dẫn chốt 2026-11-12 (A6).

| # | Method, đường dẫn | Quyền | Kết quả |
|---|---|---|---|
| 1 | `GET /api/v1/notifications` | user | Thông báo của người gọi (theo `user_id`; `ADMIN` thấy thêm thông báo `recipient_role = 'ADMIN'`), phân trang, mới nhất trước; lọc `unread=true` |
| 2 | `PATCH /api/v1/notifications/:id/read` | user | `200`, đặt `read_at` (idempotent) |

Route 2: không có hoặc không thuộc người gọi → `404 NOTIFICATION_NOT_FOUND` (không lộ tồn tại; BR-19; chốt 2026-11-16).

Mỗi thông báo:

```json
{ "id": "uuid", "type": "DEPOSIT_PAID", "title": "Đặt cọc thành công", "body": "…",
  "data": { "depositId": "uuid", "listingId": "uuid", "deepLink": "/deposits/uuid" },
  "readAt": null, "createdAt": "…" }
```

## 2. Sự kiện nghe (queue `notification.events`)

Người nhận và loại chốt 2026-11-16. Nội dung từng loại ở `message-templates.ts`.

| Sự kiện | Người nhận | `type` |
|---|---|---|
| `identity.registered` | `userId` | `WELCOME` |
| `rental.viewing-requested` | `ownerId` | `VIEWING_REQUESTED` |
| `rental.viewing-responded` | `tenantId` | `VIEWING_RESPONDED` |
| `rental.viewing-confirmed` | `ownerId` | `VIEWING_CONFIRMED` |
| `rental.viewing-cancelled` | `reason = TENANT` → `ownerId`; `reason = LISTING_DEPOSITED` → `tenantId` | `VIEWING_CANCELLED` |
| `rental.deposit-created` | `tenantId` | `DEPOSIT_CREATED` |
| `payment.deposited` | `tenantId` | `DEPOSIT_PAID` |
| `rental.deposit-expired` | `tenantId` | `DEPOSIT_EXPIRED` |
| `rental.deposit-cancelled` | `tenantId` | `DEPOSIT_CANCELLED` |
| `rental.deposit-handed-over` | `ownerId` | `DEPOSIT_HANDED_OVER` |
| `rental.release-reminder` | `tenantId` | `RELEASE_REMINDER` |
| `rental.deposit-released` | `ownerId`, `tenantId` | `DEPOSIT_RELEASED` |
| `payment.refunded` | `tenantId` | `DEPOSIT_REFUNDED` |
| `payment.refund-rejected` | `tenantId` | `REFUND_REJECTED` |
| `payment.late-payment-credited` | `tenantId`, quản trị viên | `LATE_PAYMENT` |
| `payment.withdrawal-requested` | quản trị viên | `WITHDRAWAL_REQUESTED` |
| `payment.withdrawal-completed` | `ownerId` | `WITHDRAWAL_COMPLETED` |
| `payment.withdrawal-failed` | `ownerId` | `WITHDRAWAL_FAILED` |

"Quản trị viên" = một thông báo theo vai trò: `recipient_role = 'ADMIN'`, `user_id = null`; mọi admin cùng thấy (JWT `role`), đẩy WebSocket tới phòng `role:ADMIN`; một admin đánh dấu đã đọc thì đã đọc với mọi admin (chốt 2026-11-16).

`identity.registered` còn ghi bản chụp `user_snapshots` cho tên hiển thị trong chat (`RE.CHAT §4`).

Sự kiện của payment chưa có `tenantId` trong payload báo cáo → xem `RE.MESSAGING/API_Spec.md §6`.

## 3. Đẩy thời gian thực

Socket.IO: sau khi transaction của consumer commit, đẩy sự kiện `notification` tới phòng `user:<userId>` (hoặc `role:ADMIN`); đẩy hỏng thì client vẫn tải qua route 1. Kết nối xác thực bằng access token. Chi tiết kết nối ở `RE.CHAT/API_Spec.md §3`.

## 4. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn |
|---|---|---|---|---|
| `NOTIFICATION_NOT_FOUND` | 404 | Không tìm thấy thông báo | BR-19 | Đề xuất |

## 5. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3005` | |
| `DATABASE_URL` | `postgres://notification_user:…@localhost:5433/notification_db` | |
| `RABBITMQ_URL`, `RABBITMQ_QUEUE` | `notification.events` | |
| `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER` | | REST và WebSocket |

## 6. DDL (đề xuất)

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                            -- null khi gửi theo vai trò
  recipient_role varchar(20) CHECK (recipient_role IN ('ADMIN')),
  type varchar(40) NOT NULL,
  title varchar(200) NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',        -- nội dung linh hoạt (ADR-0008)
  source_event_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_event_id, user_id),       -- lớp chống trùng thứ hai ngoài processed_events
  CHECK (user_id IS NOT NULL OR recipient_role IS NOT NULL)
);
CREATE UNIQUE INDEX uq_notifications_role_event ON notifications (source_event_id, recipient_role) WHERE recipient_role IS NOT NULL;
CREATE INDEX ix_notifications_role ON notifications (recipient_role, created_at DESC) WHERE recipient_role IS NOT NULL;
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
-- outbox_events, processed_events: migration CreateMessagingTables
```

## 7. Đã chốt 2026-11-16

1. Thông báo của người khác → `404 NOTIFICATION_NOT_FOUND`.
2. Người nhận và loại theo bảng §2.
3. Quản trị viên nhận thông báo theo vai trò (`recipient_role = 'ADMIN'`).
4. Email thông báo (X3) ngoài phạm vi.
