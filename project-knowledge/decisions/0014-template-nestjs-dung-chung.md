# ADR-0014: Mọi service copy từ một template NestJS, không dùng package dùng chung; payment viết bằng NestJS

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `services/_template-nest/README.md`, `design/SHARED/RE.SERVICE_TEMPLATE/`, Báo cáo v2 Bảng 3.14 |

## Bối cảnh

Mọi service cần cùng phần kỹ thuật: log JSON, correlation ID, khung lỗi, JWT, idempotency, client HTTP nội bộ, outbox/inbox, S3, health, Swagger, Dockerfile. Kế hoạch ban đầu viết payment bằng Spring Boot.

## Quyết định

Chúng tôi sẽ:

1. Giữ `services/_template-nest` chứa **chỉ** phần kỹ thuật; service mới copy từ đây (README §1).
2. Không tạo package dùng chung trong workspace: mỗi service có bản sao của mình, sửa phần chung thì sửa template trước rồi chép.
3. Viết payment bằng **NestJS** như các service khác.
4. Không đưa entity, mã lỗi nghiệp vụ, client tới service cụ thể vào template.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Package dùng chung `@realestate/common` | Đổi package làm mọi service phải build lại cùng lúc; dễ lọt nghiệp vụ vào phần chung |
| Payment bằng Spring Boot | Hai ngôn ngữ, không dùng chung template |

## Hệ quả

**Tích cực**

- Service tự đứng được, build và triển khai riêng.

**Tiêu cực / đánh đổi**

- Sửa lỗi ở phần chung phải chép sang nhiều service.

**Cần theo dõi**

- Lệch giữa các bản sao; A rà khi duyệt PR chạm `src/common`.
