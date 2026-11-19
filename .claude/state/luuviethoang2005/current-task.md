---
task: C19 — thống nhất 400 VALIDATION_FAILED khi id trong đường dẫn sai
created: 2026-11-19
status: done
phase: implementation/van-de-can-quyet-dinh.md#C19 (ngoài kế hoạch, A đồng ý 2026-11-19; làm trước T2.2)
branch: fix/C19-uuid-validation-failed (tách từ docs/T2.1-dong, đã merge vào develop qua PR #17)
---

## Mô tả

A chốt C19 phương án (b) ngày 2026-11-19: mọi route, công khai và nội bộ, báo `id` (UUID) sai trong đường dẫn bằng `400 VALIDATION_FAILED`, message "<tên> phải là UUID", `details: [{ field, errors }]`, qua `createUuidParamPipe`. Bỏ `new ParseUUIDPipe()` trần (trả `BAD_REQUEST`). Sửa `_template-nest` trước (ADR-0014) để T2.2 listing chép bản đã sửa.

## Thiết kế liên quan

`design/SHARED/RE.SERVICE_TEMPLATE/` v1.3 (`Component_Class_Design.md` dòng mô tả `createUuidParamPipe`, bảng test), `standards/api-convention.md §3, §6`. Hợp đồng `contracts/openapi/*-internal.v1.yaml`: **không đổi** (đã khai `VALIDATION_FAILED`).

## Đánh giá sơ bộ

- Service chạm: `_template-nest` (code + test), `identity` (chỉ chú thích trong bản chép `uuid-param.pipe.ts`, giữ giống hệt template). `api-gateway` không kiểm id → không đổi.
- Không migration, không đổi hợp đồng, không đổi sự kiện, không chạm tiền/bảo mật.
- Đổi hành vi code đã merge (route mẫu `GET /api/v1/examples/:id` của template): A đã chốt.

## Definition of Done

- [x] Không còn `new ParseUUIDPipe()` trần trong `services/*/src` (trừ bên trong `uuid-param.pipe.ts`)
- [x] `GET /api/v1/examples/khong-phai-uuid` và `GET /internal/examples/khong-phai-uuid` → `400 VALIDATION_FAILED`, message "id phải là UUID", `details: [{ field: 'id', errors: ['id phải là UUID'] }]` (test e2e PASS, dán output)
- [x] `pnpm --filter @realestate/template-nest test`, `test:e2e` PASS; `pnpm --filter @realestate/identity test`, `test:e2e` PASS (template 96 / 111, identity 201 / 97; 2026-11-19, bản clone sạch `develop` 1025710 + file đã sửa, checksum khớp máy A)
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi (contracts: 4 spec OK)
- [x] `RE.SERVICE_TEMPLATE` lên v2.0 kèm `CHANGELOG.md`; `api-convention.md` có quy tắc; README template, walkthrough identity cập nhật; tech-debt #12 `resolved`

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (chờ duyệt)
- [x] 3. Sửa tài liệu thiết kế trước (`RE.SERVICE_TEMPLATE` v2.0, `api-convention.md`)
- [x] 4. Code + test theo TDD (template): RED 2 ca đỏ (nhận `BAD_REQUEST`) → GREEN 14/14
- [x] 5. Chép sang identity, chạy test và lệnh kiểm chứng, xác nhận PASS
- [x] 6. Cập nhật README, walkthrough; `code-review` 5 chiều; commit (A push, mở PR)

## Tái sử dụng (Reuse Report)

Quét `services/_template-nest/src`, `services/identity/src`, `services/api-gateway/src` (2026-11-19, grep `ParseUUIDPipe|createUuidParamPipe|BAD_REQUEST`).

| Thành phần | Kết luận | Nguồn |
|---|---|---|
| Pipe kiểm UUID trả `VALIDATION_FAILED` | DÙNG LẠI `createUuidParamPipe` (đã có, có spec, đã chép sang identity) | `src/common/errors/uuid-param.pipe.ts` |
| Chỗ còn dùng `new ParseUUIDPipe()` trần | Sửa 2 chỗ, đều ở template: `example.controller.ts:84` (công khai), `example-internal.controller.ts:23` (nội bộ, cũng đang trả `BAD_REQUEST`, trái hợp đồng mẫu) | grep |
| identity | Không có `ParseUUIDPipe` trần; `users.internal.controller.ts` đã dùng `createUuidParamPipe` | grep |
| api-gateway | Không kiểm id đường dẫn | grep |
| Mã `BAD_REQUEST` còn lại | **Giữ**: JSON sai cú pháp (`errors.e2e-spec.ts`), `Idempotency-Key` sai dạng (`idempotency.interceptor.ts`), map mặc định `HttpException` 400 trong `error-codes.ts`. Không thuộc C19 | grep |
| Chặn tái phạm (tùy A) | Thêm luật `no-restricted-syntax` ở `eslint.config.mjs` gốc (không phải thành phần code mới) | `eslint.config.mjs` |

Không tạo thành phần dùng chung mới.

## Kế hoạch chi tiết

### Bước 3 — Tài liệu trước code

1. `design/SHARED/RE.SERVICE_TEMPLATE/CHANGELOG.md`: mục `[v2.0] — 2026-11-19`, **MAJOR** (đổi mã lỗi của route công khai mẫu, `design-standards.md §9`), chốt C19.
2. `Component_Class_Design.md`: dòng `createUuidParamPipe` → "dùng cho **mọi** tham số đường dẫn kiểu UUID, công khai và nội bộ; không dùng `new ParseUUIDPipe()` trần"; bảng test thêm dòng `test/example.e2e-spec.ts`. Header 3 file → v2.0.
3. `API_Spec.md` (template): thêm dòng lỗi "`:id` không phải UUID | 400 | `VALIDATION_FAILED`, message `<tên> phải là UUID`".
4. `standards/api-convention.md`: §3 dòng `400` thêm "kể cả tham số đường dẫn sai kiểu (UUID)"; §6 ghi rõ `BAD_REQUEST` chỉ còn cho body không đọc được (JSON sai cú pháp) và header sai dạng; tham số đường dẫn dùng `createUuidParamPipe`. Cập nhật ngày ở header.

### Bước 4 — Code template (TDD, playbook `tdd` bật mức `warn`)

1. RED: `test/example.e2e-spec.ts` ca "404 nghiệp vụ và id sai định dạng": đổi kỳ vọng `BAD_REQUEST` → `VALIDATION_FAILED` + message + `details`. Thêm ca mới trong `describe('prefix /api/v1 và /internal')`: `GET /internal/examples/khong-phai-uuid` → cùng kỳ vọng. Chạy `test:e2e` → 2 ca đỏ.
2. GREEN: `src/example/example.controller.ts` và `src/example/example-internal.controller.ts`: `new ParseUUIDPipe()` → `createUuidParamPipe('id')`, bỏ import `ParseUUIDPipe`. Chạy lại → xanh.
3. `src/common/errors/uuid-param.pipe.ts`: sửa chú thích (dùng cho mọi route, theo C19). Không đổi logic, spec giữ nguyên.
4. (Tùy A) `eslint.config.mjs`: `no-restricted-syntax` chặn `new ParseUUIDPipe(...)` trong `services/*/src/**` trừ `**/uuid-param.pipe.ts`, message trỏ `createUuidParamPipe`. Kiểm: tạm thêm một dòng vi phạm → `pnpm lint` đỏ, gỡ → xanh.

### Bước 5 — Chép, kiểm chứng

1. Chép `uuid-param.pipe.ts` sang `services/identity/src/common/errors/` (giống hệt, `diff` rỗng).
2. Chạy: template `test`, `test:e2e`; identity `test`, `test:e2e`; `pnpm lint`, `format:check`, `build`, `contracts:check`. Không cần `test:infra` (không chạm DB, Redis, RabbitMQ). Nơi chạy: VM ở máy không dùng được `node_modules` bản Windows, nên Claude chạy trên bản clone sạch trong workspace đám mây (`pnpm install` + chép file đã sửa vào); CI chạy lại đủ.
3. Số truy vấn: không đổi (pipe chạy trước handler, lỗi thì 0 truy vấn).

### Bước 6 — Tài liệu còn lại, review, PR

1. `services/_template-nest/README.md` dòng 195: bỏ "của API nội bộ", ghi quy tắc chung.
2. `guides/RE_Identity_Code_Walkthrough.md`: sửa 3 chỗ (bảng quyết định, câu hỏi vấn đáp "Vì sao có hai cách…", mục hạn chế C19) theo quyết định mới.
3. `tech-debt.md` #12 → `resolved`.
4. `code-review` 5 chiều. Commit (Claude tạo ở máy, A push vì môi trường này chặn `git push`):
   - `docs(design): RE.SERVICE_TEMPLATE v2.0, api-convention: id sai trả VALIDATION_FAILED (C19)`
   - `fix(template): route công khai và nội bộ dùng createUuidParamPipe; chép sang identity (C19)` (kèm eslint nếu A chọn)
   - `docs: README template, walkthrough identity, tech-debt #12 (C19)`
5. PR vào `develop` sau khi PR `docs/T2.1-dong` merge (nhánh này tách từ đó).

### Ước lượng

~1 giờ. Không vượt ngưỡng `non-functional-standards.md §1`.

## Code-review 5 chiều (2026-11-19, trước commit)

- **Security:** không đổi xác thực, không log thêm; message lỗi chỉ có tên tham số, không phản chiếu giá trị người dùng gửi. Không secret.
- **Performance:** không đổi; pipe chạy trước handler, `id` sai → 0 truy vấn.
- **Correctness:** khớp `RE.SERVICE_TEMPLATE` v2.0, `api-convention.md §3`, hợp đồng nội bộ (`VALIDATION_FAILED`, "id phải là UUID", `details`). MINOR đã sửa: luật ESLint ban đầu (`no-restricted-syntax` trên `new ParseUUIDPipe()`) để lọt dạng `@Param('id', ParseUUIDPipe)` → đổi sang `no-restricted-imports` chặn import `ParseUUIDPipe` từ `@nestjs/common`; thử cả hai dạng vi phạm đều báo lỗi, gỡ ra thì sạch, không bắt nhầm `uuid-param.pipe.ts`.
- **Style:** import đúng thứ tự, Prettier sạch (gồm `README.md` template, `eslint.config.mjs`).
- **Reuse:** dùng lại `createUuidParamPipe`; bản identity giống hệt template (md5 trùng). Không thành phần mới.
- **Ranh giới service:** không import chéo.

## Blockers / Ghi chú

- 2026-11-19: `git push` bị chặn trong môi trường Cowork; A push từ PowerShell.
