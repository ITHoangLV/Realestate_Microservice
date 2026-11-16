---
description: >
  Lưu phiên làm việc đang dở để bàn giao hoặc tiếp tục sau. Đọc current-task, progress của dev hiện
  tại, gom file đang sửa, rồi ghi đè session-handoff.md. Chỉ chạy khi user gõ /cf-handoff.
disable-model-invocation: true
argument-hint: "(không cần tham số)"
---

# /cf-handoff — Lưu phiên

## Bước 1 — dev-id

`git config user.email` → phần trước `@`, chữ thường, ký tự ngoài `[a-z0-9._-]` đổi thành `-`. Rỗng → `local-dev`, nhắc đặt email. Thư mục: `.claude/state/<dev-id>/`.

## Bước 2 — Đọc state

Đọc `current-task.md`, `progress.md`. Chưa có `state/<dev-id>/` → báo "Chưa có task nào cho <dev-id>, không có gì để lưu" rồi dừng.

## Bước 3 — File đang sửa

`git status --short` và `git diff --name-only`. Chưa có git → liệt kê file đã sửa trong phiên này.

## Bước 4 — Ghi đè `session-handoff.md`

```markdown
---
dev: <dev-id>
saved: <YYYY-MM-DD HH:MM>
task: <từ current-task.md>
status: <từ current-task.md>
percent: <từ progress.md>
---

## Đang làm dở
- Task: <task> (`implementation/PHASE-x.md#T<x.y>`)
- Bước hiện tại: <từ progress.md>

## File đang sửa
- <danh sách>

## Quyết định, context quan trọng
- <tóm tắt + trỏ decisions-log.md nếu có>

## Blockers
- <hoặc "_không có_">

## Việc tiếp theo
- [ ] <việc rõ ràng>
```

## Bước 5 — Xác nhận

"Đã lưu handoff cho `<dev-id>` (task `<task>`, `<percent>`%). Gõ `/cf-resume` để tiếp tục."

## Ràng buộc

- Chỉ ghi vào `state/<dev-id>/` của mình; không đụng state người khác.
- Ghi đè, không giữ lịch sử phiên cũ.
