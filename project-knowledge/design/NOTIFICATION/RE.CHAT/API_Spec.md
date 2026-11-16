# RE.CHAT — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.CHAT` — nhắn tin người thuê – chủ trọ, kênh hỗ trợ với quản trị viên |
| **Service** | `notification` (cổng 3005) |
| **Quy tắc** | BR-19; FR07 |
| **CSDL** | `notification_db`: `conversations`, `conversation_participants`, `messages` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-16 — v1.1 |

> Báo cáo v2 Bảng 3.11 nêu bốn thao tác: xem hội thoại và tin nhắn, gửi tin nhắn (đẩy qua WebSocket), `403` nếu không tham gia. Đường dẫn chốt 2026-11-12 (A6); loại hội thoại chốt 2026-11-16.

## 1. API công khai

| # | Method, đường dẫn | Quyền | Kết quả |
|---|---|---|---|
| 1 | `POST /api/v1/conversations` | user | Mở hội thoại. Body `{ type: 'TENANT_LANDLORD', participantId, listingId? }` hoặc `{ type: 'SUPPORT' }`. Đã có cùng cặp + tin → `200` hội thoại cũ |
| 2 | `GET /api/v1/conversations` | user | Hội thoại của tôi, sắp theo tin nhắn mới nhất; admin thấy thêm mọi `SUPPORT`; kèm `participants[{ userId, fullName }]` từ `user_snapshots` (thiếu → `"Người dùng"`) |
| 3 | `GET /api/v1/conversations/:id/messages` | người tham gia | Phân trang, mới nhất trước; không tham gia → `403 NOTIFICATION_CONVERSATION_FORBIDDEN` |
| 4 | `POST /api/v1/conversations/:id/messages` | người tham gia | `201`; body `{ text }` 1–2000 ký tự; đẩy WebSocket tới người còn lại. Hội thoại `SUPPORT`: admin gửi tin đầu tiên được thêm vào `conversation_participants` |

## 2. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn |
|---|---|---|---|---|
| `NOTIFICATION_CONVERSATION_NOT_FOUND` | 404 | Không tìm thấy hội thoại | | Đề xuất |
| `NOTIFICATION_CONVERSATION_FORBIDDEN` | 403 | Bạn không tham gia hội thoại này | BR-19 | Báo cáo (`403`), tên đề xuất |
| `NOTIFICATION_SELF_CONVERSATION` | 400 | Không thể nhắn tin cho chính mình | | Đề xuất |

## 3. WebSocket (Socket.IO)

| Mục | Chốt 2026-11-16 |
|---|---|
| Đường dẫn | `/ws` qua gateway (gateway chỉ chuyển tiếp upgrade, `RE.GATEWAY §6`) |
| Xác thực | `auth.token` = access token khi kết nối; sai → ngắt |
| Phòng | `user:<userId>` (thông báo), `conversation:<id>` (tin nhắn) |
| Sự kiện server → client | `notification`, `message` |
| Gửi tin | Qua REST route 4, không nhận tin qua socket (một đường ghi) |

## 4. DDL (đề xuất)

```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(20) NOT NULL CHECK (type IN ('TENANT_LANDLORD','SUPPORT')),
  listing_id uuid,
  last_message_at timestamptz,
  last_message_preview varchar(200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX ix_participants_user ON conversation_participants (user_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_messages_conversation ON messages (conversation_id, created_at DESC);
CREATE TABLE user_snapshots (               -- ghi từ identity.registered, chỉ để hiển thị tên
  user_id uuid PRIMARY KEY,
  full_name varchar(200) NOT NULL,
  role varchar(20) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 5. Đã chốt 2026-11-16

1. Loại hội thoại `TENANT_LANDLORD`, `SUPPORT`; tin 1–2000 ký tự.
2. `SUPPORT`: mọi `ADMIN` thấy; admin trả lời đầu tiên thành người tham gia.
3. Tên hiển thị từ `user_snapshots` (bản chụp `identity.registered`); tài khoản tạo bằng seed không có bản chụp → `"Người dùng"`.
4. WebSocket qua gateway: `RE.GATEWAY §6`.
