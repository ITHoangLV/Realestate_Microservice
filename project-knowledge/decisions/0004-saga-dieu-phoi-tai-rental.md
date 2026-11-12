# ADR-0004: Luồng đặt cọc dùng saga điều phối tập trung tại rental-service

| | |
|---|---|
| **Trạng thái** | Proposed |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/RENTAL/RE.DEPOSIT_SAGA/`, ADR-0006, Báo cáo v2 §4.7.3 |

## Bối cảnh

Đặt cọc chạm ba database: giữ chỗ ở listing, tạo đơn ở rental, tạo link và ghi tiền ở payment. Không có transaction chung. Có các ca khó: hai người cùng đặt, tạo link lỗi sau khi đã giữ chỗ, hết 10 phút, webhook trùng, tiền đến muộn.

## Quyết định

Chúng tôi sẽ dùng **saga điều phối**, rental là bên điều phối và sở hữu máy trạng thái, `saga_log` và **mọi đồng hồ** (BR-18):

1. Giữ chỗ (listing, `UPDATE` có điều kiện) → tạo đơn `PENDING_PAYMENT` → tạo payment order (payment → payOS).
2. Bù trừ: nhả chỗ, hủy link payOS, hoàn tiền.
3. Lỗi không rõ kết quả: ghi `saga_log`, `SagaReconcileJob` đối soát.
4. Ghi nhận tiền đi bằng sự kiện `payment.deposited` (ADR-0006), không gọi ngược đồng bộ.
5. Hết hạn: hủy link **trước**, nhả chỗ sau (BR-09).

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Choreography thuần sự kiện | Luồng rải nhiều nơi, khó giải thích; giữ chỗ cần câu trả lời ngay |
| Two-phase commit | Khóa lâu, HTTP và Postgres không hỗ trợ tốt |
| Payment giữ đồng hồ | Hai service cùng giữ hạn dễ lệch |

## Hệ quả

**Tích cực**

- Logic luồng ở một chỗ; mọi hạn ở một chỗ.

**Tiêu cực / đánh đổi**

- Rental dừng thì không đặt cọc được; listing dừng cũng vậy (lời gọi đồng bộ).
- Phụ thuộc hai chiều rental ⇄ payment (payment hỏi rental điều kiện rút).

**Cần theo dõi**

- Circuit breaker cho lời gọi từ rental (mở rộng X1).
