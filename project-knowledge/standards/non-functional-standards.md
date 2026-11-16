# Quy ước phi chức năng

> Hiệu năng, truy vấn, ranh giới request. Áp dụng cho mọi service.
> Độ tin cậy liên service ở `reliability-standard.md`. Bảng NFR đầy đủ ở Báo cáo v2 Bảng 2.2.
> Tài liệu sống: siết hoặc nới ngưỡng qua PR vào file này.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 0. Yêu cầu phi chức năng của đề tài

| Mã | Yêu cầu | Tiêu chí | Nơi kiểm chứng |
|---|---|---|---|
| NFR01 | Tính đúng dữ liệu | Mỗi BĐS tối đa một đơn hoạt động; mỗi mã giao dịch payOS ghi nhận một lần; mỗi đơn một kết cục; số dư ví = tổng vào − tổng ra | E1, E10, Báo cáo T10 |
| NFR02 | Chịu lỗi | Timeout mọi lời gọi; chỉ retry lệnh idempotent; `4xx` khác `503/504`; bù trừ trả BĐS về `AVAILABLE` | E2, E8 |
| NFR03 | Bảo mật | JWT RS256 ở gateway và service; kiểm vai trò, chủ sở hữu ở service; webhook kiểm chữ ký; `/internal` không mở ra ngoài | Báo cáo T15–T17 |
| NFR04 | Bảo trì | Mỗi service một module nghiệp vụ; phần kỹ thuật từ template | Review |
| NFR05 | Tái lập triển khai | Dockerfile riêng, migration, init DB, topology RabbitMQ; khởi động một lệnh | Máy sạch ≤ 10 phút |
| NFR06 | Quan sát | `X-Request-ID` xuyên service; log JSON có `correlationId`; `/health` | Log |
| NFR07 | Hiệu năng có giới hạn | Đặt cọc trả link ≤ 8 giây; đo p95 và thời gian webhook → `PAID` | E1 |
| NFR08 | Cô lập chức năng phụ | Notification, RabbitMQ lỗi không chặn giữ chỗ, ghi nhận tiền | E3 |

## 1. Hiệu năng và truy vấn

### Nguyên tắc

- **Chi phí tăng theo dữ liệu.** API trả tập hợp phải có chặn trên ngay từ thiết kế.
- **Số lần gọi DB là hằng số**, không tăng theo số bản ghi.
- **Lọc ở nơi có dữ liệu.** Đẩy lọc, sắp xếp, khoảng cách xuống Postgres/PostGIS.
- **Đo trước khi tối ưu.**

### Phân trang

- **MUST** phân trang mọi API danh sách theo `api-convention.md §4`.
- **MUST** sắp xếp tường minh, có khóa phụ ổn định (`created_at DESC, id DESC`).
- **NEVER** trả cả bảng.

### Số truy vấn DB trong một request

| Loại endpoint | Tối đa | Gồm |
|---|---|---|
| Đọc chi tiết | **3** | 1 bản ghi chính + tối đa 2 phụ trợ |
| Đọc danh sách có phân trang | **4** | 1 count + 1 data + tối đa 2 phụ trợ |
| Ghi | **6** | kiểm tra tồn tại + ràng buộc + ghi chính + phụ trợ (outbox, `saga_log`, `wallet_transactions`) |
| Ghi có thay đổi tiền (ví, giao dịch ví, lệnh chi, `audit_log`) | **8** | như dòng trên + giao dịch ví, cập nhật ví, nhật ký thao tác trong cùng transaction |

**Nguồn:** quy ước nhóm (Báo cáo v2 không quy định số truy vấn); nhóm xác nhận 2026-11-12. Siết hoặc nới qua PR vào file này.

- Tính trong **một service**.
- Không đạt → **DỪNG**, nêu lý do và số truy vấn dự kiến, chờ xác nhận. Ngoại lệ đã duyệt ghi ở `Processing_Flow.md` của chức năng.
- **MUST** đếm bằng log SQL của TypeORM (`logging: ['query']`) trước khi coi endpoint là xong.
- **NEVER** truy vấn trong vòng lặp.

### Lời gọi liên service trong một request

- Số lời gọi là **hằng số**.
- **NEVER** gọi service khác trong vòng lặp; cần N bản ghi → API batch hoặc bản chụp.
- **NEVER** gọi HTTP khi đang giữ transaction.

### Index

- **MUST** có index cho cột lọc, sắp xếp, join trong truy vấn danh sách — thêm qua migration.
- Tìm theo bán kính: index GiST trên `listings.location`; kiểm bằng `EXPLAIN` (Báo cáo T05).
- Job quét hạn: index trên `(status, expires_at)`, `(status, auto_release_at)` của `deposits`.

### Ranh giới request đồng bộ

- **NEVER** làm tác vụ dài trong request người dùng (gửi email, xử lý ảnh). Tách sang outbox + consumer hoặc job.
- Việc phụ không chặn luồng chính (NFR08).
- Ảnh tải thẳng lên S3 bằng presigned URL, không đi qua service.
