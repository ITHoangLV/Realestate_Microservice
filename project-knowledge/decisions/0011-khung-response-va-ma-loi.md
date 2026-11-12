# ADR-0011: Khung response { data, meta } và mã lỗi <MIỀN>_<LÝ_DO>

| | |
|---|---|
| **Trạng thái** | Proposed |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `standards/api-convention.md §4–6`, `services/_template-nest/README.md §2.1` |

## Bối cảnh

Năm service, ba người viết. Client và test cần đọc thành công, lỗi, `correlationId` theo một cách.

## Quyết định

Chúng tôi sẽ dùng:

- Thành công `{ data, meta }`; lỗi `{ error: { code, message, details? }, meta }`; `meta` luôn có `correlationId`, `timestamp`; phân trang thêm `page, pageSize, total, totalPages`.
- Mã lỗi IN_HOA `<MIỀN>_<LÝ_DO>`, không đổi tên sau khi client dùng; mã dùng chung trong `error-codes.ts`.
- `/health` không bọc. Tiền số nguyên VND, thời gian ISO 8601 UTC, ID UUID.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Body thô của NestJS | Không có `correlationId`, khó thống nhất lỗi |
| Mã số `XX-NNNN` | Khó đọc khi debug |

## Hệ quả

**Tích cực**

- `InternalHttpService` tự gỡ `data`, đọc `error.code` của service đích.

**Tiêu cực / đánh đổi**

- Client luôn phải đọc `data`.
