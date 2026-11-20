---
task: T2.2 listing: khung, CRUD sản phẩm, duyệt, ảnh
created: 2026-11-19
status: in_progress
phase: implementation/PHASE-2.md#T2.2
branch: feature/T2.2-listing-crud (tách từ origin/develop b0e66f1, đã có C19)
---

## Mô tả

Tạo `services/listing` từ `_template-nest` (cổng 3002, `listing_db` PostGIS, bucket `listing-images`) và làm phần ghi của `RE.LISTING`: thêm, sửa, ẩn, hiện, xóa mềm sản phẩm (route 1–5), tải ảnh bằng presigned PUT (route 7–8), quản trị viên duyệt hoặc từ chối (route 9–10). Người làm: A (tự giao lại từ B, `PHASE-2.md`). Hạn M1 — 2026-11-27, ước ~14 giờ.

## Thiết kế liên quan

`design/LISTING/RE.LISTING/` v1.1 (API_Spec §1, §4–§7; Component_Class_Design §1–§3; Processing_Flow §2, §4–§5), ADR-0010, ADR-0014, `design/SHARED/RE.SERVICE_TEMPLATE/` v2.0. Hợp đồng `contracts/openapi/listing-internal.v1.yaml`: **không đổi** (internal là T2.3).

## Definition of Done

- [x] Test 1, 2, 3, 12 ở `RE.LISTING/Component_Class_Design.md §3` pass (Báo cáo T04, T18)
- [x] `pnpm --filter @realestate/listing test`, `test:e2e`, `test:infra` PASS: unit 233, e2e 97, infra 52 (2026-11-20)
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi (contracts: 4 spec OK)
- [x] Migration chạy đúng DDL `API_Spec.md §6` (GiST `ix_listings_location`, `held_by_deposit_id`) trên `listing_db` thật
- [x] Số truy vấn mỗi endpoint trong ngưỡng `non-functional-standards.md §1`, đếm bằng log SQL (dán số)
- [x] `listing` chạy trong compose profile `apps`, gọi qua gateway 8080 (route đã có ở `routes.ts`)
- [x] `RE.LISTING` v1.2 + `CHANGELOG.md`, `RE.SERVICE_TEMPLATE` v2.1 + `CHANGELOG.md` (nếu mở rộng template)
- [x] Walkthrough `guides/RE_Listing_Code_Walkthrough.md` + dòng ở `project-knowledge/CLAUDE.md §2.5`

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết (A duyệt 2026-11-19)
- [x] 3. Template: thêm `StorageService.headObject` (TDD), chép sang identity (giữ bản chép giống hệt) — unit 101, e2e 111, infra storage 6 PASS; identity unit 201, e2e 97 PASS
- [x] 4. Sửa tài liệu trước code: `RE.LISTING` v1.2 (response DTO, các điểm `[cần xác nhận]` đã chốt), `RE.SERVICE_TEMPLATE` v2.1
- [x] 5. Scaffold `services/listing` (service-scaffold), dọn module mẫu, env riêng
- [x] 6. Migration `listings`, `listing_images` + entity
- [x] 7. `ListingCommandService`, `ListingReviewService`, `ListingImageService`, `ListingQueryService` (chỉ `findPublic`, `findMine`) + controller + DTO (TDD)
- [x] 8. Compose profile `apps`, `.env.example`, `project-structure.md`
- [x] 9. Chạy test, lệnh kiểm chứng, đếm truy vấn, `progress-tracker`
- [x] 10. Walkthrough, `code-review` 5 chiều, chuẩn bị PR

## Tái sử dụng (Reuse Report)

> Quét 2026-11-19 · Nguồn: `services/_template-nest/src` (nhánh C19), `services/identity/src`, `services/api-gateway/src`, `contracts/openapi/`, `package.json` identity · Cách tra: đọc file + Grep `slug|haversine|ST_|geography|presign|ParseUUIDPipe`, `diff -rq` template ↔ identity
> Từ khóa: presign, headObject, geography, pagination, UUID pipe, roles, bigint · Vùng mù: `services/listing/src` chưa tồn tại (chưa quét được, sẽ là bản chép của template)

| Thành phần cần | Nhóm | Vị trí đã có / lý do |
|---|---|---|
| Khung service (common, config, database, health, storage, messaging, redis) | DÙNG LẠI (chép nguyên) | `services/_template-nest` sau C19; chép bằng `robocopy` theo README §1, không sửa riêng |
| Kiểm UUID đường dẫn | DÙNG LẠI | `src/common/errors/uuid-param.pipe.ts#createUuidParamPipe('id')` (ESLint chặn `ParseUUIDPipe`) |
| Phân trang | DÙNG LẠI | `src/common/response/page-query.dto.ts#PageQueryDto`, `Paginated` (`/mine`) |
| Vai trò, người gọi | DÙNG LẠI | `@Roles('LANDLORD')`, `@Roles('ADMIN')`, `@CurrentUser('sub')`; token có `roles: string[]` |
| Lỗi chuẩn | DÙNG LẠI | `AppException`, `ErrorCode.VALIDATION_FAILED`; mã `LISTING_*` theo mẫu `identity.errors.ts` |
| Presigned PUT/GET | DÙNG LẠI | `src/storage/storage.service.ts#presignPut`, `presignGet` |
| `bigint` → number | DÙNG LẠI | `src/database/transformers.ts#bigintToNumber` (`price_vnd`, `deposit_amount_vnd`) |
| Test helper | DÙNG LẠI | `test/helpers/` (`createTestApp`, `infra.ts`, `expectResponseMatchesOpenApi`) |
| `HeadObject` kiểm kích thước ảnh | **MỞ RỘNG** | Thêm `StorageService.headObject(bucket, key)` → `{ contentLength, contentType } \| null`. Phần kỹ thuật chung → sửa `_template-nest` trước (ADR-0014, PR do A duyệt), chép sang listing và identity. `README.md` template §3 đã yêu cầu `HeadObject` nhưng chưa có hàm |
| Số thực `numeric(8,2)` → number (`area_m2`) | VIẾT MỚI (trong `listing/entities`) | Đã quét `transformers.ts`: chỉ có `bigintToNumber`. Transformer của riêng cột này, không đưa vào `common` (không phải thứ nhiều service dùng) |
| Hằng/enum `PropertyType`, `Amenity` (11 mã), `ApprovalStatus`, `ListingStatus` | VIẾT MỚI (`listing/entities`) | Nghiệp vụ listing; chưa có ở đâu. `ListingStatus` T2.3 dùng lại |
| Quy tắc "sửa trường nào thì duyệt lại" (`requiresReview`) | VIẾT MỚI (`listing/services`, hàm thuần) | Luật nghiệp vụ `API_Spec §1.1`; chưa có |
| Tạo/kiểm `object_key` (`listings/{id}/{uuid}.{ext}`) | VIẾT MỚI (hàm thuần trong `listing-image.service.ts`) | Luật riêng của listing; payment (T3.6) dùng key khác |
| Biến `LISTING_IMAGE_*`, cờ `isListingEnabled()` | VIẾT MỚI theo mẫu identity | `env.validation.ts` + `config/listing.env.ts` + `feature-flags.ts` (đúng cách identity gắn `identity.env.ts`) |

Không tạo thành phần dùng chung mới ngoài `headObject`.

Bổ sung khi code (thành phần nội bộ listing, không thuộc `common`): `ListingPresenter` (đổi dòng → DTO + một truy vấn ảnh cho cả trang, nhóm VIẾT MỚI: đã quét template, identity với `present|presign|images`, không có), `listing.sql.ts` (`listingColumns`, `pointSql`, `rowsOf`, `isUniqueViolation`), `dto/trim.ts` (identity có `trim` trong `register.dto.ts` nhưng không import chéo được, một dòng, giữ riêng).

## Kế hoạch chi tiết

### Đã chốt 2026-11-19 (A duyệt kế hoạch) — ghi vào `RE.LISTING` v1.2 + `CHANGELOG.md`

- Q1 đồng ý (làm route 6, 12). Q4, Q5 đồng ý.
- **Q2 (sửa):** tin `REJECTED` sửa **bất kỳ** trường nào hoặc thêm ảnh → `PENDING_REVIEW`, xóa `reject_reason`, `reviewed_*`. Quy tắc "giá/cọc/diện tích/tiện ích không duyệt lại" chỉ áp cho tin `APPROVED`.
- **Q3 (sửa):** xác nhận lại cùng `key` → `200` kèm ảnh đã có (idempotent), không `409`, không đổi trạng thái duyệt.
- **Q6:** làm trên `feature/T2.2-listing-crud` từ `origin/develop`.
- **(1)** Sửa tài liệu `RE.LISTING` v1.2 và `RE.SERVICE_TEMPLATE` v2.1 **trước** khi code `headObject`.
- **(2)** Route 8: ảnh không hợp lệ (quá cỡ, sai loại) → gọi `deleteObject`, lỗi khi xóa chỉ ghi log `warn`. Ghi `tech-debt.md`: ảnh đã lấy upload-url mà không xác nhận thì mồ côi trên S3.
- **(3)** `API_Spec §1.4` ghi rõ route 12 vẫn trả tin `HIDDEN`.

### Điểm đề xuất ban đầu (đã chốt ở trên; giữ để đối chiếu)

| # | Điểm | Đề xuất (mặc định nếu A không nói gì) |
|---|---|---|
| Q1 | **Phạm vi đọc ở T2.2.** `PHASE-2` T2.2 chỉ liệt kê 3 service ghi, nhưng test 3 ("không xuất hiện ở tìm kiếm") và việc quan sát kết quả cần route đọc | Làm thêm **route 6 (`/mine`) và route 12 (`GET /:id`)** với `ListingQueryService.findMine/findPublic`. Giữ route 11 (tìm kiếm), `snapshot`, `/internal/*`, giữ chỗ cho **T2.3**. Test 3 ở T2.2 kiểm qua `GET /:id` (404 khi `PENDING_REVIEW`); phần "tìm kiếm" của test 3 gộp vào test 4 ở T2.3 |
| Q2 | **Sửa tin `REJECTED`**: thiết kế chỉ nói `APPROVED` bị sửa nội dung hiển thị → `PENDING_REVIEW` | Sửa nội dung hiển thị tin `REJECTED` cũng → `PENDING_REVIEW`, xóa `reject_reason`, `reviewed_*` (nộp lại). Nếu không, tin bị từ chối là ngõ cụt |
| Q3 | **Xác nhận lại cùng `key`** (route 8) khi `object_key` đã có (UNIQUE) | `409 CONFLICT` (mã chung, không thêm mã mới). Thêm mã `LISTING_*` thì A duyệt |
| Q4 | **Hình dạng response/request** thiết kế chưa ghi: `ListingDto` (id, ownerId, các trường §1.1 gồm `lat`/`lng`, `status`, `approvalStatus`, `rejectReason` (chỉ chủ tin/`mine`), `createdAt`, `updatedAt`, `images[{ id, url, sortOrder }]`; không lộ `version`, `held_*`, `reviewed_by`); upload-url trả `{ uploadUrl, key, expiresInSeconds }` (`201`? → `200`, vì không tạo bản ghi); route 5 trả `204`; route 3, 4, 9, 10 trả `ListingDto`; reject body `{ reason }` 1–500 ký tự; xác nhận ảnh trả `201 { id, url, sortOrder }` | Chốt như bên trái; ghi vào `API_Spec.md §1.4` mới |
| Q5 | **Migration messaging**: listing không phát/nghe sự kiện (`API_Spec §3`), nhưng template có `CreateMessagingTables` và `messaging.infra-spec.ts` | Giữ nguyên bản chép (không sửa riêng, ADR-0014): `RABBITMQ_URL` không đặt nên `MessagingModule` không nạp; bảng `outbox_events`, `processed_events` có trong `listing_db` nhưng không dùng. Ghi 1 dòng vào `tech-debt.md` |
| Q6 | **Nhánh git**: C19 (`fix/C19-uuid-validation-failed`) chưa vào `develop`, T2.2 phải chép template đã sửa | Tạo `feature/T2.2-listing-crud` **từ nhánh C19** (stacked, mở PR sau khi PR C19 merge) hoặc chờ merge rồi tách từ `develop`. Không tự chạy, A chọn |

### Bước 3 — Template: `headObject` (TDD, `warn`)

Đổi `services/_template-nest` (PR do A duyệt):

1. `src/storage/storage.service.spec.ts` (**mới**, RED trước): mock `client.send` → trả `ContentLength/ContentType` → `{ contentLength, contentType }`; ném `NotFound`/`NoSuchKey` (`S3ServiceException`, status 404) → `null`; lỗi khác → ném lại.
2. `src/storage/storage.service.ts`: thêm `headObject(bucket, key)`.
3. `test/storage.infra-spec.ts`: thêm ca với Silo thật (PUT 1 byte → head đúng kích thước; key không có → `null`).
4. Chép `storage.service.ts` sang `services/identity/src/storage/` (`diff` rỗng). Không chép spec (identity không dùng S3; spec của template ở lại template).
5. Tài liệu: `RE.SERVICE_TEMPLATE/Component_Class_Design.md` (dòng `StorageService`), `README.md` template §3 Object storage ("kiểm bằng `storage.headObject`"), `CHANGELOG.md` v2.1 MINOR, header 3 file → v2.1.

### Bước 4 — Tài liệu `RE.LISTING` v1.2

`API_Spec.md`: thêm §1.4 "Request/response" (Q4), cập nhật §1.1 (Q2), §1.2 dòng Q3, §7 "Đã chốt 2026-11-19"; `Component_Class_Design.md` §1 ghi `findMine/findPublic` thuộc T2.2 (Q1) và `listing-edit.rules.ts`; `CHANGELOG.md` mục `[v1.2] — 2026-11-19` (MINOR); header → v1.2; `van-de-can-quyet-dinh.md` mục D thêm một dòng.

### Bước 5 — Scaffold `services/listing` (skill `service-scaffold`, theo `README.md` template §1)

- `robocopy` template → `services/listing` (loại `node_modules`, `dist`, `.env`, `openapi.json`); đổi `package.json` (`@realestate/listing`), `.env.example` (`SERVICE_NAME=listing`, `PORT=3002`), `Dockerfile`.
- Dọn module mẫu: xóa `src/example/`, `ExampleModule` ở `app.module.ts`, `test/example.e2e-spec.ts`, entity + migration mẫu. Giữ test hạ tầng còn lại.
- `src/config/feature-flags.ts`: `isListingEnabled()` = DB + S3 (không cần Redis, RabbitMQ). `app.module.ts`: nạp `ListingModule` sau `DatabaseModule`, `StorageModule`.
- `src/config/env.validation.ts`: thêm `LISTING_IMAGE_MAX_BYTES` (5242880), `LISTING_IMAGE_MAX_COUNT` (10), `LISTING_IMAGE_TYPES` (`image/jpeg,image/png,image/webp`). `src/listing/config/listing.env.ts` + hook ở `env.bootstrap.ts`: bắt buộc `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKETS` chứa `listing-images`, `JWT_PUBLIC_KEY(_PATH)`, `JWT_ISSUER`; bỏ qua khi `NODE_ENV=test` (như identity).
- `test/setup-infra-env.ts`: đổi sang `LISTING_DB_*`, schema `listing_infra_test`, `search_path=listing_infra_test,public` (để thấy kiểu `geography` của PostGIS ở `public`); thêm S3 (Silo), bucket `listing-images`.

### Bước 6 — Migration và entity

- `src/database/migrations/1733000000000-create-listings.ts`: đúng DDL `API_Spec §6` (CHECK, 4 index kể cả `ix_listings_location` GiST, `listing_images` + FK cùng service). **Không** `CREATE EXTENSION` (listing_user không phải superuser; extension đã có từ `01-create-databases.sh`).
- `src/listing/entities/listing.entity.ts`, `listing-image.entity.ts`. Cột `location` khai `geography`, `select: false`; đọc `lat`/`lng` bằng `ST_Y/ST_X(location::geometry)`, ghi bằng `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` trong query builder.

### Bước 7 — Code (file mới, TDD cho hàm thuần và DTO; infra cho truy vấn)

```text
services/listing/src/listing/
├─ listing.module.ts
├─ config/listing.env.ts (+ .spec.ts)
├─ controllers/
│  ├─ listings.controller.ts          # route 1–5, 6, 7, 8, 12 (@Roles('LANDLORD'); 12 là @Public)
│  └─ listings.admin.controller.ts    # route 9–10 (@Roles('ADMIN'))
├─ services/
│  ├─ listing-command.service.ts      # create, update, hide, unhide, softDelete (UPDATE có điều kiện)
│  ├─ listing-edit.rules.ts (+ .spec) # requiresReview(changedFields, currentApproval) — hàm thuần
│  ├─ listing-review.service.ts       # approve, reject
│  ├─ listing-image.service.ts        # createUploadUrl, confirm (+ .spec cho hàm key)
│  └─ listing-query.service.ts        # findMine, findPublic (T2.3 thêm search, snapshot)
├─ dto/ create-listing.dto, update-listing.dto, reject-listing.dto, upload-url.dto, confirm-image.dto,
│       list-mine.query, listing.dto  (+ .spec cho DTO: tiện ích lạ → 400, title 5–200, số ≤ 0 → 400)
├─ entities/ listing.entity, listing-image.entity, listing.enums.ts
└─ errors/listing.errors.ts           # 8 mã ở API_Spec §4
```

Hành vi chốt từng route (theo `API_Spec §1.2`, `Processing_Flow §4`):

| Route | Cách làm | Truy vấn DB (ngưỡng) |
|---|---|---|
| 1 `POST /listings` | `INSERT ... RETURNING`, `PENDING_REVIEW`, `AVAILABLE`, `ownerId = sub`; `201` | 1 (≤ 6) |
| 2 `PATCH /:id` | Đọc tin (404/403), tính `requiresReview`, một `UPDATE ... SET approval_status = CASE WHEN <đổi nội dung> AND approval_status IN ('APPROVED','REJECTED') THEN 'PENDING_REVIEW' ELSE approval_status END ... RETURNING` (CASE trên giá trị **hiện tại** nên đua với duyệt không để lọt nội dung chưa duyệt), đọc ảnh | 3 (≤ 6) |
| 3 `hide` | `UPDATE ... WHERE id AND owner_id AND status='AVAILABLE' AND deleted_at IS NULL`; 0 dòng → đọc lại chọn `404/403/409 LISTING_INVALID_STATUS` | 2–3 |
| 4 `unhide` | như 3, `HIDDEN → AVAILABLE` | 2–3 |
| 5 `DELETE` | `UPDATE ... SET deleted_at WHERE id AND owner_id AND status NOT IN ('HELD','DEPOSITED') AND deleted_at IS NULL`; 0 dòng → đọc lại chọn `404/403/409 LISTING_HAS_ACTIVE_DEPOSIT`; `204` | 1–2 |
| 6 `GET /mine` | `count` + `data` (sắp `created_at DESC, id DESC`) + ảnh của trang (`listing_id = ANY($1)`), mặc định `pageSize` 20, tối đa 50 | 3 (≤ 4) |
| 7 `upload-url` | Đọc tin + đếm ảnh (404/403/`409 LISTING_IMAGE_LIMIT_REACHED`); loại file ngoài `LISTING_IMAGE_TYPES` → `400 LISTING_IMAGE_INVALID`; key `listings/{id}/{uuid}.{ext}`; `presignPut` | 2 |
| 8 `images` | Đọc tin (404/403) → kiểm `key` đúng tiền tố `listings/{id}/` và dạng `{uuid}.{ext}` → `headObject` (không có, quá `LISTING_IMAGE_MAX_BYTES`, sai loại → `400 LISTING_IMAGE_INVALID`, **không lưu key**) → transaction ngắn: `SELECT ... FOR UPDATE` tin, đếm ảnh (≥ 10 → `409 LISTING_IMAGE_LIMIT_REACHED`, khóa dòng để hai request đồng thời không vượt 10), `INSERT` ảnh, `UPDATE` về `PENDING_REVIEW` nếu đang `APPROVED`/`REJECTED`. `headObject` gọi **ngoài** transaction | 5 (≤ 6) |
| 9 `approve` | `UPDATE ... SET approval_status='APPROVED', reviewed_by, reviewed_at, reject_reason=NULL WHERE id AND deleted_at IS NULL AND approval_status='PENDING_REVIEW'`; 0 dòng → đọc lại chọn `404 / 409 LISTING_ALREADY_REVIEWED` | 3 |
| 10 `reject` | như 9, `reason` bắt buộc 1–500 ký tự | 3 |
| 12 `GET /:id` | Tin `APPROVED`, chưa xóa (HIDDEN vẫn xem được, đúng chữ `API_Spec §1`) + ảnh; presign GET ký cục bộ, không gọi mạng | 2 (≤ 3) |

Không vòng lặp truy vấn, không gọi HTTP trong transaction, không gọi service khác (listing không có `clients/`).

### Playbook TDD (`warn`)

RED → GREEN → REFACTOR cho: `headObject`, `listing-edit.rules`, hàm tạo/kiểm key ảnh, DTO, `listing.env`. Truy vấn có điều kiện, transaction, ràng buộc kiểm bằng `*.infra-spec.ts` với Postgres + Silo thật (đúng `playbooks/tdd/tdd-guide.md §5` mục 4). Controller, module, entity, migration không đòi spec riêng.

### Test sẽ viết

| Test thiết kế | Ca | Tầng |
|---|---|---|
| 1 (T04) | `PATCH` bởi người khác chủ → `403 LISTING_NOT_OWNER`; thêm: `hide`, `DELETE`, `upload-url`, `images` cũng `403`; id không có/đã xóa → `404 LISTING_NOT_FOUND` | `test:infra` (`listing-crud.infra-spec.ts`) |
| 2 (T18) | Xóa tin `HELD`, `DEPOSITED` → `409 LISTING_HAS_ACTIVE_DEPOSIT`, `deleted_at` vẫn `NULL`; tin `AVAILABLE` → `204` | `test:infra` (đặt `status` bằng SQL vì T2.3 chưa có giữ chỗ) |
| 3 | Tạo tin → `201`, `PENDING_REVIEW`, `AVAILABLE`; `GET /:id` ẩn danh → `404`; duyệt rồi → `200`; sửa `title` → về `PENDING_REVIEW` (`GET` lại `404`), sửa `priceVnd` → vẫn `APPROVED` | `test:infra` + `listing-edit.rules.spec.ts` |
| 12 | Ảnh > 5 MB (PUT 6 MB lên Silo qua presigned URL) → `400 LISTING_IMAGE_INVALID`, bảng `listing_images` không có dòng; key không tồn tại → `400`; ảnh hợp lệ → `201`; ảnh thứ 11 → `409 LISTING_IMAGE_LIMIT_REACHED`; hai `confirm` đồng thời khi còn 1 chỗ → đúng một `201` | `test:infra` + `listing-image.service.spec.ts` (hàm key) |
| thêm | Ẩn/hiện, duyệt trùng → `409 LISTING_ALREADY_REVIEWED`; reject thiếu lý do → `400`; role: `TENANT` gọi route 1 → `403 FORBIDDEN_ROLE`, `LANDLORD` gọi route 9 → `403`; token thiếu → `401` | `test:e2e` (không cần DB) + `test:infra` |
| thêm | DTO: `amenities` mã lạ → `400 VALIDATION_FAILED`; `title` 4 ký tự; `priceVnd` ≤ 0; id không phải UUID → `400` "id phải là UUID" | `*.spec.ts` + `test:e2e` |
| thêm | `swagger.e2e-spec.ts` còn xanh, `openapi:export` ra `services/listing/openapi.json` có route 1–10, 12; route nội bộ không lộ | `test:e2e` |
| thêm | `EXPLAIN` ix_listings_location tồn tại (chỉ kiểm index có trong catalog; `EXPLAIN` bán kính là T2.3) | `test:infra` |

### Bước 8 — Nối hệ thống

- `infra/compose/docker-compose.yml`: service `listing` (profile `apps`, `container_name: re-listing`, **không** `ports:`), `DATABASE_URL` tới `postgres:5432`, `S3_ENDPOINT: http://s3:9000`, `S3_PUBLIC_ENDPOINT: http://localhost:9000`, `S3_BUCKETS: listing-images`, `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`, `secrets: [jwt_public_key]`, `depends_on` postgres + s3 healthy (**s3 hiện thuộc profile `dev, demo`**; chạy `apps` phải kèm `dev` như skill đã ghi). Cùng commit: `.env.example` của service, `LISTING_IMAGE_*` trong compose.
- Gateway: `routes.ts` đã có đủ route listing (dòng 43–48, `route-resolver.spec.ts` đã có các ca listing) và `INTERNAL_LISTING_URL` → **không đổi gateway**. Kiểm lại bằng test gateway hiện có, không sửa.
- `project-knowledge/project-structure.md`: đánh dấu `listing` ✓ khi cây thật lệch.
- Migration chạy từ host: `pnpm --filter @realestate/listing migration:run` (compose không tự chạy).

### Bước 9 — Kiểm chứng cuối

```powershell
pnpm infra:up                                              # postgres, redis, rabbitmq, s3
pnpm --filter @realestate/template-nest test; pnpm --filter @realestate/template-nest test:e2e; pnpm --filter @realestate/template-nest test:infra
pnpm --filter @realestate/identity test; pnpm --filter @realestate/identity test:e2e   # sau khi chép storage.service.ts
pnpm --filter @realestate/listing migration:run
pnpm --filter @realestate/listing test; pnpm --filter @realestate/listing test:e2e; pnpm --filter @realestate/listing test:infra
pnpm lint; pnpm format:check; pnpm build; pnpm contracts:check
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build
# qua gateway 8080: đăng ký LANDLORD + ADMIN seed → POST /api/v1/listings → approve → GET /api/v1/listings/:id
```

Đếm truy vấn: bật `logging: ['query']` tạm trong test infra, ghi số vào mục dưới, tắt lại.

### Bước 10 — Walkthrough, review, commit

Walkthrough `guides/RE_Listing_Code_Walkthrough.md` (khuôn `_template_Code_Walkthrough.md`) + dòng ở `project-knowledge/CLAUDE.md §2.5` → `code-review` 5 chiều → commit tách ý (A push):

- `feat(template): StorageService.headObject; chép sang identity (T2.2)` + `docs(design): RE.SERVICE_TEMPLATE v2.1 (T2.2)`
- `docs(design): RE.LISTING v1.2 (T2.2)`
- `feat(listing): khung service, migration, CRUD, duyệt, ảnh (T2.2)`
- `chore(infra): listing vào compose profile apps (T2.2)`
- `docs: walkthrough listing (T2.2)`

### Ước lượng và rủi ro

~14 giờ (đúng ước PHASE-2) + ~1 giờ cho `headObject`. Không đụng `contracts/`, `definitions.json`. Rủi ro: (1) Silo/S3 chưa chạy trên máy → test 12 cần `pnpm infra:up`; (2) `search_path` test phải có `public` để thấy PostGIS, nếu không `geography` không tồn tại trong schema test; (3) node_modules bản Windows như ghi ở task C19 — chạy test ở máy A, không phải VM.

## Kết quả kiểm chứng (2026-11-20)

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @realestate/listing test` / `test:e2e` / `test:infra` | 233 / 97 / 52 PASS |
| `@realestate/template-nest` `test` / `test:e2e` / `test:infra` | 101 / 111 / 14 PASS |
| `@realestate/identity` `test` / `test:e2e`; `@realestate/api-gateway` `test` | 201 / 97; 239 PASS |
| `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` | sạch, 4 spec OK |
| Smoke qua gateway 8080 (compose `re-listing`) | tạo 201, ẩn danh 404, LANDLORD duyệt 403, ADMIN duyệt 200, chi tiết 200, PUT ảnh lên S3 bằng presigned URL 200, xác nhận 201, tin về `PENDING_REVIEW` (404 công khai), `/internal/*` 404, xóa 204; dữ liệu smoke đã dọn |

Số truy vấn đo bằng log TypeORM (ngưỡng ghi 6, danh sách 4, chi tiết 3): create 2, update 3 (2 khi không đổi), hide/unhide/approve/reject 2, delete 1–2, detail 2, mine 3, upload-url 1, confirm ảnh 5, xác nhận lại cùng key 1.

## Code-review 5 chiều (2026-11-20, trước commit)

- **Security:** chủ tin chỉ từ `sub`; `@Roles` + gateway; cột trong `UPDATE` động lấy từ bảng cố định, giá trị qua tham số; key ảnh do service sinh và kiểm lại dạng/tiền tố; log không có token/key bí mật; `5xx` không lộ chi tiết; `.env`, `openapi.json` ignore.
- **Performance:** mọi endpoint trong ngưỡng; ảnh một truy vấn cho cả trang; index GiST, owner, ảnh có sẵn; không truy vấn trong vòng lặp; `HeadObject` ngoài transaction.
- **Correctness:** khớp `RE.LISTING` v1.2. Lỗi tìm ra khi test: (1) TypeORM trả `[dòng, số]` cho `UPDATE ... RETURNING` → `rowsOf`; (2) đếm ảnh trong cùng câu `FOR UPDATE` dùng snapshot cũ → vượt 10 ảnh, sửa bằng khóa trước rồi đếm sau (test 16 với 5 request, chạy 3 lần ổn định).
- **Style:** Prettier, ESLint sạch; tên theo `coding-convention §3`.
- **Reuse:** khớp Reuse Report; `headObject` sửa ở template trước rồi chép sang identity (diff rỗng).
- **Ranh giới service:** không import chéo, không gọi service khác.
- **Thành thật về quy trình TDD:** `headObject`, `listing-edit.rules`, `listing-image.rules`, `listing.env`, `LISTING_IMAGE_*`, `rowsOf` có RED trước. DTO, `listing.sql`, presenter và 4 service được viết trước spec (DTO và service do lỗi công cụ heredoc làm gián đoạn), spec/infra test viết ngay sau và đã bắt được 2 lỗi thật.

## Blockers / Ghi chú

- 2026-11-20: thêm `listing` vào ma trận `test` của `.github/workflows/ci.yml` (sót khi scaffold; nếu không PR xanh mà không chạy test listing). Commit tách 6 phần, A push và mở PR. `RE.LISTING` API_Spec §8 (description ≤ 5000, `address`/`district`/`city` bắt buộc) vẫn chờ A chốt trước merge.
- Kế hoạch đã duyệt 2026-11-19. C19 đã merge (`b0e66f1`).
- Chưa commit: chờ A cho phép (`git commit` cần hỏi). Gợi ý tách commit ở Bước 10 của kế hoạch.
- Docker Desktop đã tắt giữa chừng; phiên này đã bật lại để chạy `test:infra`.
- Chờ A xác nhận `API_Spec §8`: `description` ≤ 5000 và `address`/`district`/`city` bắt buộc khi tạo.
- Task trước (C19) đã `done` và được ghi đè ở file này; nội dung còn trong git history nhánh C19 nếu `.claude/state` được commit.
