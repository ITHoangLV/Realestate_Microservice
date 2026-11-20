# RE.LISTING — Nhật ký thay đổi thiết kế

> Tạo ở lần sửa đầu tiên sau baseline v1.0 (`standards/design-standards.md §9`). Mục mới lên đầu, không sửa mục cũ.

## [v1.2] — 2026-11-19

- **type:** MINOR
- **author:** hoang.lv (A duyệt kế hoạch T2.2 cùng ngày)
- **summary:** Chốt response/request, duyệt lại khi sửa tin `REJECTED`, xác nhận ảnh idempotent, dọn object ảnh không hợp lệ, phạm vi đọc của T2.2.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1.1 (bảng duyệt lại) | Sửa |
| 2 | `API_Spec.md` §1.2 (mục 5–8) | Sửa |
| 3 | `API_Spec.md` §1.4, §7, §8 | Thêm |
| 4 | `Component_Class_Design.md` §1, §3 (test 13–17) | Sửa |
| 5 | `Processing_Flow.md` §2, §5 | Sửa |
| 6 | `API_Spec.md` §6 (thêm `ix_listing_images_listing`) | Thêm |

- **Cũ:** chỉ tin `APPROVED` có quy tắc duyệt lại; xác nhận ảnh trùng key chưa nói; ảnh không hợp lệ chỉ trả `400`; chưa có hình dạng response của route 1–10, 12.
- **Mới:** tin `REJECTED` sửa bất kỳ trường hoặc thêm ảnh → `PENDING_REVIEW`; key trùng → `200` kèm ảnh đã có; ảnh không hợp lệ → `deleteObject` (lỗi chỉ log); `ListingDto`, request/response từng route; route 12 vẫn trả tin `HIDDEN`; route 5 trả `204`; `ListingQueryService.findMine/findPublic` làm ở T2.2.
- **Lý do:** A chốt khi duyệt kế hoạch T2.2 (2026-11-19); viết trước code theo `design-standards.md §9`.

### File design đã sửa

- `API_Spec.md` §1.1, §1.2, §1.4 (mới), §7, §8 (mới)
- `Component_Class_Design.md` §1, §3
- `Processing_Flow.md` §2, §5
- Header 3 file: v1.1 → v1.2

### Ảnh hưởng

- listing (T2.2): DTO, `listing-edit.rules.ts`, `ListingImageService` (key trùng, `deleteObject`).
- `StorageService.deleteObject` đã có; `headObject` thêm ở `RE.SERVICE_TEMPLATE` v2.1.
- `contracts/`: không đổi. Gateway: không đổi.

## [v1.1] — 2026-11-16

- **type:** MINOR
- **author:** hoang.lv (A chốt cùng nhóm; người phụ trách code xem lại khi nhận task)
- **summary:** Chốt giá trị cố định, quy tắc duyệt lại khi sửa, giới hạn ảnh và phân trang tìm kiếm.

### Thay đổi

**1.**

| # | Vị trí | Loại |
|---|---|---|
| 1 | `API_Spec.md` §1.1, §1.2, §1.3, §4, §5, §6, §7 | Sửa |
| 2 | `Component_Class_Design.md` §4 | Sửa |

- **Cũ:** các điểm `[cần xác nhận]` ở những mục trên.
- **Mới:** giá trị đã chốt, tóm ở mục "Đã chốt 2026-11-16" cuối `API_Spec.md`.
- **Lý do:** chốt trước khi code; ghi ở `implementation/van-de-can-quyet-dinh.md` mục D ngày 2026-11-16.

### File design đã sửa

- `API_Spec.md` §1.1, §1.2, §1.3, §4, §5, §6, §7
- `Component_Class_Design.md` §4
- Header 3 file: v1.0 → v1.1

### Ảnh hưởng

- listing (B, T2.2, T2.3): DTO, migration (`property_type` NOT NULL + CHECK), mã lỗi mới `LISTING_IMAGE_LIMIT_REACHED`, biến `LISTING_IMAGE_MAX_COUNT`.
