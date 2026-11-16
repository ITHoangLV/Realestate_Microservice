# ADR-0009: Đặt cọc qua payOS vào ví trung gian, chi tiền thủ công có chứng từ

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/PAYMENT/`, BR-07 đến BR-17, Báo cáo v2 Bảng 3.14 |

## Bối cảnh

Phương án ban đầu: người thuê quét QR tài khoản quản trị viên, quản trị viên đối chiếu sao kê rồi xác nhận tay. Không có bằng chứng thanh toán tự động, phụ thuộc tốc độ quản trị viên. Chuyển cọc thẳng cho chủ trọ thì người thuê chịu rủi ro.

## Quyết định

Chúng tôi sẽ:

1. Thu cọc qua **payOS** (link, VietQR), ghi nhận **chỉ** bằng webhook đúng chữ ký, mã đơn, số tiền, mã giao dịch chưa ghi nhận (BR-08). `returnUrl` không có giá trị xác nhận.
2. Tiền nằm ở **ví trung gian** (`admin_wallet`); mọi biến động có một dòng `wallet_transactions`.
3. Giữ chỗ 10 phút = hạn link payOS (BR-07). Hoàn 70% trong 48 giờ (BR-12). Giải ngân khi nhận phòng hoặc sau 3 ngày (BR-13).
4. Hoàn và rút bằng **chuyển khoản tay** của quản trị viên; ví chỉ bị trừ khi có chứng từ, `sha256` duy nhất (BR-17).
5. Tiền đến sau khi hết hạn không phải đặt cọc: ghi `late_payments`, yêu cầu hoàn 100% (BR-10).

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Quản trị viên xác nhận tay tiền vào | Không có bằng chứng tự động, chậm |
| Chi hộ tự động | Ngoài phạm vi, cần hợp đồng với cổng thanh toán |
| Sổ kép `ledger_entries` (`nghiep-vu-dat-coc-payos.md`) | Báo cáo v2 chọn ví một tài khoản + nhật ký giao dịch `[cần xác nhận]` |

## Hệ quả

**Tích cực**

- Có bằng chứng thanh toán; chống ghi trùng bằng ràng buộc duy nhất.

**Tiêu cực / đánh đổi**

- Demo phụ thuộc payOS và đường hầm webhook.
- Người nhận tiền phải chờ quản trị viên.

**Cần theo dõi**

- payOS có gửi webhook khi link đã hủy mà tiền vẫn vào không.
- Tỉ lệ tiền đến muộn.
