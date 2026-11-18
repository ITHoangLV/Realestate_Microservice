# Phase 4 — Bất đồng bộ, notification, chat

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-18 |

**Mục tiêu:** mọi sự kiện đi qua outbox → RabbitMQ → consumer chống trùng; thông báo và nhắn tin chạy.

**Hạn:** M2 — 2026-12-04 cho T4.1–T4.3; T4.4: M3 — 2026-12-09 (dời 2026-11-16).

**Điều kiện xong:** tắt notification, đặt cọc vẫn `201`; bật lại thông báo đến đủ.

---

## T4.1 Binding queue và schema trong code

| | |
|---|---|
| **Người làm** | A — tự giao lại khi cần (trước 2026-11-18: C (chuyển từ A 2026-11-16; A duyệt `definitions.json`)) |
| **Thời lượng** | ~3 giờ (ước 2026-11-16) |
| **Hạn** | M2 — 2026-12-04 |
| **Đọc trước** | `design/SHARED/RE.MESSAGING/` |
| **Phụ thuộc** | T0.4 |

**Các bước:** áp `definitions.json` mới lên môi trường mọi người; kiểm mỗi service phát đúng `eventType` và payload (`expectEventMatchesContract`).

**DoD:** `infra:check` OK; test hợp đồng sự kiện của identity, rental, payment pass.

---

## T4.2 notification: consumer, API thông báo

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | ~8 giờ (ước 2026-11-16) |
| **Hạn** | M2 — 2026-12-04 |
| **Mã WBS** | E6-1, E6-2, E6-3 |
| **Đọc trước** | `design/NOTIFICATION/RE.NOTIFICATION/` |
| **Phụ thuộc** | T4.1 |

**Các bước:**

1. Service từ template, cổng 3005, `notification_db`, queue `notification.events`.
2. `message-templates.ts` + test cho mọi `eventType`.
3. `DomainEventsHandler`, `NotificationService`, 2 route.

**DoD:** Test 1–2, 4–6 ở `RE.NOTIFICATION/Component_Class_Design.md §3` pass.

---

## T4.3 Thử lại, DLQ, kiểm chứng

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | ~5 giờ (ước 2026-11-16) |
| **Hạn** | M2 — 2026-12-04 |
| **Mã WBS** | E6-4 |
| **Phụ thuộc** | T4.2 |

**Kiểm chứng:**

```powershell
docker compose ... stop notification
# đặt cọc, thanh toán: vẫn 201, đơn PAID
docker compose ... start notification
# thông báo đến đủ
# RabbitMQ UI: publish message hỏng vào notification.events → notification.events.dlq
```

**DoD:** Test 3, 7 pass; ảnh chụp DLQ cho báo cáo.

---

## T4.4 Chat và WebSocket

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | ~10 giờ (ước 2026-11-16) |
| **Hạn** | M3 — 2026-12-09; quá hạn thì cắt (mục 1 ở `README.md §6`) |
| **Đọc trước** | `design/NOTIFICATION/RE.CHAT/` |
| **Phụ thuộc** | T4.2, T1.2 (chuyển tiếp WebSocket) |

**Các bước:** `RealtimeGateway` (Socket.IO, xác thực JWT); `ConversationService`, `MessageService`; 4 route.

**DoD:** Test 1–5 ở `RE.CHAT/Component_Class_Design.md §3` pass. Có thể cắt (`README.md §6`).
