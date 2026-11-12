# Phase 5 — Hợp đồng và kiểm thử

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

**Mục tiêu:** OpenAPI đủ cho mọi service, collection Postman chạy được bằng Newman trên máy sạch.

**Hạn:** M4 — 2026-12-11 (cuối S5).

**Điều kiện xong:** Newman xanh trên máy sạch trong ≤ 10 phút dựng (NFR05).

---

## T5.1 OpenAPI

| | |
|---|---|
| **Người làm** | Mỗi người phần mình; A tổng hợp |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M4 — 2026-12-11 |
| **Đọc trước** | `guides/RE_OpenAPI_Postman_Guide.md §1–3` |
| **Phụ thuộc** | Phase 2–4 |

**Các bước:** `@ApiEnvelope`, mô tả lỗi nghiệp vụ cho mỗi route; `pnpm --filter @realestate/<s> openapi:export`; đối chiếu API nội bộ với `contracts/openapi/`.

**DoD:** Mỗi service ≥ 4 route công khai có lỗi `4xx` nghiệp vụ trong `openapi.json`.

---

## T5.2 Postman collection

| | |
|---|---|
| **Người làm** | B; mỗi người thư mục của mình |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M4 — 2026-12-11 |
| **Mã WBS** | E7-2 |
| **Đọc trước** | `guides/RE_OpenAPI_Postman_Guide.md §4` |
| **Phụ thuộc** | T5.1 |

**DoD:** ≥ 10 request, ≥ 2 tình huống lỗi; phủ T01–T18 của Báo cáo Bảng 5.2 tới mức gọi qua gateway được; chạy lại nhiều lần vẫn xanh.

---

## T5.3 CI e2e với Newman

| | |
|---|---|
| **Người làm** | B |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M4 — 2026-12-11 |
| **Phụ thuộc** | T5.2, T1.1 |

**DoD:** Job `e2e` dựng compose, chạy Newman, in log khi lỗi.

---

## T5.4 Kiểm tra trên máy sạch

| | |
|---|---|
| **Người làm** | A, chạy trên máy B hoặc C |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M4 — 2026-12-11 |
| **Đọc trước** | `guides/RE_Docker_Local_Guide.md` |

**Các bước:** clone, `pnpm install`, `.env`, `pnpm keys:generate`, `infra:up`, migration, `apps up`, Newman. Bấm giờ.

**DoD:** Dựng ≤ 10 phút; ghi thời gian và cấu hình máy vào `progress.md`.
