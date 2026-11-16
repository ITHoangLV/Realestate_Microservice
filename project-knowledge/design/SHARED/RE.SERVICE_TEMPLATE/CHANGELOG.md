# RE.SERVICE_TEMPLATE — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.2] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv
- **summary:** Tách `JwtTokenVerifier` khỏi `JwtAuthGuard` để gateway dùng chung.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `Component_Class_Design.md` §1, §2, §4, §5 | Sửa |

- **Cũ:** việc kiểm token là hàm `private` bên trong `JwtAuthGuard`.
- **Mới:** provider `JwtTokenVerifier` trong `common/auth/`, `JwtAuthGuard` gọi lại; hành vi và mã lỗi không đổi.
- **Lý do:** `AccessGuard` của api-gateway cần kiểm token theo mức truy cập từng route; viết bản riêng sẽ là bản song song của phần đã có trong template (ADR-0014).

**2.** Làm rõ `details.outcome` qua nhiều lần thử.

| # | Vị trí | Loại |
|---|---|---|
| 2 | `API_Spec.md` §3 | Sửa |

- **Cũ:** "`NOT_EXECUTED` chỉ khi chưa gửi được request, còn lại `UNKNOWN`" (không nói rõ khi có nhiều lần thử; code đã tính theo lần thử cuối).
- **Mới:** `NOT_EXECUTED` chỉ khi mọi lần thử đều lỗi trước khi gửi; có bất kỳ lần nào timeout, mất kết nối giữa chừng hoặc đích trả `5xx` thì `UNKNOWN`.
- **Lý do:** khớp `reliability-standard.md §2` ("chỉ cần một lần `unknown` thì kết quả là `unknown`"). Ca sai khi tính theo lần cuối: lần 1 timeout (đích có thể đã chạy), lần 2 `ECONNREFUSED` → báo `NOT_EXECUTED`, saga sẽ bù trừ nhầm đơn đã tạo ở đích.

### File design đã sửa

- `API_Spec.md` §3
- `Component_Class_Design.md` §1, §2, §4, §5
- Header 3 file: v1.1 → v1.2 (`Processing_Flow.md` chỉ đổi số phiên bản, không đổi nội dung)

### Ảnh hưởng

- `services/_template-nest` (A, bước 0 T1.2), chép sang identity và `api-gateway`.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Thêm details.outcome cho InternalHttpService, ghi hành vi idempotency đã kiểm.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §3, §5, §6 | Sửa |
| 2 | `Processing_Flow.md` §3, §5 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §3, §5, §6
- `Processing_Flow.md` §3, §5
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- `services/_template-nest` (A, bước 0 T1.2), chép sang identity và các service mới; `.env` gốc `HTTP_TIMEOUT_MS=3000`.
