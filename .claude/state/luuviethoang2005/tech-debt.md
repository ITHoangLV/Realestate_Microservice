---
dev: luuviethoang2005
updated: 2026-11-17 (thêm #6–#8)
---

## Nợ kỹ thuật

> Mỗi khoản phát sinh ghi một dòng. Không xóa khi đã xử lý — đổi "Trạng thái" sang `resolved`.

| # | Mô tả | Ưu tiên | Vị trí | Công sức | Trạng thái | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | `jwt.guard.ts` chưa có spec cạnh file (hook TDD `warn` nhắc khi sửa) | Thấp | `services/_template-nest/src/common/auth/jwt.guard.ts` (và bản chép ở `services/identity`) | S | open | Đã phủ bằng `test/auth.e2e-spec.ts` (không đổi sau khi tách `JwtTokenVerifier`); logic kiểm token có spec riêng `jwt-token.verifier.spec.ts`. Thêm `jwt.guard.spec.ts` (public bỏ qua, 503 `AUTH_NOT_CONFIGURED` trước 401 thiếu token) khi có dịp |
| 2 | `services/api-gateway/README.md` còn là README của template (mô tả sai thành phần) | Thấp | `services/api-gateway/README.md` | S | open | Viết README riêng (route, biến môi trường, cách chạy) sau T1.3 |
| 3 | Gateway không giới hạn kích thước body request | TB | `src/main.ts` (`bodyParser: false`), `proxy.middleware.ts` | M | open | Cần để giữ body thô cho webhook payOS; thêm trần theo route (đếm byte khi stream) nếu có yêu cầu bảo mật |
| 4 | Tắt gateway khi còn WebSocket mở: `app.close()` chờ socket đã nâng cấp | Thấp | `src/app.setup.ts`, `proxy.middleware.ts` | S | open | Theo dõi socket upgrade và đóng chủ động khi shutdown (T1.3 / Phase 4) |
| 5 | Rate limit trong bộ nhớ, một instance | Thấp | `src/gateway/throttle.config.ts` | M | open | Phạm vi đồ án (một gateway); muốn nhiều instance: storage Redis cho throttler. Đã ghi ở "Hạn chế" của walkthrough |
| 6 | Request bị gateway từ chối (401/403/404 từ `AccessGuard`) không được đếm rate limit, vì throttler đứng sau `AccessGuard` | Thấp | `src/gateway/gateway.controller.ts`, `gateway-throttler.guard.ts` | M | accepted | Đã đo: 350 request token sai → 350 lần 401, không có 429. Chỉ tốn CPU gateway, không tới service. Chấp nhận 2026-11-17 (hệ quả của quyết định rate limit sau `AccessGuard`, `RE.GATEWAY §3.2`). Nếu cần chặn: thêm bộ đếm IP riêng cho request bị từ chối |
| 7 | **Ghi chú cho phần ghép frontend:** lưu lượng ẩn danh đếm theo IP (`RATE_LIMIT_IP`=100/60 giây); nếu Next.js gọi API công khai từ SSR thì mọi khách chưa đăng nhập dùng chung IP máy chủ Next.js | TB | `.env`: `RATE_LIMIT_IP`; `src/gateway/throttle.config.ts` | S | accepted | Quyết định 2026-11-17: giữ nguyên. Gọi API công khai từ **trình duyệt** (IP từng khách). Nếu bắt buộc SSR thì tăng `RATE_LIMIT_IP`. Không cần đổi code |
| 8 | Test của gateway lặp helper: tạo khóa RSA, ký JWT, mở/đóng server giả (theo dõi và hủy socket) ở 4–5 file | Thấp | `services/api-gateway/test/gateway*.e2e-spec.ts`, `src/gateway/*.spec.ts` | S | open | Gom vào `test/helpers/` (ví dụ `jwt.ts`, `http-server.ts`) khi có dịp; không ảnh hưởng hành vi. Hoãn theo quyết định 2026-11-17 |

Trước Phase 7, A đọc gộp `state/*/tech-debt.md` để đưa vào mục "Hạn chế" của báo cáo.
