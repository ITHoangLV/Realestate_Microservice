# ADR-007: Object storage cho môi trường dev (Silo, API S3)

- Trạng thái: Chấp nhận
- Ngày: 2026-11-05
- Giai đoạn: GĐ1 (hạ tầng)

## Bối cảnh

Hệ thống cần lưu ảnh tin đăng, ảnh QR ngân hàng, chứng từ thanh toán và giấy tờ người thuê.
Kế hoạch ban đầu dùng MinIO. Tháng 9/2026 MinIO gỡ image khỏi Docker Hub; `quay.io/minio/minio`
yêu cầu đăng nhập nên không kéo được ở môi trường dev. Đã kiểm tra thực tế: `docker manifest inspect`
trên `minio/minio` và `quay.io/minio/minio` đều thất bại.

## Quyết định

- Dùng **Silo** (`docker.io/pgsty/silo`, fork cộng đồng của MinIO, tương thích S3) cho dev.
- Ghim tag `RELEASE.2026-10-26T00-00-00Z` (đã `docker manifest inspect` và `docker pull` thành công),
  không dùng `latest`.
- Digest đã ghi nhận (`docker inspect --format "{{index .RepoDigests 0}}" <image>`):
  `pgsty/silo@sha256:7bb2aff6b89efe1cb1303c10fc21d579447434ed06649ac9ec05a5e2dbf30ad7`.
  Nếu cần ghim chặt hơn tag, dùng `image: docker.io/pgsty/silo@sha256:7bb2aff6...` trong compose.
- Ứng dụng chỉ giao tiếp qua **API S3** (AWS SDK, `S3_FORCE_PATH_STYLE=true`), biến môi trường dạng `S3_*`.
  Không có mã nào phụ thuộc vào tên hay công cụ riêng của MinIO/Silo.
- Container vẫn đọc `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (image giữ tương thích).
- Không dùng `mc`/`mcli` để tạo bucket. Mỗi service tự tạo bucket của mình khi khởi động bằng
  AWS SDK (`CreateBucket` chạy lại không lỗi). Việc này làm ở GĐ2 (template) và GĐ6 trở đi.

## Hệ quả

- Image của bên thứ ba: độ tin cậy thấp hơn bản chính thức, có rủi ro không còn được cập nhật.
- Chỉ dùng ở dev/demo: cổng 9000/9001 bind `127.0.0.1`, không mở ra mạng.
- Vì code chỉ phụ thuộc S3, có thể thay bằng Garage hoặc RustFS bằng cách đổi image và biến `S3_*`,
  không sửa code nghiệp vụ.
- Môi trường production cần quyết định riêng (dịch vụ S3 được quản lý hoặc giải pháp tự vận hành).
