---
description: >
  Tiếp tục phiên trước. Đọc session-handoff.md, current-task, progress của dev hiện tại, tóm tắt chỗ
  đã dừng và việc tiếp theo, rồi HỎI trước khi code. Chỉ chạy khi user gõ /cf-resume.
disable-model-invocation: true
argument-hint: "(không cần tham số)"
---

# /cf-resume — Tiếp tục phiên

## Bước 1 — dev-id

Cùng quy tắc với `/cf-handoff`. Thư mục: `.claude/state/<dev-id>/`.

## Bước 2 — Đọc

`session-handoff.md` + `current-task.md` + `progress.md`. Không có handoff hoặc `status: idle` → báo "Chưa có phiên nào được lưu cho `<dev-id>`. Gõ `/cf-handoff` trước khi kết thúc phiên." rồi dừng.

## Bước 3 — Tóm tắt

- **Task:** `<task>` — `<status>`, `<percent>`%
- **Đã dừng ở:** `<bước>`
- **File đang sửa:** `<danh sách>`
- **Quyết định, context:** `<tóm tắt>`
- **Blockers:** `<nếu có>`
- **Việc tiếp theo:** `<checklist>`

## Bước 4 — Hỏi

"Tiếp tục từ đây không? (bước kế: `<việc đầu tiên>`)". Chỉ khi user đồng ý mới đi tiếp theo định tuyến thường (`developer`, playbook đang bật).

## Ràng buộc

- Chỉ đọc, không ghi state.
- **NEVER** tự viết code ngay sau khi resume.
