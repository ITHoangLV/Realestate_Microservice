# ADR-0008: Bỏ MongoDB, notification dùng PostgreSQL với cột jsonb

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-06 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | Thay số cũ `docs/adr/ADR-008-drop-mongodb.md`, ADR-0002 |

## Bối cảnh

Kế hoạch dùng MongoDB cho notification và maintenance. Maintenance đã bỏ (ADR-0001), Mongo chỉ còn một service. Dữ liệu notification có cấu trúc rõ.

## Quyết định

Chúng tôi sẽ bỏ container `mongo` và biến `MONGO_*`; thêm `notification_db` / `notification_user` vào script init Postgres. Notification dùng TypeORM như mọi service; nội dung linh hoạt lưu ở cột `jsonb`.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Giữ MongoDB | Thêm một loại DB, một module, một cách migration cho ba người |

## Hệ quả

**Tích cực**

- Một công nghệ DB, một cách migration, một health check.

**Tiêu cực / đánh đổi**

- Mất điểm "mỗi service chọn DB phù hợp" khi trình bày; giải thích bằng ADR này.

**Cần theo dõi**

- Máy đã chạy hạ tầng cũ phải xoá volume `realestate_postgres_data`, `realestate_mongo_data`.
