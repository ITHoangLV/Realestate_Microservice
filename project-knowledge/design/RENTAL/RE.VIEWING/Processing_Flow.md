# RE.VIEWING — Luồng xử lý

| | |
|---|---|
| **Chức năng** | Đặt lịch, phản hồi, xác nhận đã xem |
| **Tham chiếu** | `API_Spec.md`, `Component_Class_Design.md` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Luồng

```mermaid
sequenceDiagram
    participant T as Người thuê
    participant R as rental
    participant L as listing
    participant N as notification
    participant O as Chủ trọ
    T->>R: POST /viewings
    R->>L: GET /internal/listings/:id
    L-->>R: ownerId, title, approvalStatus
    R->>R: BEGIN, INSERT viewings, outbox viewing-requested, COMMIT
    R-->>T: 201 REQUESTED
    R--)N: rental.viewing-requested
    N--)O: thông báo
    O->>R: POST /viewings/:id/respond ACCEPT
    R-->>O: 200 ACCEPTED
    T->>R: POST /viewings/:id/confirm-viewed
    R-->>T: 200 CONFIRMED
```

```mermaid
stateDiagram-v2
    [*] --> REQUESTED
    REQUESTED --> ACCEPTED: chủ trọ đồng ý
    REQUESTED --> DECLINED: chủ trọ từ chối
    ACCEPTED --> CONFIRMED: người thuê xác nhận đã xem
```

## 2. Lỗi

| Điểm lỗi | Xử lý |
|---|---|
| Listing dừng khi đặt lịch | `503`/`504`, chưa ghi gì |
| Notification dừng | Lịch vẫn tạo; thông báo đến sau |

## 3. Số truy vấn

Đặt lịch 2 (insert + outbox); chuyển trạng thái 2, cộng 1 khi 0 dòng.
