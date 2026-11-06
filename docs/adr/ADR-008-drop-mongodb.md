# ADR-008: Bỏ MongoDB, notification dùng PostgreSQL

- Trạng thái: Chấp nhận
- Ngày: 2026-11-06
- Liên quan: `docs/architecture/service-boundaries.md`

## Bối cảnh

Kế hoạch ban đầu dùng MongoDB cho `notification` và `maintenance`. Sau khi chốt phạm vi đồ án (team 3
người): `maintenance` bị bỏ, nên Mongo chỉ còn phục vụ một service. Dữ liệu của notification (lịch sử
thông báo, template, `eventId` đã xử lý) có cấu trúc rõ ràng, không cần schema linh hoạt.

Giữ Mongo nghĩa là thêm một loại DB phải vận hành, một module (Mongoose) phải viết thêm cho template,
một bộ migration hay quy ước khác, và thêm một phần trong script kiểm tra hạ tầng.

## Quyết định

- Bỏ container `mongo` khỏi compose, bỏ biến `MONGO_*`, `NOTIFICATION_MONGO_*`, `MAINTENANCE_MONGO_*`.
- Thêm `notification_db` / `notification_user` vào script init Postgres, cùng cách với 4 DB hiện có.
- Notification dùng TypeORM của template như mọi service khác. Nội dung linh hoạt (tham số template)
  lưu ở cột `jsonb`.

## Hệ quả

- Mọi service dùng cùng một công nghệ DB, cùng cách migration, cùng health check. Dễ cho 3 người.
- Vẫn **database per service**: mỗi service một DB và một user riêng. Dùng chung _instance_ Postgres là
  quyết định vận hành, không phải dùng chung dữ liệu.
- Mất điểm "mỗi service chọn DB phù hợp" khi trình bày. Có thể giải thích bằng ADR này: biết lúc nào
  **không** nên đa dạng hóa công nghệ cũng là một quyết định kiến trúc.
- Thay đổi hạ tầng đã thực hiện ngay sau khi chốt ADR (trước khi có service nào), để không còn container
  chạy mà không ai dùng. Máy đã chạy hạ tầng cũ phải xóa volume `realestate_postgres_data` (để script init
  tạo `notification_db`) và `realestate_mongo_data`.
