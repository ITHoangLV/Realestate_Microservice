# RE.VIEWING — Luồng xử lý

| | |
|---|---|
| **Chức năng** | Đăng ký xem nhà, từ chối, hủy, xác nhận đã xem |
| **Tham chiếu** | `API_Spec.md`, `Component_Class_Design.md`, `RE.CHAT` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-16 — v1.1 |

## 1. Luồng

```mermaid
sequenceDiagram
    participant T as Người thuê
    participant R as rental
    participant L as listing
    participant N as notification
    participant O as Chủ trọ
    T->>R: POST /viewings {listingId}
    R->>L: GET /internal/listings/:id
    L-->>R: ownerId, title, approvalStatus
    R->>R: BEGIN, INSERT viewings, outbox viewing-requested, COMMIT
    R-->>T: 201 REQUESTED
    R--)N: rental.viewing-requested
    N--)O: thông báo, yêu cầu hiện trong danh sách người đăng ký xem
    Note over T,O: Hai bên bấm Nhắn tin, chốt ngày giờ trong chat (RE.CHAT)
    T->>R: POST /viewings/:id/confirm-viewed
    R-->>T: 200 CONFIRMED
    R--)N: rental.viewing-confirmed
```

```mermaid
stateDiagram-v2
    [*] --> REQUESTED: người thuê đặt lịch
    REQUESTED --> CONFIRMED: người thuê xác nhận đã xem
    REQUESTED --> DECLINED: chủ trọ từ chối
    REQUESTED --> CANCELLED: người thuê hủy (TENANT)
    REQUESTED --> CANCELLED: tin có đơn PAID của người khác (LISTING_DEPOSITED)
```

`CONFIRMED`, `DECLINED`, `CANCELLED` là trạng thái kết thúc. Chủ trọ không có bước đồng ý lịch; ngày giờ xem không lưu trong rental.

## 2. Tự hủy khi tin có người đặt cọc

```mermaid
sequenceDiagram
    participant P as payment
    participant R as rental
    participant N as notification
    P--)R: payment.deposited
    R->>R: BEGIN, đơn PENDING_PAYMENT → PAID
    R->>R: UPDATE viewings → CANCELLED (LISTING_DEPOSITED) WHERE listing, REQUESTED, người khác
    R->>R: outbox viewing-cancelled cho từng yêu cầu, COMMIT
    R--)N: rental.viewing-cancelled
    N--)N: báo từng người thuê bị hủy
```

Hủy nằm cùng transaction với `PAID`: không có trạng thái đơn đã `PAID` mà yêu cầu xem của người khác còn mở. Đơn chưa `PAID` (đang giữ chỗ 10 phút) không hủy gì.

## 3. Lỗi

| Điểm lỗi | Xử lý |
|---|---|
| Listing dừng khi đặt lịch | `503`/`504`, chưa ghi gì |
| Notification dừng | Lịch vẫn tạo; thông báo đến sau |
| Notification dừng khi tự hủy | Yêu cầu vẫn `CANCELLED`; sự kiện chờ trong outbox/queue |

## 4. Số truy vấn

Đặt lịch 2 (insert + outbox); chuyển trạng thái 2, cộng 1 khi 0 dòng. Tự hủy trong handler `payment.deposited`: thêm 1 `UPDATE ... RETURNING` + N câu outbox (một câu cho mỗi yêu cầu bị hủy).
