---
description: >
  Bắt đầu (hoặc tiếp tục) một task trong kế hoạch, ví dụ /cf-task T1.2. Đọc mục task trong
  implementation/PHASE-x.md, kiểm phụ thuộc, chạy task-state-init rồi vào procedure developer tới cổng
  duyệt kế hoạch. Chỉ chạy khi user gõ /cf-task.
disable-model-invocation: true
argument-hint: "T<x.y>  (ví dụ: T1.2)"
---

# /cf-task — Bắt đầu task

Tham số: `$ARGUMENTS` (mã task `T<x.y>`). Trống → hỏi mã task, gợi ý các task chưa tick của người dùng trong `project-knowledge/implementation/progress.md`.

## Bước 1 — Tìm task

- `T<x>.<y>` → mở `project-knowledge/implementation/PHASE-<x>.md`, mục `## T<x>.<y>`. Không có → báo, dừng (task ngoài kế hoạch cần A đồng ý).
- Đọc: người làm, hạn, "Đọc trước", "Phụ thuộc", các bước, "Kiểm chứng", DoD.

## Bước 2 — Kiểm trước khi nhận

- `dev-id` theo quy tắc `/cf-handoff` Bước 1. Người làm của task khác vai của dev (`implementation/README.md §2`) → hỏi lại.
- Phụ thuộc chưa tick trong `implementation/progress.md` → liệt kê, hỏi có làm trước phần không phụ thuộc không.
- `[cần xác nhận]` trong thiết kế "Đọc trước" mà mục A/C của `implementation/van-de-can-quyet-dinh.md` chưa chốt → liệt kê; cái nào **chặn** task thì hỏi người phụ trách trước.
- Nhánh: gợi ý `git switch -c feature/T<x.y>-<mô-tả> develop` (`standards/git-workflow.md`). Không tự chạy.

## Bước 3 — Khởi tạo

Chạy skill `task-state-init` với task này. Đang có task khác `in_progress` → skill đó sẽ hỏi.

## Bước 4 — Vào `developer`

Theo `.claude/agents/developer.md` Bước 1 → 2a → 2. **Dừng ở cổng duyệt kế hoạch**, không viết code trước khi user duyệt.

## Ràng buộc

- **NEVER** viết code trong lệnh này trước khi kế hoạch được duyệt.
- Không sửa `implementation/progress.md` (chỉ tick sau merge).
