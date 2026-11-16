---
description: >
  Xem nhanh tình hình: task đang làm của dev hiện tại, tiến độ phase so với mốc M0–M5, việc chặn trong
  van-de-can-quyet-dinh.md và task kế tiếp nên nhận. Chỉ đọc. Chỉ chạy khi user gõ /cf-status.
disable-model-invocation: true
argument-hint: "(không cần tham số; hoặc A | B | C để xem theo vai)"
---

# /cf-status — Tình hình dự án

Chỉ đọc, không ghi file nào.

## Bước 1 — Đọc

- `dev-id` theo quy tắc `/cf-handoff` Bước 1 → `.claude/state/<dev-id>/current-task.md`, `progress.md` (nếu có).
- `project-knowledge/implementation/progress.md` (task đã tick, ghi chú vướng mắc).
- `project-knowledge/implementation/README.md` — bảng phase, mốc M0–M5, phân công.
- `project-knowledge/implementation/van-de-can-quyet-dinh.md` — mục A, C còn trống cột quyết định.
- Ngày hôm nay (lấy từ hệ thống).
- `$ARGUMENTS` là `A` / `B` / `C` → lọc theo vai đó; trống → vai của dev hiện tại nếu đoán được, không thì cả nhóm.

## Bước 2 — In ra

```
## Tình hình <YYYY-MM-DD> — sprint S<n>, mốc kế tiếp M<k> (<ngày>, còn <d> ngày)

**Đang làm (<dev-id>):** <task> — <status>, <percent>% — bước: <…>   | hoặc: không có task dở

### Phase
| Phase | Xong / tổng | Hạn | Tình trạng |    ← Trễ / Đúng hạn / Chưa tới
### Trễ hạn
- T<x.y> <tên> — <người> — hạn <mốc>
### Đang chặn
- <mục van-de chưa chốt chặn task nào>
### Nên nhận tiếp (theo vai)
- A: T<x.y> … (phụ thuộc đã xong)
- B: …
- C: …
```

Task "nên nhận tiếp" = chưa tick, đúng vai, mọi "Phụ thuộc" đã tick, hạn sớm nhất trước.

## Ràng buộc

- Không đoán phần trăm task của người khác; chỉ dùng `implementation/progress.md`.
- Không tự sửa file nào.
