---
name: task-state-init
description: >
  Khởi tạo trạng thái task khi bắt đầu implement. Kích hoạt khi nghe "implement [X]", "build [X]",
  "tạo [X]", "viết [X]", "thêm tính năng [X]", "làm task T<x.y>", "bắt đầu làm [X]" mà chưa có
  current-task.md đang in_progress. Tạo .claude/state/<dev-id>/current-task.md gắn với task trong
  project-knowledge/implementation/.
---

# task-state-init

**MUST** chạy khi nhận yêu cầu implement mà chưa có `current-task.md` với `status: in_progress`.
**NEVER** viết code khi chưa xong 4 bước dưới.

## Bước 0 — Namespace

- `git config user.email` → `dev-id` = phần trước `@`, chữ thường, ký tự ngoài `[a-z0-9._-]` đổi thành `-`. Rỗng hoặc chưa có git → `local-dev`, nhắc user đặt email.
- Chưa có `.claude/state/<dev-id>/` → copy toàn bộ `.claude/state/_template/` sang.

## Bước 1 — Xác định task và đánh giá sơ bộ

- Tìm mục task tương ứng trong `project-knowledge/implementation/PHASE-x.md`. Không có → hỏi user có tạo task mới không; task ngoài kế hoạch phải được A đồng ý.
- Lấy từ mục task: mã `T<x.y>`, người làm, "Đọc trước", "Phụ thuộc", DoD, lệnh "Kiểm chứng".
- Kiểm phụ thuộc trong `implementation/progress.md`: task phụ thuộc chưa tick → báo user.
- Đánh giá nhẹ (không đọc sâu kiến trúc): loại thay đổi, service bị chạm, có migration không, có đổi hợp đồng API nội bộ hoặc sự kiện (`contracts/`) không, có chạm phần người khác sở hữu (`implementation/README.md §2`) không.

## Bước 2 — Kiểm `current-task.md`

- `status: in_progress` → hỏi: "Đang có task '<tên>' dở. Tiếp tục hay tạo mới?" (tạo mới = ghi đè).
- `done` / `idle` → tạo mới.

## Bước 3 — Ghi file

`.claude/state/<dev-id>/current-task.md`:

```markdown
---
task: T<x.y> <tên ngắn>
created: <YYYY-MM-DD>
status: in_progress
phase: implementation/PHASE-x.md#T<x.y>
---

## Mô tả
<1–3 câu>

## Thiết kế liên quan
<`design/<CỤM>/<MÃ>/` hoặc `không`>

## Definition of Done
- [ ] <DoD riêng của task, chép từ PHASE-x.md>
- [ ] Test bắt buộc trong thiết kế pass (dán output)
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi
- [ ] Lệnh "Kiểm chứng" của task chạy đúng (dán output)

## Các bước thực hiện (tổng quan)
- [ ] 1. Đọc context, đối chiếu thiết kế
- [ ] 2. Quét tái sử dụng + kế hoạch chi tiết (chờ duyệt)
- [ ] 3. Code + test theo playbook đang bật
- [ ] 4. Chạy test và lệnh kiểm chứng, xác nhận PASS
- [ ] 5. `code-review` 5 chiều, chuẩn bị PR

## Tái sử dụng
_Trống — `reuse-scan` điền ở Bước 2a của `developer`._

## Kế hoạch chi tiết
_Trống — `developer` điền ở Bước 2._

## Blockers / Ghi chú
_chưa có_
```

Điều chỉnh khung tổng quan theo đánh giá sơ bộ: có migration → thêm bước migration; đổi hợp đồng → thêm bước sửa `contracts/` trước code; task 1 file vặt → bỏ bước 5. Không đi vào chi tiết file, hàm.

## Bước 4 — Xác nhận

Hiển thị task vừa tạo, hỏi "Bắt đầu không?".

## Liên kết

- Thiết kế trước khi code → `solution-architect`
- Kế hoạch chi tiết → `developer` Bước 2; quét tái sử dụng → `reuse-scan`
- Tiến độ → `progress-tracker`; bàn giao → `/cf-handoff`, `/cf-resume`
