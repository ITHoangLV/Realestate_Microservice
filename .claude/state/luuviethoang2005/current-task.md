---
task: T2.4 listing: seed dữ liệu
created: 2026-11-20
status: done
phase: implementation/PHASE-2.md#T2.4
branch: feature/T2.4-listing-seed (tách từ `develop` sau PR #22, working tree sạch lúc nhận task)
---

## Mô tả

Script nạp dữ liệu dev: 30 tin có tọa độ thật ở Hà Nội (`listing_db`), 3 chủ trọ + 5 người thuê ở `ACTIVE` (`identity_db`, bỏ qua OTP), id cố định cho Postman/k6, chạy lại an toàn. Chạy lại `EXPLAIN` bán kính 2 km trên seed thật và dán plan. Người làm: A (tự giao lại từ B). Hạn M1 — 2026-11-20, ước ~3 giờ.

## Thiết kế liên quan

`design/LISTING/RE.LISTING/` v1.4 (`API_Spec §6` DDL, `§7` mục 15; `Component_Class_Design §1` có thư mục `seed/`), `design/IDENTITY/RE.IDENTITY/` (`seed/`, `users`; T2.5 thêm cột `status` mặc định `ACTIVE` nên seed viết bây giờ vẫn `ACTIVE` sau T2.5). Không đổi `contracts/`, không migration, không dependency mới.

## Definition of Done

- [x] `guides/RE_Docker_Local_Guide.md §5` liệt kê đúng id seed (người dùng, tin) và lệnh chạy
- [x] `EXPLAIN` bán kính 2 km (`ST_DWithin(location, ST_MakePoint(105.84, 21.00)::geography, 2000)`) chạy trên seed thật, plan thật trên seed 30 dòng: `Bitmap Heap Scan on listings` ← `Bitmap Index Scan on ix_listings_location` (không phải `Seq Scan`); test 4 / T2.3 (~5.000 dòng) vẫn là bằng chứng chính
- [x] Chạy lại seed lần 2 không đổi dữ liệu, không lỗi (test hạ tầng)
- [x] Test của seed pass (dán output): unit `test`, `test:infra` của identity và listing
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi
- [x] Lệnh "Kiểm chứng" của task chạy đúng (dán output): seed vào DB thật rồi `GET /api/v1/listings?lat=21.00&lng=105.84&radiusKm=2` qua compose `apps` (nếu chạy được)
- [x] `guides/RE_Listing_Code_Walkthrough.md` và `RE_Identity_Code_Walkthrough.md` cập nhật (không tạo file mới); README `services/listing`, `services/identity` thêm lệnh seed

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (chờ duyệt)
- [x] 3. Code + test theo TDD (playbook `tdd` bật, `warn`): identity `seed:users`, listing `seed:listings`
- [x] 4. Chạy test, seed vào DB thật, `EXPLAIN`, xác nhận PASS
- [x] 5. Viết/cập nhật walkthrough, `code-review` 5 chiều, chuẩn bị PR

## Tái sử dụng

Quét trên source hiện tại (`services/_template-nest/src`, `services/identity/src`, `services/listing/src`):

| Nhu cầu | Quyết định | Chỗ có sẵn |
|---|---|---|
| Băm mật khẩu argon2id | DÙNG LẠI | `identity/src/identity/services/password.service.ts` (`PasswordService`, nhận làm tham số như `seedAdmin`) |
| Sự kiện `identity.registered` + outbox | DÙNG LẠI | `src/messaging/domain-event.ts` (`buildDomainEvent`); mẫu `seedAdmin` ghi `outbox_events` cùng transaction |
| Khung script CLI (nạp `.env`, kiểm biến, `DataSource` riêng, không khởi động Nest) | DÙNG LẠI mẫu | `identity/src/scripts/seed-admin.ts`; chép cấu trúc, không tách hàm chung (chỉ 2 chỗ dùng, mỗi service một bản) |
| Hằng loại BĐS, trạng thái, duyệt, tiện ích | DÙNG LẠI | `listing/src/listing/entities/listing.enums.ts` (`PROPERTY_TYPES`, `AMENITIES`, …) dùng để gõ kiểu dữ liệu seed và kiểm trong test |
| Test hạ tầng (schema riêng, `readRootEnv`) | DÙNG LẠI | `listing/test/helpers/infra.ts`; mẫu `identity/test/seed-admin.infra-spec.ts` |
| `seedUsers` + dữ liệu 8 người dùng (identity) | VIẾT MỚI | không có bản tương đương; `seedAdmin` chỉ tạo ADMIN và từ chối email đã có vai trò khác |
| `seedListings` + dữ liệu 30 tin (listing) | VIẾT MỚI | không có |
| 3 UUID chủ trọ ở cả hai service | VIẾT MỚI, **lặp có chủ đích** | listing không được import code identity (ranh giới service); hai bản ghi chú trỏ nhau, bảng id ở Docker guide §5 là nguồn đối chiếu |

Không chạm `_template-nest`. Không có thành phần dùng chung mới (seed là code riêng của từng service).

## Kế hoạch chi tiết

**A đã duyệt 2026-11-20 kèm chỉnh sửa** (xem mục "Chỉnh sửa khi duyệt"; các mục 1–8 bên dưới vẫn đúng trừ chỗ bị chỉnh sửa ghi đè). Ghi chú: TDD bật → mỗi hành vi viết test thấy FAIL trước, rồi mới code.

### Chỉnh sửa khi duyệt (ghi đè phần bên dưới)

1. `seed:users` **không** ghi `status`, `email_verified_at` (cột chưa có, thuộc T2.5, cũng do A làm). Ghi tech-debt #16: khi làm T2.5 cập nhật seed set hai cột này kèm test.
2. Email trùng nhưng khác id (hoặc khác vai trò) → báo lỗi rõ ràng (`SeedUsersError`), không đổi gì.
3. `SEED_USER_PASSWORD` ≥ 12 ký tự (không phải 8).
4. Thêm 2–3 tin `APPROVED` + `AVAILABLE` ở 2,1–3 km quanh (21.00, 105.84); trong 2 km có ít nhất 1 tin `PENDING_REVIEW` và 1 tin `HIDDEN`.
5. Kiểm `cọc ≤ giá` chỉ là kiểm dữ liệu seed trong test, **không** gắn `[cần xác nhận]` vào thiết kế và không thêm vào tài liệu thiết kế.

### Quyết định ban đầu (đã duyệt, trừ chỗ chỉnh sửa ở trên)

1. **Phạm vi chạm identity:** T2.4 ghi "listing" nhưng 8 tài khoản nằm ở `identity_db` (listing không được ghi). Đề xuất thêm `pnpm --filter @realestate/identity seed:users`. Nếu không, chủ trọ seed không đăng nhập được và `owner_id` của tin trỏ vào người không tồn tại.
2. **Id cố định** (UUID hợp lệ, dễ đọc): chủ trọ `a0000000-0000-4000-8000-00000000000{1..3}`, người thuê `b0000000-0000-4000-8000-00000000000{1..5}`, tin `c0000000-0000-4000-8000-0000000000{01..30}`. Email `landlord1..3@seed.realestate.local`, `tenant1..5@seed.realestate.local`.
3. **Mật khẩu:** biến tạm `SEED_USER_PASSWORD` (≥ 8 ký tự, bằng mức đăng ký), không ghi vào `.env` (`security-policy.md §1`); mọi tài khoản seed dùng chung.
4. **Cơ cấu 30 tin:** 24 `AVAILABLE` + `APPROVED` (đủ cho tìm kiếm, k6, đặt cọc); 3 `PENDING_REVIEW` (demo màn duyệt của ADMIN); 1 `REJECTED` (kèm `reject_reason`); 1 `HIDDEN`; 1 `RENTED`. Không tạo `HELD`/`DEPOSITED` (cần `held_by_deposit_id` của đơn có thật). Ít nhất 10 tin `APPROVED`+`AVAILABLE` trong 2 km quanh (21.00, 105.84), phần còn lại rải ở các quận khác (Cầu Giấy, Tây Hồ, Hà Đông, Nam Từ Liêm…).
5. **Ảnh:** không seed `listing_images` (cần đối tượng thật trên S3). Route 11 đã `LEFT JOIN LATERAL` nên tin không ảnh trả `coverImage` rỗng. Ảnh upload qua API khi demo.
6. **Sự kiện:** `seedUsers` ghi `identity.registered` vào outbox cho tài khoản **mới tạo** (như `seedAdmin`); chạy lại không ghi thêm.
7. `reviewed_by` để `NULL` cho tin `APPROVED`/`REJECTED` (id ADMIN seed là ngẫu nhiên, không cố định); `reviewed_at = now()`.
8. Seed **không ghi đè** dòng đã có (`ON CONFLICT (id) DO NOTHING`), để không phá dữ liệu demo đã sửa; email đã có nhưng id/vai trò khác seed → báo lỗi, không tự đổi.

### File tạo

| File | Nội dung |
|---|---|
| `services/identity/src/identity/seed/seed-users.data.ts` | 3 `LANDLORD` + 5 `TENANT` cố định (id, email, họ tên) |
| `services/identity/src/identity/seed/seed-users.ts` | `seedUsers(dataSource, { password }, passwords)`: một transaction, `INSERT ... ON CONFLICT DO NOTHING`, đối chiếu id/vai trò khi trùng email, outbox cho người mới; trả `{ created, existing }` |
| `services/identity/src/identity/seed/seed-users.spec.ts` | Unit: dữ liệu (id/email duy nhất, 3+5, vai trò), kiểm mật khẩu, không chạm DB khi đầu vào sai |
| `services/identity/test/seed-users.infra-spec.ts` | Hạ tầng: lần 1 tạo 8 + 8 event khớp hợp đồng (`expectEventMatchesContract`), lần 2 không đổi gì, email trùng khác id → lỗi, đăng nhập được bằng mật khẩu seed |
| `services/identity/src/scripts/seed-users.ts` | CLI (mẫu `seed-admin.ts`); `package.json` thêm `seed:users` |
| `services/listing/src/listing/seed/seed-listings.data.ts` | 30 tin: id, chủ trọ, tiêu đề, loại, giá, cọc, diện tích, địa chỉ, quận, lat/lng thật, tiện ích, trạng thái |
| `services/listing/src/listing/seed/seed-listings.ts` | `seedListings(dataSource)`: một transaction, `INSERT ... ON CONFLICT (id) DO NOTHING`, `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`; trả `{ created, existing }` |
| `services/listing/src/listing/seed/seed-listings.spec.ts` | Unit: đúng 30 tin, id duy nhất, enum hợp lệ (`listing.enums.ts`), tọa độ trong khung Hà Nội, `0 < cọc ≤ giá` (chỉ kiểm dữ liệu seed), chủ trọ thuộc 3 id, cơ cấu trạng thái, ≥ 10 tin trong 2 km |
| `services/listing/test/seed-listings.infra-spec.ts` | Hạ tầng (schema riêng, Postgres thật): chạy 2 lần → 30 dòng, lần 2 `created = 0`; route 11 tìm 2 km trả đúng tập mong đợi, chỉ `APPROVED` |
| `services/listing/src/scripts/seed-listings.ts` | CLI; `package.json` thêm `seed:listings` |

### File sửa

`services/identity/package.json`, `services/listing/package.json` (script); `project-knowledge/guides/RE_Docker_Local_Guide.md §5` (bảng id + lệnh, thay `[cần xác nhận]`); `guides/RE_Listing_Code_Walkthrough.md`, `RE_Identity_Code_Walkthrough.md`; `services/listing/README.md`, `services/identity/README.md`; `implementation/van-de-can-quyet-dinh.md` mục D (một dòng chốt cơ cấu seed); nếu A đồng ý quyết định 1: `RE.IDENTITY/Component_Class_Design.md` thêm `seed-users` (kèm `CHANGELOG.md`, tăng phiên bản).

### Không đổi

`contracts/` (không API, không sự kiện mới; event `identity.registered` đã có), migration, gateway, compose, `_template-nest`, dependency.

### Test (tầng)

| Test | Tầng |
|---|---|
| Dữ liệu và đầu vào `seedUsers`, `seedListings` | `test` (unit) |
| Idempotent, xung đột email, event khớp hợp đồng, đăng nhập bằng tài khoản seed | `test:infra` (identity) |
| Idempotent, tìm kiếm 2 km trên seed | `test:infra` (listing) |

### Số truy vấn, ngưỡng NFR

Không thêm endpoint. Seed là lệnh chạy tay, mỗi tin một `INSERT` trong một transaction (30 + 8 câu, bỏ qua ngưỡng số truy vấn của request). Không vượt ngưỡng nào.

### Kiểm chứng cuối

```powershell
pnpm --filter @realestate/identity test ; pnpm --filter @realestate/identity test:infra
pnpm --filter @realestate/listing test ; pnpm --filter @realestate/listing test:infra
pnpm lint ; pnpm format:check ; pnpm build ; pnpm contracts:check
$env:SEED_USER_PASSWORD='<≥8 ký tự>'; pnpm --filter @realestate/identity seed:users     # 2 lần
pnpm --filter @realestate/listing seed:listings                                           # 2 lần
# EXPLAIN bán kính 2 km trên listing_db thật, dán plan nhận được
```

## Blockers / Ghi chú

- Phụ thuộc T2.3 và T2.1: đã tick (PR #21, PR #16). Không có blocker.
- `progress.md` ghi T2.4 là B; `PHASE-2.md` cho A tự giao lại. Sửa dòng ở `progress.md` lúc tick sau merge, như T2.3.
- T2.5 thêm `status DEFAULT 'ACTIVE'`, `email_verified_at`: A chốt 2026-11-20 là nợ kỹ thuật #16 (cập nhật `seed-users` set hai cột kèm test khi làm T2.5).

## Kết quả kiểm chứng (2026-11-20)

- identity: unit 211, e2e 97, infra 107 PASS (thêm `seed-users` 10 unit + 8 infra). listing: unit 371, e2e 97, infra 118 PASS (thêm `seed-listings` 15 unit + 9 infra).
- `pnpm lint`, `format:check`, `build`, `contracts:check` (4 spec OK) không lỗi.
- Seed vào DB dev thật, mỗi lệnh chạy hai lần: `seed:users` tạo 8 rồi 0 (có sẵn 8); `seed:listings` tạo 30 rồi 0 (có sẵn 30).
- `EXPLAIN` bán kính 2 km trên `listing_db` thật (30 dòng, sau `ANALYZE`): `Bitmap Heap Scan on listings` ← `Bitmap Index Scan on ix_listings_location`, `rows=15`, `Execution Time: 6.556 ms`.
- Smoke qua gateway 8080: `GET /api/v1/listings?lat=21.00&lng=105.84&radiusKm=2&sort=distance` trả 12 tin (11 `AVAILABLE` + tin 13 `RENTED`), tăng dần 245 m → 1935 m; `/internal/listings/...` từ ngoài `404`.
- code-review 5 chiều: không CRITICAL, không MAJOR. Đã sửa 2 MINOR (infra-spec dùng lại `haversineM` của `test/helpers`, `seed-users` dùng lại `PASSWORD_MAX_LENGTH` của `seed-admin`).
- Việc còn lại: commit, PR, tick `progress.md` sau merge (sửa người làm B → A).
