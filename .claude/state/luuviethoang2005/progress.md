---
task: C19 — thống nhất 400 VALIDATION_FAILED khi id trong đường dẫn sai
updated: 2026-11-19 17:00
percent: 95
---

## Đang làm
- Bước hiện tại: 6 — đã commit ở máy A; chờ A push, mở PR, CI xanh
- Tóm tắt: template dùng `createUuidParamPipe` ở mọi route; ESLint `no-restricted-imports` chặn `ParseUUIDPipe`; `RE.SERVICE_TEMPLATE` v2.0

## Đã xong (phiên này)
- Tài liệu: `RE.SERVICE_TEMPLATE` v2.0 + CHANGELOG, `api-convention.md §3`
- TDD: RED 2 ca → GREEN; template unit 96, e2e 111; identity unit 201, e2e 97; lint, format, build, contracts sạch
- README template, walkthrough identity, tech-debt #12 resolved; code-review 5 chiều (sửa 1 MINOR luật ESLint)

## Còn lại
- A push `fix/C19-uuid-validation-failed`, mở PR vào `develop`, CI xanh, merge
- Sau đó: T2.2 listing (`/cf-task T2.2`)

## Blockers
_không có_
