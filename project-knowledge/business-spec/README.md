# Business Spec

> Nguồn sự thật về **nghiệp vụ**: làm gì và vì sao. Là **đầu vào** của tầng thiết kế. Quyết định kỹ thuật (API, class) thuộc `design/`.
> Nạp theo nhu cầu, không `@import` vào `CLAUDE.md`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

| File | Nội dung |
|---|---|
| `RE.BUSINESS_RULES.md` | Bài toán, tác nhân, use case, quy tắc nghiệp vụ `BR-xx`, máy trạng thái đơn đặt cọc |
| `RE.SRS.md` | Yêu cầu chức năng FR01–FR08, user story US01–US08 và tiêu chí chấp nhận, đặc tả use case chi tiết, giao diện ngoài |

## Vai trò trong luồng

```
business-spec/ → solution-architect → design/<CỤM>/<MÃ>/ → architect-reviewer → implementation/PHASE-x → developer
```

`solution-architect` đọc file này ở Bước 1. Điểm nghiệp vụ chưa map được → `[cần xác nhận]` trong tài liệu thiết kế.

## Thứ tự ưu tiên nguồn

1. Báo cáo giữa kỳ v2 (`Bao_cao_Real-estate_hoan_chinh_v2.docx`).
2. Code đã merge trong repo (`services/identity`, `services/_template-nest`, `infra/`).
3. Tài liệu khác (`nghiep-vu-dat-coc-payos.md`, `docs/architecture/service-boundaries.md`, `contracts/`, kế hoạch sprint xlsx): chỉ tham khảo. Chỗ lệch ghi vào `implementation/van-de-can-quyet-dinh.md`.

## Quy ước

- Mỗi quy tắc có mã `BR-xx`, không tái sử dụng mã khi xóa. Mã giữ đúng số của Báo cáo v2 (Bảng 2.5).
- Thiết kế và test tham chiếu mã này; mỗi `BR-xx` phải có nơi kiểm tra và mã lỗi trong thiết kế.
- Không đưa quyết định kỹ thuật vào đây.
- Spec đổi → cập nhật ở đây, rồi chạy `solution-architect` để đồng bộ thiết kế (kèm `CHANGELOG.md` của chức năng bị ảnh hưởng).
