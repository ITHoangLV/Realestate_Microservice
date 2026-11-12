# Phase 7 — Nộp bài

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

**Mục tiêu:** báo cáo cuối kỳ, slide, demo tập dượt, video dự phòng.

**Hạn:** M5 — 2026-12-18 (cuối S6).

**Điều kiện xong:** tag `v1.0-submission`.

---

## T7.1 Báo cáo cuối kỳ

| | |
|---|---|
| **Người làm** | A tổng hợp; A (gateway, identity, notification), B (listing, kiểm thử), C (rental, payment, saga) |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M5 — 2026-12-18 |
| **Mã WBS** | E8-4a, E8-4b, E8-4c, E7-6 |
| **Đọc trước** | `guides/RE_Report_Defense_Guide.md §1–2`, Báo cáo giữa kỳ v2 |
| **Phụ thuộc** | Phase 6 |

**Các bước:** cập nhật Báo cáo v2: §5.5, Bảng 5.3, Chương 6 (ảnh, log, minh chứng), Phụ lục A (cột "Kết quả thực hiện"), Phụ lục C (khai báo AI theo thực tế); bỏ "dự kiến" ở các bảng API khi đã có `openapi.json`.

**DoD:** Checklist `RE_Report_Defense_Guide.md §2` đủ.

---

## T7.2 Slide

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M5 — 2026-12-18 |
| **Đọc trước** | `guides/RE_Report_Defense_Guide.md §3` |

**DoD:** ≤ 10 slide `[cần xác nhận]` số slide giảng viên cho phép.

---

## T7.3 Tập demo, video, vấn đáp

| | |
|---|---|
| **Người làm** | Cả nhóm |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M5 — 2026-12-18 |
| **Mã WBS** | E8-2, E8-3, E8-5a–c |
| **Đọc trước** | `guides/RE_Report_Defense_Guide.md §4–6` |

**DoD:** Tổng duyệt 2 lần có bấm giờ; video dự phòng ≤ 10 phút; mỗi người trả lời được câu hỏi phần mình.

---

## T7.4 Rà soát cuối

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M5 — 2026-12-18 |

**Các bước:** rà `requirements-traceability.md`, cột "Bằng chứng" đủ; không còn secret trong repo, collection; tag `v1.0-submission`.

**DoD:** Gói minh chứng (Báo cáo §6.3): commit, OpenAPI, collection, kết quả Newman, số liệu E1–E3, ảnh giao diện, video.
