---
task: T2.1 identity — tài khoản nhận tiền, API nội bộ
created: 2026-11-18
status: in_progress
phase: PHASE-2
branch: feature/T2.1-identity-bank-account
---

## Mô tả

`implementation/PHASE-2.md` T2.1 (sau quyết định 2026-11-18 bỏ đổi vai trò):

1. Migration `bank_accounts`; `BankAccountService` (AES-256-GCM, bốn số cuối).
2. Route 6–8 (`API_Spec.md §1`) + `GET /internal/users/:id/bank-account`.
3. `revokeAllForUser` trong `RefreshTokenStore` (T2.5 dùng khi khóa tài khoản, đặt lại mật khẩu).
4. Test `expectEventMatchesContract` cho `identity.registered` (đã có trong `auth.infra-spec.ts`, chạy lại).

Người làm: A. Hạn M1 — 2026-11-27.

## Thiết kế liên quan

`project-knowledge/design/IDENTITY/RE.IDENTITY/` v2.0: `API_Spec.md §1` (route 6–8), `§1.4`, `§2`, `§4`, `§5` (`BANK_ACCOUNT_ENCRYPTION_KEY`), `§6` (DDL `bank_accounts`), `§7`; `Component_Class_Design.md §1–3, §5`. Hợp đồng: `contracts/openapi/identity-internal.v1.yaml` (không đổi).

## Definition of Done

- [x] Test 1–9, 11, 12 ở `RE.IDENTITY/Component_Class_Design.md §5` PASS (test 10 bỏ)
- [x] Test thêm: mã hóa/giải mã, `revokeAllForUser`, route 8 phân trang
- [x] `pnpm --filter @realestate/identity test`, `test:e2e`, `test:infra` PASS (201 / 97 / 99, 2026-11-19)
- [ ] `pnpm lint`, `format:check`, `build`, `contracts:check` PASS (đã PASS cục bộ 2026-11-19); **CI xanh: chờ mở PR**
- [x] Response thật của `/internal/users/:id/bank-account` khớp `identity-internal.v1.yaml`
- [x] Số truy vấn trong ngưỡng (`non-functional-standards.md §1`)
- [x] Walkthrough `guides/RE_Identity_Code_Walkthrough.md` (đã đăng ký ở `CLAUDE.md §2.5`) + code-review 5 chiều (xem Blockers / Ghi chú)

## Các bước thực hiện (tổng quan)

- [x] 0. Sửa thiết kế trước (v2.1): chi tiết route 8, định dạng mã hóa, sơ đồ lớp còn `changeRole` (2026-11-18: `RE.IDENTITY` v2.1 + `CHANGELOG.md`; `RE.PAYOUT` v1.2 ghi `[cần xác nhận]`; nhật ký `van-de-can-quyet-dinh.md`; prettier OK)
- [x] 1. `PageQueryDto` ở template rồi chép sang identity (RED→GREEN: 10 test; template 89 PASS, identity 122 PASS; eslint + prettier sạch)
- [x] 2. `revokeAllForUser` (TDD): RED (TS2339) → GREEN 13 test store PASS; identity test 122, e2e 89, infra 43 (4 suite, có RabbitMQ) PASS; lint, format, build sạch. Thêm: `rotate` gia hạn TTL set; ghi hạn chế vào `security-policy.md §6`
- [x] 3. Mã hóa số tài khoản + migration + entity (TDD): cipher 16 test PASS; migration chạy thật qua runMigrations trong auth/seed-admin infra-spec; ROTATE_LUA SADD: bỏ SADD thì test phiên cũ đỏ, có SADD 14/14 PASS. 2026-11-19: unit 138, e2e 89, infra 44 (4 suite) PASS; lint, format, build, contracts:check sạch
- [x] 4. Route 6–7 (TDD): DTO spec + service spec (RED TS2307 → GREEN), infra 18 test (mutation bỏ updated_at = now() thì test đỏ). 2026-11-19: unit 170, e2e 89, infra 62 PASS; lint, format, build, contracts sạch. Số truy vấn: GET 1, PUT 1 (đếm trong test). Đã chạy migration run → revert → run trên identity_db dev: down OK, users còn 3 dòng
- [x] 5. API nội bộ (TDD): RED 10/10 → GREEN. Thêm ở template (chép sang identity): `createUuidParamPipe`, `expectResponseMatchesOpenApi`, devDependency `yaml@2.9.1` (A cho phép pnpm add). 2026-11-19: template unit 96, e2e 110; identity unit 177, e2e 97, infra 72; template infra 13 PASS; lint, format, build, contracts sạch. Đột biến thêm accountLast4 vào body thì chỉ test 200 đỏ
- [x] 6. Route 8 (TDD): RED (TS2307 + 25 test infra đỏ) → GREEN. Thêm migration `1732000000001-add-users-list-indexes` (2 index, EXPLAIN xác nhận không Sort; up/down/up trên DB dev OK). 2026-11-19: identity unit 193, e2e 97, infra 99 PASS; lint, format, build, contracts sạch. Số truy vấn: tối đa 2 (TypeORM bỏ COUNT khi trang đầu chưa đầy → 1)
- [x] 7. Env, compose, .env.example: `identity.env.ts` dùng lại `parseEncryptionKey` (RED 8 test → GREEN 13); `.env.example` gốc + service để trống kèm lệnh sinh khóa; compose `${BANK_ACCOUNT_ENCRYPTION_KEY:-}`; guide "Lần đầu" + §3.1; services/identity/README.md. A cho phép: sinh khóa ghi vào `.env` gốc và `services/identity/.env` (cùng khóa, 32 byte, không in). Build lại profile apps OK (re-identity, re-api-gateway healthy). Smoke: PUT qua 8080 200; /internal trong mạng Docker 200 đúng 4 trường, id sai 400; /internal qua 8080 404 GATEWAY_ROUTE_NOT_FOUND; DB không có số rõ; log không có số. identity unit 201, e2e 97, infra 99 PASS
- [x] 8. Kiểm chứng, walkthrough, code-review (xong; còn: A đồng ý chia commit, commit, mở PR, CI xanh, tick `implementation/progress.md` sau merge)

## Tái sử dụng (Reuse Report)

Quét `services/_template-nest/src`, `services/identity/src`, `services/api-gateway/src` (2026-11-18).

| Thành phần                                                      | Kết luận                                                                                                                                                      | Nguồn                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Khung danh sách `{ data, meta.page… }`                          | DÙNG LẠI                                                                                                                                                      | `Paginated` (`src/common/response/response-meta.ts`) |
| Kiểm vai trò, `@Public()`, `@CurrentUser()`                     | DÙNG LẠI                                                                                                                                                      | `src/common/auth/*`                                  |
| Lỗi nghiệp vụ                                                   | DÙNG LẠI `AppException`; MỞ RỘNG `identity.errors.ts` (+2 mã có sẵn trong catalog)                                                                            | `src/common/errors`, `src/identity/errors`           |
| Kiểm `:id` là UUID → 400 VALIDATION_FAILED | ~~DÙNG LẠI `ParseUUIDPipe`~~ SAI: `new ParseUUIDPipe()` trần trả mã `BAD_REQUEST`, bốn hợp đồng nội bộ đều khai `VALIDATION_FAILED` + "<tên> phải là UUID". **VIẾT MỚI ở template** `src/common/errors/uuid-param.pipe.ts` (`createUuidParamPipe`), chép sang identity (route công khai của template giữ `ParseUUIDPipe`, có test `BAD_REQUEST`, không đổi) | grep `ParseUUIDPipe` chỉ có ở `example-internal.controller.ts` |
| Kiểm response khớp OpenAPI trong test | **VIẾT MỚI ở template** `test/helpers/contracts.ts` `expectResponseMatchesOpenApi`; cùng cách dựng ajv + `rewriteRefs` như `contracts/scripts/check-openapi.mjs` (script ESM, không import được từ test TS nên chép logic); cần devDependency `yaml` | `contracts:check`, `helpers/contracts.ts` |
| Thu hồi phiên                                                   | MỞ RỘNG `RefreshTokenStore` + `RedisRefreshTokenStore` (thêm `revokeAllForUser`, `create` ghi set họ token)                                                   | `src/identity/stores`                                |
| Biến bắt buộc của identity                                      | MỞ RỘNG `identityRequiredSchema`                                                                                                                              | `src/identity/config/identity.env.ts`                |
| Query `page`, `pageSize` (mặc định 20, tối đa 50)               | **VIẾT MỚI ở template** `src/common/response/page-query.dto.ts`, chép sang identity (ADR-0014). Chưa có ở đâu; listing, rental, payment, notification đều cần | grep `Query.*Dto`, `IsInt`                           |
| Mã hóa AES-256-GCM                                              | VIẾT MỚI trong identity `src/identity/services/bank-account.cipher.ts` (chỉ identity dùng, không đưa vào phần chung)                                          | grep `createCipheriv` không có                       |
| Entity, migration, service, controller, DTO tài khoản nhận tiền | VIẾT MỚI trong `src/identity/` theo `Component_Class_Design.md §1`                                                                                            |                                                      |

## Kế hoạch chi tiết

### Bước 0 — Thiết kế `RE.IDENTITY` v2.1 (MINOR, `CHANGELOG.md`)

1. Route 8 `GET /api/v1/admin/users` (chưa có chi tiết): query `page`, `pageSize` (20/50), `role?` (`TENANT|LANDLORD|ADMIN`); sắp `created_at DESC, id DESC`; item `UserDto` hiện có (`id, email, fullName, role, createdAt`; T2.5 thêm `status`). 2 truy vấn (count + data).
2. Route 6–7: response `{ bankName, accountHolder, accountLast4, updatedAt }`; route 6 chưa khai → `404 IDENTITY_BANK_ACCOUNT_NOT_FOUND`; route 7 `200`, ghi đè bằng một câu `INSERT … ON CONFLICT (user_id) DO UPDATE … RETURNING`. `accountHolder` 1–200 ký tự, cắt khoảng trắng.
3. Định dạng mã hóa: `account_number_encrypted = iv(12 byte) ‖ authTag(16 byte) ‖ ciphertext`, IV ngẫu nhiên mỗi lần ghi, **AAD = `userId`** (dòng của người A chép sang người B thì giải mã lỗi). Khóa sai hoặc dữ liệu hỏng → `500 INTERNAL_ERROR` + log `error` không kèm số. Không xoay khóa (ghi hạn chế).
4. Sơ đồ lớp §2: bỏ `changeRole` còn sót trong `UserAdminService`, thêm `list(query)`.
5. Khi nào khai tài khoản nhận tiền (A chốt 2026-11-18): không có mục khai riêng ở trang hồ sơ. Giao diện hiện form khai khi người dùng **rút tiền lần đầu** (payment trả `409 PAYMENT_BANK_ACCOUNT_MISSING`) hoặc **gửi yêu cầu hoàn lần đầu** (giao diện gọi route 6, `404` thì hiện form), rồi gọi route 7 và thử lại. API identity không đổi. Ghi `RE.IDENTITY §1.4`, nhật ký `van-de-can-quyet-dinh.md`.
6. `RE.PAYOUT`: ghi `[cần xác nhận]` cách quản trị viên xem tài khoản người thuê khi hoàn (đề xuất: màn hình yêu cầu hoàn gọi `GET /internal/users/:tenantId/bank-account`; chưa khai, ví dụ tiền đến muộn, thì hỏi qua chat `SUPPORT`). Thiết kế chi tiết ở T3.6, không làm trong T2.1.

### Bước 1 — `PageQueryDto` (template trước, ADR-0014)

- `services/_template-nest/src/common/response/page-query.dto.ts` + `.spec.ts`: `page` ≥ 1 mặc định 1, `pageSize` 1–50 mặc định 20, `@Type(() => Number)`; getter `skip`.
- Chép nguyên file sang `services/identity/src/common/response/`. Gateway không cần.

### Bước 2 — `revokeAllForUser` (TDD)

- `refresh-token.store.ts`: thêm `revokeAllForUser(userId): Promise<number>` (số họ đã thu hồi).
- `redis-refresh-token.store.ts`: `create` thêm `SADD <prefix>user-families:<userId> <familyId>` + `EXPIRE` trong cùng `multi`; `revokeAllForUser` chạy Lua: đọc set, `SET revoked:<familyId> 1 EX ttl` từng họ, `DEL` set (nguyên tử).
- Test `test/refresh-token.store.infra-spec.ts`: hai họ của cùng user bị thu hồi, họ của user khác không bị; user chưa có họ → 0.

### Bước 3 — Mã hóa, migration, entity (TDD)

- `src/identity/services/bank-account.cipher.ts` + `.spec.ts`: `encrypt(plain, userId) → Buffer`, `decrypt(buf, userId) → string`; test: khứ hồi đúng; hai lần mã hóa cùng số cho kết quả khác nhau; sai `userId`, sai khóa, sửa 1 byte → lỗi.
- `src/database/migrations/1732000000000-create-bank-accounts.ts`: DDL `API_Spec.md §6` (có `CONSTRAINT FK_bank_accounts_user`, `UQ` theo `user_id`).
- `src/identity/entities/bank-account.entity.ts`.

### Bước 4 — Route 6–7 (TDD)

- `dto/bank-account.dto.ts` (response), `dto/upsert-bank-account.dto.ts` (`bankName` 2–100, `accountNumber` `^\d{6,19}$`, `accountHolder` 1–200).
- `services/bank-account.service.ts` (+ spec, repo giả): `upsertMine`, `getMine`, `getForPayout`.
- `controllers/bank-account.controller.ts`: `GET`, `PUT /users/me/bank-account` (người dùng đã đăng nhập).
- Test 2 và 8 ("Kiểm lại" ở §5): chạy lại `auth.infra-spec.ts`, bổ sung ca còn thiếu nếu có (test 2 đăng ký `role=ADMIN` → 400; test 8 `expectEventMatchesContract` cho `identity.registered`).
- Test 9 (infra): `PUT` → DB chỉ có bytea + `account_last4`, không có số rõ; response chỉ bốn số cuối; `PUT` lần hai ghi đè, vẫn một dòng; `GET` trước khi khai → 404; không token → 401.

### Bước 5 — API nội bộ (TDD)

- `controllers/users.internal.controller.ts`: `GET /internal/users/:id/bank-account`, `@Public()`, `ParseUUIDPipe`.
- Test 11 (infra): chưa khai → `404 IDENTITY_BANK_ACCOUNT_NOT_FOUND`; đã khai → số đầy đủ, **body khớp schema `BankAccountResponse` trong `identity-internal.v1.yaml`** (thêm hàm `expectResponseMatchesOpenApi` vào `test/helpers/contracts.ts`, dùng lại ajv của `contracts:check`); `id` sai → 400; access log không có số tài khoản.

### Bước 6 — Route 8 (TDD)

- `services/user-admin.service.ts` (`list(query)`; T2.5 thêm `lock`, `unlock`), `controllers/users.admin.controller.ts` (`@Roles('ADMIN')`), `dto/list-users.query.ts` (kế thừa `PageQueryDto` + `role?`).
- Test (infra): ADMIN thấy danh sách có `meta.page/pageSize/total/totalPages`, lọc `role`, `pageSize=51` → 400; TENANT → 403.

### Bước 7 — Env, compose

- `identity.env.ts`: `BANK_ACCOUNT_ENCRYPTION_KEY` bắt buộc, base64 giải ra đúng 32 byte.
- `services/identity/.env.example`, `.env.example` gốc: để trống + lệnh sinh `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- `infra/compose/docker-compose.yml` (identity): `BANK_ACCOUNT_ENCRYPTION_KEY: ${BANK_ACCOUNT_ENCRYPTION_KEY:-}` (để trống thì chính identity báo thiếu; không dùng `:?` vì sẽ làm hỏng cả `infra:up` của người chưa thêm biến).
- `test/setup-infra-env.ts`: khóa cố định chỉ cho test.

### Bước 8 — Kiểm chứng

- `pnpm --filter @realestate/identity test`, `test:e2e`, `test:infra`; lint, format, build, contracts.
- Đếm truy vấn bằng log SQL: route 6 = 1, route 7 = 1, nội bộ = 1, route 8 = 2 (ngưỡng: đọc 3, ghi 6, danh sách 4).
- Compose `apps` trên máy A: `PUT` qua 8080 rồi gọi `/internal` trong mạng Docker.
- Walkthrough `guides/RE_Identity_Code_Walkthrough.md` (chưa có; tạo mới), dòng ở `project-knowledge/CLAUDE.md §2.5`; code-review 5 chiều.

### Playbook

TDD bật (`warn`): mỗi hành vi RED → GREEN → REFACTOR; test đặt cạnh file.

### Môi trường chạy test

Máy này có Docker (A xác nhận 2026-11-18). Claude tự chạy `pnpm infra:up` rồi chạy đủ `test`, `test:e2e`, `test:infra` (có Postgres, Redis, RabbitMQ), không cần nhờ A.

## Blockers / Ghi chú

- 2026-11-19: Docker Desktop đã được A bật lại, hạ tầng chạy; hết chặn.

## Code-review 5 chiều (2026-11-19, trước commit)

- **Security:** không CRITICAL. Số tài khoản không vào log/response (test log 200, 400, 500 mã hỏng); `/internal` `@Public` đúng chỗ, gateway chặn 404; truy vấn có tham số; khóa không in ở thông báo lỗi; `.env` ignore, `.env.example` để trống.
- **Performance:** trong ngưỡng (1/1/1/≤2). `EXPLAIN` dùng 2 index, không Sort. Không N+1, không gọi service trong vòng lặp.
- **Correctness:** khớp `RE.IDENTITY` v2.1. `ON CONFLICT` nguyên tử; Lua nguyên tử; đồng thời có test. MINOR còn lại: lỗi khóa ngoại `23503` → 500 nếu user không còn trong DB (chưa có API xóa) — ghi tech-debt #10.
- **Style:** tên file, chỗ đặt theo `coding-convention`; controller mỏng; env, mã lỗi khai đủ (catalog + `identity.errors.ts`).
- **Reuse:** đã sửa 1 MINOR: `trim` bị lặp ở `upsert-bank-account.dto.ts` → dùng lại `trim` export từ `register.dto.ts`. Còn lại: chép logic `rewriteRefs` từ `check-openapi.mjs` (tech-debt #11), helper test infra lặp (tech-debt #13). Reuse Report đã sửa dòng `ParseUUIDPipe`.
- **Ranh giới service:** không import chéo; không đọc DB service khác.

## Kế hoạch chia commit (chờ A đồng ý, KHÔNG tự commit)

Nhánh `feature/T2.1-identity-bank-account`. Trailer mỗi commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Chỉ `git add` file liệt kê, không `git add -A`.

1. `docs(design): chốt chi tiết T2.1: RE.IDENTITY v2.1, RE.SERVICE_TEMPLATE v1.3, RE.PAYOUT v1.2 (T2.1)`: `design/IDENTITY/RE.IDENTITY/*` (4), `design/SHARED/RE.SERVICE_TEMPLATE/*` (4), `design/PAYMENT/RE.PAYOUT/*` (4), `implementation/van-de-can-quyet-dinh.md`, `standards/security-policy.md`.
2. `feat(template): PageQueryDto, createUuidParamPipe, expectResponseMatchesOpenApi; chép sang identity (T2.1)`: template `page-query.dto(.spec).ts`, `uuid-param.pipe(.spec).ts`, `test/helpers/contracts.ts`, `test/contracts-helper.e2e-spec.ts`, `package.json`, `README.md`; bản chép ở identity (6 file giống hệt); `services/identity/package.json`; `pnpm-lock.yaml`.
3. `feat(identity): revokeAllForUser trong store refresh token (T2.1)`: `stores/refresh-token.store.ts`, `redis-refresh-token.store.ts`, `auth.service.spec.ts` (FakeStore), `test/refresh-token.store.infra-spec.ts`.
4. `feat(identity): tài khoản nhận tiền mã hóa AES-GCM và API nội bộ cho payment (T2.1)`: migration `1732000000000`, `bank-account.entity.ts`, `bank-account.cipher(.spec).ts`, `bank-account.service(.spec).ts`, `bank-account.dto.ts`, `upsert-bank-account.dto(.spec).ts`, `register.dto.ts` (export `trim`), `bank-account.controller.ts`, `users.internal.controller.ts`, `identity.errors.ts`, `src/config/env.validation.ts`, `test/setup-infra-env.ts`, `test/bank-account.infra-spec.ts`, `test/internal-users.infra-spec.ts`, và **một phần** `identity.module.ts` (BankAccount, cipher, hai controller này).
5. `feat(identity): GET /admin/users và index cho danh sách (T2.1)`: migration `1732000000001`, `list-users.query(.spec).ts`, `user-admin.service(.spec).ts`, `users.admin.controller.ts`, `test/admin-users.infra-spec.ts`, phần còn lại của `identity.module.ts`.
6. `chore(identity): BANK_ACCOUNT_ENCRYPTION_KEY bắt buộc, compose, .env.example, tài liệu (T2.1)`: `identity.env.ts`, `identity.env.spec.ts`, `env.bootstrap.spec.ts`, `.env.example` (gốc), `services/identity/.env.example`, `infra/compose/docker-compose.yml`, `services/identity/README.md`, `guides/RE_Docker_Local_Guide.md`, `guides/RE_Identity_Code_Walkthrough.md`, `project-knowledge/CLAUDE.md`, `.claude/state/luuviethoang2005/*` (kể cả `pr-T2.1.md`, có thể bỏ khỏi commit).

`identity.module.ts` dùng chung cho commit 4 và 5: không dùng `git add -p` (không hỗ trợ tương tác); dựng bản trung gian cho commit 4 rồi `git update-index --cacheinfo`. Mỗi commit phải `build` + test của phần mình xanh. Mô tả PR: `pr-T2.1.md`.
