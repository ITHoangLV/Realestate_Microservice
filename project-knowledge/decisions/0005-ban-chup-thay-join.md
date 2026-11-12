# ADR-0005: Lưu bản chụp dữ liệu thay cho JOIN và lời gọi lặp

| | |
|---|---|
| **Trạng thái** | Proposed |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/RENTAL/RE.DEPOSIT_SAGA/API_Spec.md §6`, BR-04 |

## Bối cảnh

Đơn đặt cọc cần tiền cọc, tiêu đề tin, chủ trọ; payment cần số tiền và người nhận. Không JOIN được qua database. Gọi listing mỗi lần đọc đơn làm tăng phụ thuộc đồng bộ. Chủ trọ có thể sửa giá cọc sau khi đã có đơn.

## Quyết định

Chúng tôi sẽ lưu **bản chụp** tại thời điểm tạo đơn: `amount_vnd`, `listing_title`, `owner_id` ở `deposits`; `amount_vnd`, `tenant_id`, `owner_id`, `listing_title` ở `payment_orders`. Số tiền cọc **không** nhận từ client. Sự kiện mang đủ `tenantId`, `ownerId` để notification không phải gọi lại.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Gọi listing mỗi lần đọc đơn | Listing dừng thì không xem được đơn |
| Nhận số tiền từ client | Vi phạm BR-04 |

## Hệ quả

**Tích cực**

- Sửa giá không ảnh hưởng đơn đã tạo. Xem đơn, hoàn, rút không phụ thuộc listing.

**Tiêu cực / đánh đổi**

- Bản chụp không tự cập nhật khi đổi tiêu đề.
