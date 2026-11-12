# ADR-0006: Transactional outbox, RabbitMQ, consumer chống trùng và DLQ

| | |
|---|---|
| **Trạng thái** | Proposed |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/SHARED/RE.MESSAGING/`, NFR08 |

## Bối cảnh

Ghi dữ liệu và publish lên RabbitMQ không cùng transaction: RabbitMQ chết thì mất sự kiện, hoặc sự kiện đi mà dữ liệu rollback. RabbitMQ giao ít nhất một lần nên consumer sẽ nhận trùng. Đề có điểm cộng cho hàng đợi, consumer idempotent, DLQ.

## Quyết định

Chúng tôi sẽ:

1. Ghi sự kiện vào `outbox_events` **cùng transaction** với dữ liệu; `OutboxRelay` gửi lên exchange topic `domain.events` sau commit.
2. Consumer ghi `eventId` vào `processed_events` cùng transaction với handler; gặp lại thì bỏ qua.
3. Thử lại 3 lần (200/400/800 ms), quá thì `domain.events.dlx` → `<queue>.dlq`.
4. Topology khai trong `infra/rabbitmq/definitions.json`, nạp bằng `rabbitmq-init`.
5. Hợp đồng sự kiện là JSON Schema trong `contracts/events/` (ADR-0012).

Dùng cho: ghi nhận tiền (payment → rental), mọi thông báo. Giữ chỗ, tạo link dùng HTTP vì cần câu trả lời ngay.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Publish trực tiếp sau commit | Mất sự kiện khi RabbitMQ chết |
| Gọi notification bằng HTTP | Notification dừng làm hỏng luồng chính |

## Hệ quả

**Tích cực**

- Notification hoặc RabbitMQ dừng không chặn đặt cọc; sự kiện gửi bù.

**Tiêu cực / đánh đổi**

- Nhất quán sau cùng: rental thấy `PAID` sau webhook vài giây.
- Relay và consumer chỉ an toàn với một bản sao nếu không khóa.
