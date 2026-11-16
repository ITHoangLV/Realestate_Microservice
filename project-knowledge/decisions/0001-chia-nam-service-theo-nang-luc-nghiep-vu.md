# ADR-0001: Chia năm service nghiệp vụ và một gateway theo năng lực nghiệp vụ

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `architecture.md §3`, Báo cáo v2 §4.2, Bảng 3.14, ADR-0010 |

## Bối cảnh

Tài liệu chốt Tech Stack ban đầu viết cho nhóm năm người: sáu service lõi (có `mobility`, `maintenance`) và hai service tùy chọn. Nhóm thực hiện có ba người. Đề yêu cầu mỗi service có mã nguồn và dữ liệu riêng, luồng qua ít nhất hai service.

## Quyết định

Chúng tôi sẽ chia thành **identity, listing, rental, payment, notification** và **api-gateway**:

- Gộp `mobility` vào listing: PostGIS trong `listing_db` đã tính được khoảng cách.
- Bỏ `maintenance`: ngoài luồng chính.
- Để trợ lý chat (`assistant`) sau, làm nếu còn thời gian.
- Giữ rental và payment **tách riêng**: luồng đặt cọc giữa hai service là nơi thể hiện saga, sự kiện và bù trừ. Một người (C) giữ cả hai.

Tiêu chí: năng lực nghiệp vụ, cụm dữ liệu, ranh giới transaction, vòng đời dữ liệu, mức độ đúng, phụ thuộc ngoài, cô lập lỗi, quy mô nhóm (Báo cáo Bảng 4.2).

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Sáu service lõi + hai tùy chọn | Không đủ người |
| Gộp rental và payment | Mất phần saga qua nhiều service; tiền và đơn có mức độ đúng khác nhau |
| Tách `mobility` riêng | Thêm một lời gọi đồng bộ mà PostGIS làm được tại chỗ |

## Hệ quả

**Tích cực**

- Mỗi người một vùng rõ ràng: A (gateway, identity, notification), B (listing), C (rental, payment).
- Tiền được cô lập ở payment để áp idempotency, ràng buộc duy nhất, chứng từ.

**Tiêu cực / đánh đổi**

- Nhiều lời gọi mạng, sự kiện và việc vận hành hơn một ứng dụng; với tải đồ án lợi ích chưa chắc bù chi phí.
- C gánh phần khó nhất.

**Cần theo dõi**

- Tiến độ của C (rental + payment); cắt phạm vi theo `implementation/README.md §6` nếu trễ.
