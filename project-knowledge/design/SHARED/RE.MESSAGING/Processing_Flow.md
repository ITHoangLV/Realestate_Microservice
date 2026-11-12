# RE.MESSAGING — Luồng xử lý

| | |
|---|---|
| **Chức năng** | Phát qua outbox, nhận chống trùng, thử lại, DLQ, RabbitMQ dừng |
| **Tham chiếu** | `API_Spec.md`, `Component_Class_Design.md`, ADR-0006 |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Phát và nhận

```mermaid
sequenceDiagram
    participant S as Service phát
    participant DB as DB phát
    participant R as OutboxRelay
    participant MQ as domain.events
    participant Q as queue của bên nghe
    participant C as EventConsumer
    participant DB2 as DB bên nghe
    S->>DB: BEGIN, ghi dữ liệu, INSERT outbox_events, COMMIT
    loop mỗi OUTBOX_POLL_INTERVAL_MS
        R->>DB: chọn published_at IS NULL theo created_at, tối đa 50
        R->>MQ: publish (routing key = eventType)
        R->>DB: published_at = now()
    end
    MQ->>Q: theo binding
    Q->>C: message
    C->>DB2: BEGIN, INSERT processed_events(eventId)
    alt eventId đã có
        C->>DB2: ROLLBACK, ack
    else
        C->>C: handler(event, manager)
        C->>DB2: COMMIT, ack
    end
```

Giao **ít nhất một lần**. Relay gửi xong mà chưa kịp ghi `published_at` thì lần sau gửi lại; consumer chống trùng bằng `processed_events` nên kết quả như một lần.

## 2. Thử lại và DLQ

```mermaid
flowchart LR
    A[Handler lỗi] --> B{Lần thử ≤ 3?}
    B -- có --> C[Chờ 200/400/800 ms, thử lại]
    B -- không --> D[nack không requeue]
    E[NonRetryableEventError] --> D
    D --> F[domain.events.dlx] --> G[queue.dlq, header x-death]
```

Message trong DLQ không tự xử lý lại; người phụ trách kiểm tra thủ công.

## 3. Bảng xử lý lỗi

| Điểm lỗi | Hậu quả | Xử lý |
|---|---|---|
| RabbitMQ dừng trước khi relay gửi | Sự kiện nằm trong outbox | Relay gửi bù khi RabbitMQ chạy lại (E3) |
| Service phát chết sau commit | Sự kiện nằm trong outbox | Khởi động lại, relay gửi tiếp |
| Bên nghe dừng | Message nằm trong queue | Bật lại thì xử lý |
| Bên nghe chết giữa handler | Transaction rollback, message chưa ack | Giao lại, chạy lại từ đầu |
| Sự kiện đến sai thứ tự hoặc muộn | Trạng thái hiện tại không khớp | `UPDATE` có điều kiện được 0 dòng → bỏ qua |
| Message hỏng | | DLQ (E9) |

## 4. Bất biến

| Bất biến | Kiểm tra |
|---|---|
| Không còn sự kiện chưa gửi khi RabbitMQ đã chạy | `select count(*) from outbox_events where published_at is null` = 0 |
| Mỗi sự kiện xử lý một lần mỗi bên nghe | Số dòng `processed_events` = số sự kiện duy nhất |
| DLQ chỉ chứa message cố ý làm hỏng | RabbitMQ UI |
