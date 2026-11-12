# RE.CHAT — Luồng xử lý

| | |
|---|---|
| **Chức năng** | Mở hội thoại, gửi và nhận tin, kênh hỗ trợ |
| **Tham chiếu** | `API_Spec.md`, `Component_Class_Design.md` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Gửi tin

```mermaid
sequenceDiagram
    participant A as Người thuê
    participant G as api-gateway
    participant N as notification
    participant DB as notification_db
    participant B as Chủ trọ (socket)
    B->>G: kết nối /ws + token
    G->>N: nâng cấp WebSocket
    N->>N: kiểm token, join user:<id>, conversation:<id>
    A->>G: POST /api/v1/conversations/:id/messages
    G->>N: chuyển tiếp
    N->>DB: kiểm người tham gia, BEGIN, INSERT messages, cập nhật last_message, COMMIT
    N-->>A: 201
    N->>B: emit 'message'
```

## 2. Kênh hỗ trợ

Người dùng mở hội thoại `SUPPORT` để hỏi quản trị viên, ví dụ khi đã chuyển tiền nhưng đơn hết hạn (BR-10). Quản trị viên tra `late_payments` ở payment rồi xử lý yêu cầu hoàn `SYSTEM` (`RE.PAYOUT`). Kênh chat không đổi dữ liệu tiền.

## 3. Khi phụ thuộc lỗi

| Lỗi | Kết quả |
|---|---|
| Notification dừng | Không nhắn tin được; luồng đặt cọc không ảnh hưởng |
| Socket rớt | Tin vẫn lưu; client tải lại bằng route 3 |

## 4. Số truy vấn

Gửi tin: kiểm người tham gia (1) + insert + update (2) = 3. Danh sách tin: 2.
