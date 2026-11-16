# Playbooks

> Mỗi playbook là một quy trình gắn vào cách Claude viết code, gồm tài liệu, skill và hook.
> Bật/tắt ở `.claude/playbooks.json`. Claude chỉ áp dụng playbook `enabled: true`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

| Playbook | Tài liệu | Skill | Hook | Trạng thái |
|---|---|---|---|---|
| `tdd` | `tdd/tdd-guide.md` | `.claude/skills/tdd-workflow/` | `tdd/tdd-guard.js` (PostToolUse, khai ở `.claude/settings.json`) | Bật, `warn` |

Cấu hình nằm ở `.claude/playbooks.json` (bật/tắt, `enforcement`) và `.claude/settings.json` (hook `PostToolUse` cho `Write|Edit|MultiEdit` chạy `node "${CLAUDE_PROJECT_DIR:-.}/project-knowledge/playbooks/tdd/tdd-guard.js"`).

## Thêm playbook mới

1. Tạo thư mục `playbooks/<tên>/` gồm tài liệu hướng dẫn và (nếu cần) hook.
2. Tạo skill `.claude/skills/<tên>-workflow/SKILL.md`.
3. Thêm khóa vào `.claude/playbooks.json`, hook vào `.claude/settings.json`.
4. Thêm một dòng vào bảng trên.
5. Cập nhật Bước 1 của `.claude/agents/developer.md` nếu procedure cần đọc tài liệu đó.
