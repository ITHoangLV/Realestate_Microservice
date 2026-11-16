# ADR-0002: Mỗi service một database, chung một container PostgreSQL

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `infra/compose/postgres/init/01-create-databases.sh`, ADR-0008 |

## Bối cảnh

Database per service là yêu cầu của kiến trúc. Máy phát triển của nhóm hạn chế RAM; chạy năm instance Postgres tốn tài nguyên.

## Quyết định

Chúng tôi sẽ chạy **một container `postgis/postgis:16-3.5`** chứa năm database `identity_db`, `listing_db`, `rental_db`, `payment_db`, `notification_db`. Mỗi database một user riêng, không phải superuser, `REVOKE CONNECT` từ `PUBLIC`. Không khóa ngoại, không JOIN xuyên database.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Một instance mỗi service | Tốn RAM máy demo |
| Chung database, khác schema | Dễ vô tình JOIN, khó chứng minh ranh giới |

## Hệ quả

**Tích cực**

- Ranh giới dữ liệu được Postgres cưỡng chế: service không kết nối được DB của service khác.
- Một cách migration, một health check.

**Tiêu cực / đánh đổi**

- Container Postgres là điểm lỗi chung (ghi ở Hạn chế, Báo cáo Bảng 7.1).

**Cần theo dõi**

- Khi triển khai thật: tách instance, sao lưu, diễn tập phục hồi.
