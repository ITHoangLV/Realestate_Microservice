---
name: progress-tracker
description: >
  Cập nhật tiến độ task đang làm. Kích hoạt sau mỗi bước implement xong, hoặc khi nghe "đến đâu rồi",
  "tiến độ", "xong bước", "còn lại gì". Tick current-task.md, ghi progress.md trong
  .claude/state/<dev-id>/. Chỉ đổi status done khi đã có output test PASS.
---

# progress-tracker

**MUST** chạy sau mỗi bước implement xong, sau mỗi vòng TDD, và khi mọi DoD đã tick.
**NEVER** kết thúc một bước mà không tick và ghi `progress.md`.

## Bước 1 — Đọc state

- `dev-id` như `task-state-init` Bước 0. Đọc `.claude/state/<dev-id>/current-task.md`.
- Không có → nhắc chạy `task-state-init`.

## Bước 2 — Đánh giá

- Tick DoD, bước tổng quan, bước con trong "Kế hoạch chi tiết" đã xong (dựa trên code đã viết và output đã chạy).
- "Kế hoạch chi tiết" còn trống → nhắc chạy `developer` Bước 2.
- Ước % theo bước con nếu có, không thì theo bước tổng quan.

## Bước 3 — Ghi `progress.md`

```markdown
---
task: <từ current-task.md>
updated: <YYYY-MM-DD HH:MM>
percent: <0-100>
---

## Đang làm
- Bước hiện tại: <tên>
- Tóm tắt: <1–2 câu>

## Đã xong (phiên này)
- <mục>

## Còn lại
- <mục>

## Blockers
_không có_
```

## Bước 4 — Báo ngắn

"Task <tên>: <X>% — đang <bước>. Còn <N> bước."

## Bước 5 — Cổng test trước `done`

- Chỉ tick DoD liên quan code và đổi `status: done` khi trong phiên đã có **output test và lệnh kiểm chứng PASS thật**.
- Chưa chạy hoặc còn fail → giữ `in_progress`, nhắc cổng test của `developer`.
- Task `done` → nhắc: tick `implementation/progress.md` **sau khi merge**, ghi nợ kỹ thuật (nếu có) vào `tech-debt.md`.
