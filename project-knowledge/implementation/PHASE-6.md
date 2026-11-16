# Phase 6 — Thí nghiệm lỗi

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-16 |

**Mục tiêu:** số liệu thật cho Bảng 5.3 và 5.4 của báo cáo.

**Hạn:** T6.1 2026-12-04; T6.2 2026-12-10; T6.3 2026-12-16 (dời 2026-11-16).

**Điều kiện xong:** không còn ô "Chưa đo" ở Bảng 5.3; có file thô cho mỗi lần chạy.

---

## T6.1 Hạ tầng đo

| | |
|---|---|
| **Người làm** | B |
| **Thời lượng** | ~5 giờ (ước 2026-11-16) |
| **Hạn** | M2 — 2026-12-04 (làm sớm, không phụ thuộc saga) |
| **Đọc trước** | `guides/RE_Failure_Experiment_Guide.md §1–3` |
| **Phụ thuộc** | Phase 3, 4 |

**Các bước:** kịch bản k6 trong `infra/k6/`; script ảnh chụp dữ liệu (đơn hoạt động mỗi BĐS, outbox tồn, số dư ví, processed_events); thư mục kết quả.

**DoD:** Chạy thử một lần, có file thô.

---

## T6.2 E1, E2, E3 (bắt buộc)

| | |
|---|---|
| **Người làm** | B |
| **Thời lượng** | ~8 giờ (ước 2026-11-16) |
| **Hạn** | M4 — 2026-12-10 (cần số cho Bảng 5.3 trước hạn nộp) |
| **Mã WBS** | E7-3, E7-4 |
| **Đọc trước** | `guides/RE_Failure_Experiment_Guide.md §4–6` |
| **Phụ thuộc** | T6.1 |

**DoD:** Mỗi thí nghiệm chạy 3 lần, ghi trung vị và cả 3 giá trị; điền Bảng 5.3.

---

## T6.3 E4–E10

| | |
|---|---|
| **Người làm** | C (E4–E8, E10), B (E9) |
| **Thời lượng** | ~6 giờ C, ~2 giờ B (ước 2026-11-16) |
| **Hạn** | M5 — 2026-12-16 (dùng cho slide và vấn đáp, không bắt buộc trong báo cáo) |
| **Đọc trước** | `guides/RE_Failure_Experiment_Guide.md §7–8` |
| **Phụ thuộc** | T6.1 |

**DoD:** Bảng 5.4 có kết quả thực; bất biến ví (E10) đúng sau mọi kịch bản.
