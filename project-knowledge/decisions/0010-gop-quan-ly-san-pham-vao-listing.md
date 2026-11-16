# ADR-0010: Gộp quản lý sản phẩm của chủ trọ vào listing-service

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/LISTING/RE.LISTING/`, Báo cáo v2 §4.2.2 |

## Bối cảnh

Chủ trọ thêm, sửa, ẩn, xóa sản phẩm. Câu hỏi: có tách `products-service` riêng không.

## Quyết định

Chúng tôi sẽ **gộp vào listing**. Sản phẩm và tin đăng là cùng một bản ghi `listings`: vừa chứa thông tin chủ trọ nhập, vừa chứa trạng thái BĐS.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Tách `products-service` | Giữ chỗ phải đọc ở một service, ghi trạng thái ở service khác: mất tính nguyên tử của `UPDATE` có điều kiện; xóa sản phẩm phải hỏi chéo đơn đang hoạt động |

## Hệ quả

**Tích cực**

- Giữ chỗ là một câu lệnh. Cùng chủ sở hữu dữ liệu, cùng nhịp thay đổi, cùng người phụ trách (B).

**Cần theo dõi**

- Nếu cần danh mục phức tạp (nhiều loại hình, thuộc tính động) thì xem xét tách lại.
