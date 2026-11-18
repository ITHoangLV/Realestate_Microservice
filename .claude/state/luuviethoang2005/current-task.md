---
task: T1.1 CI
created: 2026-11-18
status: in_progress
phase: PHASE-1
branch: feature/T1.1-ci
---

## Mô tả

CI GitHub Actions chạy trên mọi PR vào `develop`/`main` và mọi push lên hai nhánh đó: lint, format, contracts, build, unit test, e2e test theo ma trận service. Bật bảo vệ nhánh `develop`, `main`. Nguồn: `project-knowledge/implementation/PHASE-1.md` T1.1, `guides/RE_OpenAPI_Postman_Guide.md §6`, `standards/git-workflow.md`.

Người làm: A (chốt 2026-11-18: mọi task giao cho A).

## Thiết kế liên quan

Không có bộ thiết kế riêng (cấu hình CI). Bám `guides/RE_OpenAPI_Postman_Guide.md §6` (khung `ci.yml`) và `standards/git-workflow.md §3` (điều kiện merge).

## Quyết định của A trước khi lập kế hoạch (2026-11-18)

1. Bảo vệ nhánh: **chỉ cần CI xanh**, không bắt buộc người duyệt (A viết hầu hết PR, GitHub không cho tự duyệt PR của mình). B, C review khi A nhờ. Lệch `git-workflow.md §3` và `implementation/README.md §4` ("một người khác đã duyệt") → sửa hai tài liệu đó và ghi nhật ký `van-de-can-quyet-dinh.md`.
2. `test:infra` **chưa** chạy trong CI ở T1.1; để T5.3 cùng Newman/compose.

## Definition of Done

- [ ] `.github/workflows/ci.yml` chạy: `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`, `pnpm build`; `test` + `test:e2e` cho `template-nest`, `identity`, `api-gateway`
- [ ] CI xanh trên PR T1.1 và trên `develop` sau merge
- [ ] Kiểm chứng: commit cố ý làm hỏng một schema trong `contracts/events/` → CI đỏ ở bước `contracts:check`; revert → xanh
- [ ] `develop`, `main` được bảo vệ: bắt buộc PR, bắt buộc check `ci` xanh, chặn force push và xóa nhánh
- [ ] Tài liệu cập nhật: guide CI §6, `git-workflow.md §3`, `README.md §4`, `PHASE-1.md` T1.1 bước 2, nhật ký quyết định

## Các bước thực hiện (tổng quan)

- [ ] 1. Viết `ci.yml`
- [ ] 2. Thay placeholder trong `CODEOWNERS`
- [ ] 3. Cập nhật tài liệu (5 file)
- [ ] 4. A push nhánh, mở PR → CI chạy thật trên GitHub
- [ ] 5. Kiểm chứng CI đỏ với schema hỏng, rồi revert
- [ ] 6. A bật bảo vệ nhánh trên GitHub (Settings → Branches)
- [ ] 7. code-review 5 chiều, merge

## Tái sử dụng

Không tạo thành phần dùng chung trong `services/` (task cấu hình CI). Dùng lại script gốc có sẵn trong `package.json` (`lint`, `format:check`, `contracts:check`, `build`) và script mỗi service (`test`, `test:e2e`); không viết script mới.

## Kế hoạch chi tiết

### File sẽ sửa

| # | File | Thay đổi |
|---|---|---|
| 1 | `.github/workflows/ci.yml` (mới) | Xem thiết kế dưới |
| 2 | `.github/CODEOWNERS` | Placeholder `@username-*` → `@ITHoangLV` (A). Chỉ để GitHub tự gợi ý người review, không bắt buộc duyệt |
| 3 | `project-knowledge/guides/RE_OpenAPI_Postman_Guide.md §6` | Thay khung cũ bằng `ci.yml` thật; ghi tên check bắt buộc `ci`; `test:infra` và job e2e/Newman để T5.3 |
| 4 | `project-knowledge/standards/git-workflow.md §3` | Điều kiện merge: CI xanh; review khi A nhờ (chốt 2026-11-18) |
| 5 | `project-knowledge/implementation/README.md §4` | DoD chung: "CI xanh" (bỏ bắt buộc người khác duyệt) |
| 6 | `project-knowledge/implementation/PHASE-1.md` T1.1 bước 2 | "cần CI xanh" thay "cần một review và CI xanh" |
| 7 | `project-knowledge/implementation/van-de-can-quyet-dinh.md` | Nhật ký 2026-11-18: bảo vệ nhánh chỉ cần CI; `test:infra` để T5.3 |

### Thiết kế `ci.yml`

- Kích hoạt: `pull_request` vào `develop`, `main`; `push` lên `develop`, `main`; `workflow_dispatch`.
- `concurrency` theo nhánh, hủy lần chạy cũ khi có commit mới. `permissions: contents: read`.
- Node từ `.nvmrc` (22), pnpm từ `packageManager` (10.33.3), cache store pnpm, `pnpm install --frozen-lockfile`.
- Job `check`: lint → format:check → contracts:check → build.
- Job `test` (cần `check`): ma trận `template-nest`, `identity`, `api-gateway`, `fail-fast: false`; mỗi service `test` rồi `test:e2e`.
- Job `ci` (luôn chạy, cần `check` + `test`): đỏ nếu một job trước không `success`. **Đây là check duy nhất đặt bắt buộc** ở bảo vệ nhánh, để khi thêm service vào ma trận không phải sửa cài đặt GitHub.
- `timeout-minutes` cho mỗi job.

### Bảo vệ nhánh (A làm trên GitHub)

`develop` và `main`: Require a pull request before merging (Required approvals = 0); Require status checks to pass → chọn `ci`, bật "Require branches to be up to date"; Block force pushes; Restrict deletions.

### Rủi ro

- Repo private trên tài khoản GitHub Free không áp được bảo vệ nhánh (cần Pro, ví dụ qua GitHub Student Pack, hoặc chuyển repo public). Nếu gặp: ghi hạn chế, vẫn giữ CI.
- Test chạy trên Windows đã PASS nhưng chưa từng chạy trên Linux: có thể lộ lỗi đường dẫn, hoa thường tên file. Gặp thì sửa trong PR này.

## Blockers / Ghi chú

- Cần commit nhánh `docs/chot-vai-tro-phan-cong` trước, rồi tạo `feature/T1.1-ci` từ `develop`.
- Claude không chạy được git/Docker trên máy A (ổ đĩa thiếu chỗ cho môi trường shell): A push và xem kết quả CI.
