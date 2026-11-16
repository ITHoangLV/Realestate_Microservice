# ADR-0003: Gateway dựng từ template NestJS, xác thực JWT RS256 tại gateway và service

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `design/SHARED/RE.GATEWAY/`, `standards/security-policy.md`, Báo cáo v2 §4.6 |

## Bối cảnh

Đề yêu cầu gateway là điểm vào duy nhất, không chứa nghiệp vụ; điểm cộng cho JWT tại gateway. Identity phát JWT; nếu mọi service phải hỏi identity để kiểm token thì identity thành điểm nghẽn.

## Quyết định

Chúng tôi sẽ:

1. Dựng `api-gateway` từ `_template-nest` (cổng 8080), định tuyến theo một file cấu hình.
2. Identity ký access token **RS256** bằng khóa riêng (15 phút); gateway **và** mỗi service kiểm bằng khóa công khai, không gọi identity.
3. Gateway kiểm vai trò mức tuyến, sinh `X-Request-ID`, rate limit, trả `404` cho `/internal/*`. Kiểm chủ sở hữu ở service.
4. Refresh token 7 ngày, xoay vòng theo họ, chỉ identity xử lý; gateway không refresh hộ.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Gateway gọi identity kiểm token mỗi request | Identity thành điểm nghẽn và điểm lỗi |
| HS256 dùng chung bí mật | Service nào cũng ký được token |
| Chỉ kiểm ở gateway, service tin header | Cần cơ chế chống giả header; template đã có `JwtAuthGuard` |

## Hệ quả

**Tích cực**

- Identity dừng thì token còn hạn vẫn dùng được.

**Tiêu cực / đánh đổi**

- Access token không thu hồi được trước hạn (tối đa 15 phút).
- `/internal/*` tin mạng Docker.

**Cần theo dõi**

- Thư viện proxy, timeout, rate limit (`RE.GATEWAY/API_Spec.md §6`).
