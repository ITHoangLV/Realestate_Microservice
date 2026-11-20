---
task: T2.3 listing: tìm kiếm PostGIS, API nội bộ giữ chỗ
created: 2026-11-20
status: done
phase: implementation/PHASE-2.md#T2.3
branch: feature/T2.3-listing-search-holds (tách từ `origin/develop` `7b4d16e` ngày 2026-11-20, đã có PR #19, #20; thay đổi T2.3 làm trên `docs/T2.2-progress` được mang sang nguyên vẹn)
---

## Mô tả

Hoàn thiện `services/listing`: route 11 `GET /api/v1/listings` (tìm kiếm, lọc, bán kính `ST_DWithin`, phân trang, chỉ tin `APPROVED`) và API nội bộ `/internal/listings/*` cho rental (đọc bản chụp, giữ chỗ nguyên tử, đổi trạng thái theo đơn). Người làm: A (tự giao lại từ B, `PHASE-2.md`; `progress.md` còn ghi B, sửa lúc tick sau merge). Hạn M1 — 2026-11-27, ước ~10 giờ.

## Thiết kế liên quan

`design/LISTING/RE.LISTING/` v1.4 (`API_Spec §1.3, §2, §6`; `Component_Class_Design §1–§3` test 4–11; `Processing_Flow §3, §5`), `contracts/openapi/listing-internal.v1.yaml` v2.0.0 (**không đổi**, `pnpm contracts:check` vẫn chạy), ADR-0010. Gateway đã có `GET /api/v1/listings` (public) và chặn `/internal/*` → không đổi gateway.

## Definition of Done

- [x] Test 4–11 ở `RE.LISTING/Component_Class_Design.md §3` pass (Báo cáo T05, T06), test 7 = 50 lời giữ chỗ đồng thời với Postgres thật, đúng một `200`
- [x] Ví dụ trong `listing-internal.v1.yaml` khớp response thật (`expectResponseMatchesOpenApi` cho cả 3 route nội bộ, mọi mã trả về)
- [x] `EXPLAIN` bán kính dùng `ix_listings_location` (plan dán ở "Kết quả kiểm chứng")
- [x] `pnpm --filter @realestate/listing test`, `test:e2e`, `test:infra` PASS: unit 356, e2e 97, infra 109 (2026-11-20)
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi
- [x] Số truy vấn mỗi endpoint trong ngưỡng `non-functional-standards.md §1`, đếm bằng log SQL (dán số)
- [x] `RE.LISTING` v1.4 + `CHANGELOG.md` (sửa tài liệu **trước** code), `van-de-can-quyet-dinh.md` mục D thêm một dòng
- [x] Cập nhật `guides/RE_Listing_Code_Walkthrough.md` + dòng ở `project-knowledge/CLAUDE.md §2.5`; README `services/listing` thêm route 11 và API nội bộ
- [x] Smoke qua compose profile `apps`: tìm kiếm qua gateway 8080; `/internal/*` từ ngoài vẫn 404

## Các bước thực hiện (tổng quan)

- [x] 1. Đọc context, đối chiếu thiết kế (2026-11-20)
- [x] 2. Quét tái sử dụng + kế hoạch chi tiết — A duyệt 2026-11-20 (xem "Đã chốt 2026-11-20" ở Kế hoạch)
- [x] 3. Sửa tài liệu `RE.LISTING` v1.4 trước code (2026-11-20; kèm `RE.DEPOSIT_SAGA` v1.2, `van-de-can-quyet-dinh.md` C20 + mục D, `PHASE-2.md` DoD T2.4, `project-structure.md`)
- [x] 4. Migration 3 index tìm kiếm (`1733100000000-add-listing-search-indexes.ts`; đã `migration:run` trên `listing_db` dev)
- [x] 5. Tìm kiếm: `search-listings.query` (47 test), `listing-search.sql` (21 test, RED trước), `presentSummaries`, `ListingQueryService.search`, route 11 — unit PASS
- [x] 6. Nội bộ: `listing-hold.rules` (30 test, RED trước), `ListingHoldService` (17 test), `snapshot`, `listings.internal.controller.ts`, module — unit PASS
- [x] 7. Test hạ tầng (`listing-search.infra-spec.ts`, `listing-internal.infra-spec.ts`, `helpers/listing-fixtures.ts`): 57 ca PASS lần đầu; thử đột biến (bỏ `held_until < now()`) → 4 ca fail, test 7 nhận 50 lần `200`, đã khôi phục
- [x] 8. Chạy toàn bộ test + lệnh kiểm chứng + smoke compose
- [x] 9. Cập nhật walkthrough, README, `code-review` 5 chiều (chưa commit, chờ A cho phép)

## Tái sử dụng (Reuse Report)

> Quét 2026-11-20 · Nguồn: `services/listing/src`, `services/_template-nest/src`, `services/identity/src`, `services/api-gateway/src/gateway/routes.ts`, `contracts/openapi/listing-internal.v1.yaml` · Cách tra: đọc file + Grep `ST_DWithin|ST_Distance|Transform\(|enable_seqscan|expectResponseMatchesOpenApi|ApiExcludeController`
> Từ khóa: search, ST_DWithin, hold, transition, internal controller, csv query, presign · Vùng mù: không có (T2.2 đã merge, mọi file listing đã có trong cây)

| Thành phần cần | Nhóm | Vị trí đã có / lý do |
|---|---|---|
| Phân trang, `Paginated` | DÙNG LẠI | `common/response/page-query.dto.ts#PageQueryDto` (kế thừa cho query tìm kiếm), `response-meta.ts#Paginated` |
| Kiểm UUID đường dẫn | DÙNG LẠI | `createUuidParamPipe('id')` |
| Lỗi chuẩn | DÙNG LẠI | `listing.errors.ts`: `listingNotFound`, `listingNotAvailable` (đã khai sẵn cho T2.3), `listingInvalidStatus`. Chỉ **mở rộng** `listingInvalidStatus` nhận `details {current, target}` (hợp đồng có ví dụ `details`) |
| `ListingStatus`, `AMENITIES`, `PROPERTY_TYPES` | DÙNG LẠI | `entities/listing.enums.ts` |
| Cột `SELECT`, `pointSql`, `rowsOf` | DÙNG LẠI | `services/listing.sql.ts` (`UPDATE ... RETURNING` phải bọc `rowsOf`) |
| Presign URL ảnh bìa | DÙNG LẠI | `ListingPresenter.imageDto` (ký cục bộ, không gọi mạng) |
| Mẫu controller nội bộ | DÙNG LẠI (mẫu) | `identity/.../users.internal.controller.ts`: `@ApiExcludeController()`, `@Public()`, `@Controller('internal/...')` |
| Test khớp hợp đồng, helper test | DÙNG LẠI | `test/helpers/contracts.ts#expectResponseMatchesOpenApi`, `createTestApp`, `infra.ts` |
| Danh sách tiện ích trong query (`amenities=WIFI,PARKING`) | VIẾT MỚI (trong `listing/dto`) | Đã quét `Transform(` ở template, identity, listing: không có transform CSV → mảng. Một hàm 3 dòng, riêng DTO tìm kiếm, không đưa vào `common` |
| Bộ dựng SQL tìm kiếm (`buildSearchSql`: where, order, tham số) | VIẾT MỚI (`listing/services/listing-search.sql.ts`, hàm thuần) | Đã quét `ST_DWithin|ST_Distance`: chưa có ở đâu. Luật nghiệp vụ listing |
| Bảng chuyển trạng thái theo đơn (`STATUS_TRANSITIONS`) | VIẾT MỚI (`listing/services/listing-hold.rules.ts`, hằng + hàm thuần) | `API_Spec §2.2`; chưa có |
| `ListingHoldService`, `ListingSummaryDto`, DTO nội bộ (hold, status, snapshot) | VIẾT MỚI (`listing/`) | Nghiệp vụ listing, thiết kế đã liệt kê |

Không tạo thành phần dùng chung mới ngoài `listing/`; không sửa `_template-nest`, `common/`.

## Kế hoạch chi tiết

### Đã chốt 2026-11-20 (A duyệt kế hoạch) — đã ghi vào `RE.LISTING` v1.4

Q1, Q2, Q4, Q5 đồng ý đúng đề xuất. **Chỉnh so với đề xuất:**

- **Q3:** bắt buộc migration (không ghi tech-debt), **ba** index: GIN `amenities`; `(created_at DESC, id DESC) WHERE deleted_at IS NULL` (bỏ điều kiện `approval_status` so với đề xuất ban đầu); btree `area_m2`. Tên: `ix_listings_amenities`, `ix_listings_created`, `ix_listings_area`. Ghi ở `API_Spec §6`.
- **Q4:** thêm `[cần xác nhận]` ở `RE.DEPOSIT_SAGA` (v1.2, `API_Spec §8`) và `van-de-can-quyet-dinh.md` C20: `409 LISTING_INVALID_STATUS` khi đích `AVAILABLE` là kết cục cuối, rental không retry; xử lý ở T3.x, **không sửa rental bây giờ**. Test 11 dựng trên tin `HELD`/`DEPOSITED` của đơn khác.
- **Q5:** thêm vào DoD T2.4 (`PHASE-2.md`): chạy lại `EXPLAIN` bán kính 2 km trên seed thật.

### Câu hỏi đã trình A (giữ để đối chiếu; thiết kế chưa ghi; mặc định nếu A không nói gì)

| # | Điểm | Đề xuất |
|---|---|---|
| Q1 | **Hình dạng response route 11.** `Processing_Flow §5` ghi "2 truy vấn: count + data có ảnh bìa qua join", nhưng `API_Spec §1.4` chưa có `ListingSummaryDto` | `ListingSummaryDto`: `id, ownerId, title, propertyType, priceVnd, depositAmountVnd, areaM2, address, district, city, amenities, lat, lng, status, coverImageUrl (presigned GET hoặc null), distanceM (chỉ khi có lat/lng, làm tròn mét), createdAt`. **Không** có `description`, `images[]`, `approvalStatus`, `rejectReason`. Ảnh bìa = ảnh `sort_order` nhỏ nhất, rồi `created_at`, `id` |
| Q2 | **Ngữ nghĩa query route 11** (`§1.3` chỉ liệt kê tên) | `lat`+`lng` phải đi cùng nhau; `radiusKm` chỉ có khi có `lat/lng`, `0 < radiusKm ≤ 50`; có `lat/lng` không `radiusKm` → không lọc bán kính, chỉ tính `distanceM` và cho `sort=distance`; `sort=distance` thiếu `lat/lng` → `400 VALIDATION_FAILED`; `minPrice > maxPrice` (hoặc diện tích) → `400`; `district` so khớp **đúng chuỗi** sau trim (dùng được `ix_listings_search`); `amenities` dạng CSV `WIFI,PARKING`, mọi mã phải có (`@>`), mã lạ → `400`; `available=true` chỉ `AVAILABLE`, không có thì trả cả `HELD/DEPOSITED/RENTED` (chỉ loại `HIDDEN`). Thứ tự: `newest` = `created_at DESC, id DESC`; `price_asc/price_desc` = giá rồi `created_at DESC, id DESC`; `distance` = khoảng cách rồi `id` |
| Q3 | **Index cho lọc/sắp xếp** (`non-functional-standards §1`: MUST có index cho cột lọc, sắp xếp). DDL §6 không có index cho `created_at` (sắp `newest` mặc định) và `amenities` | Migration mới thêm `ix_listings_created (created_at DESC, id DESC) WHERE approval_status='APPROVED' AND deleted_at IS NULL` và GIN `ix_listings_amenities (amenities)`. Diện tích không index (độ chọn lọc thấp, lọc phụ sau index khác). Sửa DDL §6 trong v1.4. Nếu A không muốn: ghi tech-debt, không migration |
| Q4 | **Idempotent khi đích là `AVAILABLE`** (`§2.2`): về `AVAILABLE` thì xóa `held_by_deposit_id`, nên lần gọi lại không còn kiểm được "cùng `depositId`" | Tin đã `AVAILABLE` + đích `AVAILABLE` → `200` với mọi `depositId` (đúng test 10, rental retry bù trừ). Tin `HELD`/`DEPOSITED` bởi đơn **khác** → `409 LISTING_INVALID_STATUS` kèm `details {current, target}` (test 11). Đích `DEPOSITED`/`RENTED`: đã ở đích **và** `held_by_deposit_id = depositId` → `200`. Tin không có/đã xóa → `404`. Ghi vào `§2.2` |
| Q5 | **Test 4 "trên seed"**: seed là T2.4 (phụ thuộc T2.3), chưa có khi làm T2.3. Và với ~30 dòng planner chọn seq scan, `EXPLAIN` không chứng minh được GiST | T2.3 dùng fixture trong test: vài tin tọa độ thật ở Hà Nội với khoảng cách biết trước (kiểm đúng tập trong 2 km) + ~5.000 tin sinh ngẫu nhiên trong schema test, `ANALYZE`, rồi `EXPLAIN` phải thấy `ix_listings_location`. Không dùng `enable_seqscan=off` (sẽ che sự thật). T2.4 chạy lại `EXPLAIN` trên seed thật |

Mặc định không cần hỏi (đúng thiết kế, ghi để duyệt luôn): `heldUntil` chỉ kiểm là ISO date-time, **không** thêm luật "phải ở tương lai" (NEVER thêm luật thiết kế không có); giữ chỗ và đổi trạng thái đều `version = version + 1`, `updated_at = now()`; `snapshot` (route a) không lọc `approval_status`/`HIDDEN` (hợp đồng: "kể cả ẩn hoặc chưa duyệt"), chỉ loại tin đã xóa; `/internal/*` là `@Public()` + `@ApiExcludeController()`.

### Bước 3 — Sửa tài liệu trước code (`RE.LISTING` v1.4, MINOR)

`API_Spec.md`: §1.3 (ngữ nghĩa query, Q2), §1.4 thêm `ListingSummaryDto` và route 11 (Q1), §2.2 dòng idempotent (Q4), §6 index (Q3), §7 mục "2026-11-2x (A duyệt kế hoạch T2.3)"; `Component_Class_Design.md` §1 cây (thêm `listing-search.sql.ts`, `listing-hold.rules.ts`), §3 test 4 ghi fixture (Q5); `Processing_Flow.md §5` nếu số truy vấn đổi (không dự kiến đổi); `CHANGELOG.md` `[v1.4]`; header 3 file → v1.4; `van-de-can-quyet-dinh.md` mục D một dòng.

### Bước 4 — Migration index (A chốt Q3: bắt buộc)

`src/database/migrations/<ts>-add-listing-search-indexes.ts`: ba `CREATE INDEX` đúng `API_Spec §6` v1.4 (`ix_listings_amenities` GIN, `ix_listings_created`, `ix_listings_area`), `down` xóa. Không sửa migration T2.2 đã merge.

### Bước 5–6 — Code (file mới / sửa)

```text
services/listing/src/listing/
├─ controllers/
│  ├─ listings.controller.ts            # SỬA: thêm GET '' (route 11, @Public) khai báo trước 'mine' và ':id'
│  └─ listings.internal.controller.ts   # MỚI: GET :id, POST :id/holds, PUT :id/status (@Public, @ApiExcludeController)
├─ dto/
│  ├─ search-listings.query.ts (+ .spec.ts)   # MỚI: kế thừa PageQueryDto, bộ lọc, CSV amenities, kiểm chéo (Q2)
│  ├─ listing-summary.dto.ts                  # MỚI: ListingSummaryDto (Q1)
│  └─ hold-listing.dto.ts, change-status.dto.ts, internal-listing.dto.ts  # MỚI: body/response nội bộ khớp hợp đồng
├─ services/
│  ├─ listing-search.sql.ts (+ .spec.ts)      # MỚI, hàm thuần: buildSearchSql(query) -> { countSql, dataSql, params }
│  ├─ listing-hold.rules.ts (+ .spec.ts)      # MỚI, hàm thuần: STATUS_TRANSITIONS, resolveTransition
│  ├─ listing-hold.service.ts                 # MỚI: hold, changeStatus (UPDATE có điều kiện, 0 dòng thì đọc lại)
│  └─ listing-query.service.ts                # SỬA: thêm search (route 11) và snapshot (route a)
├─ errors/listing.errors.ts                   # SỬA: listingInvalidStatus(details?)
└─ listing.module.ts                          # SỬA: đăng ký ListingHoldService, ListingsInternalController
services/listing/src/database/migrations/<ts>-add-listing-search-indexes.ts   # MỚI (Q3)
```

Cách làm từng route:

| Route | Cách làm | Số truy vấn (ngưỡng) |
|---|---|---|
| 11 `GET /listings` | `count(*)` và `data` dùng chung mệnh đề `WHERE approval_status='APPROVED' AND deleted_at IS NULL AND status <> 'HIDDEN'` + bộ lọc. Có bán kính: `ST_DWithin(l.location, <điểm>::geography, radiusKm*1000)`. `distanceM` = `ST_Distance(l.location, <điểm>)`. Ảnh bìa bằng `LEFT JOIN LATERAL (SELECT object_key FROM listing_images WHERE listing_id = l.id ORDER BY sort_order, created_at, id LIMIT 1)`. Mọi giá trị qua tham số, tên cột/hướng sắp xếp lấy từ bảng cố định. Presign ảnh bìa cục bộ | **2** (≤ 4) |
| a `GET /internal/listings/:id` | `SELECT id, owner_id, title, deposit_amount_vnd, status, approval_status WHERE id AND deleted_at IS NULL`; không có → `404` | **1** (≤ 3) |
| b `POST /internal/listings/:id/holds` | Đúng câu `UPDATE ... RETURNING` ở `API_Spec §2.1` (+ `version+1`, `updated_at`). 0 dòng → đọc lại `status, held_by_deposit_id, held_until`: không có → `404`; `HELD` và cùng `depositId` → `200` (không đổi); còn lại → `409 LISTING_NOT_AVAILABLE` | **1**, +1 khi 0 dòng (≤ 6) |
| c `PUT /internal/listings/:id/status` | Bảng `STATUS_TRANSITIONS` (`§2.2`); mỗi chuyển là một `UPDATE ... WHERE id AND deleted_at IS NULL AND status = <từ> AND held_by_deposit_id = $depositId`; về `AVAILABLE` xóa `held_until`, `held_by_deposit_id`. 0 dòng → đọc lại, áp Q4: `404` / `200` (đã ở đích) / `409` + `details` | **1**, +1 khi 0 dòng (≤ 6) |

Không vòng lặp truy vấn, không gọi HTTP, không transaction dài (mỗi thao tác ghi là một câu lệnh nguyên tử), không `clients/` (listing không gọi service khác), không `contracts/` đổi.

### Playbook TDD (`warn`)

RED → GREEN → REFACTOR cho: `search-listings.query` (kiểm chéo lat/lng/radius/sort), `buildSearchSql`, `listing-hold.rules`. Truy vấn thật, đồng thời, `EXPLAIN`, khớp hợp đồng → `*.infra-spec.ts` với Postgres thật (`tdd-guide.md §5` mục 4). Controller, module, DTO response không đòi spec riêng.

### Test sẽ viết

| Test thiết kế | Ca | Tầng |
|---|---|---|
| 4 (T05) | Fixture tọa độ thật Hà Nội: bán kính 2 km trả đúng tập, đúng thứ tự `distance`, `distanceM` đúng; ~5.000 tin ngẫu nhiên + `ANALYZE` → `EXPLAIN` có `ix_listings_location`; chỉ `APPROVED`, không xóa, không `HIDDEN`; mỗi bộ lọc (giá, diện tích, quận, tiện ích, `available`); sắp xếp; phân trang (`pageSize` 50 tối đa, `meta`); `PENDING_REVIEW`/`REJECTED` không xuất hiện (nốt phần "tìm kiếm" của test 3 hoãn từ T2.2) | `test:infra` (`listing-search.infra-spec.ts`) + `*.spec.ts` cho `buildSearchSql` và query DTO |
| 5 | Giữ chỗ tin `AVAILABLE` → `HELD`, `held_until` đúng | `test:infra` (`listing-hold.infra-spec.ts`) |
| 6 (T06) | Giữ chỗ tin `HELD` còn hạn, `HIDDEN`, `DEPOSITED`, chưa duyệt → `409 LISTING_NOT_AVAILABLE` | `test:infra` |
| 7 | 50 lời giữ chỗ đồng thời (đơn khác nhau) → đúng một `200`, 49 `409`, `held_by_deposit_id` thuộc đơn thắng | `test:infra` |
| 8 | Giữ lại cùng `depositId` → `200`, không đổi `held_until` và `version` | `test:infra` |
| 9 | Giữ chỗ tin `HELD` quá `held_until` → `200` cho đơn mới | `test:infra` |
| 10 | Mỗi chuyển ở `§2.2`, gọi hai lần → lần hai `200`, không đổi (kể cả đích `AVAILABLE`, Q4) | `test:infra` + `listing-hold.rules.spec.ts` |
| 11 | Chuyển với `depositId` khác, hoặc cặp không có trong bảng → `409 LISTING_INVALID_STATUS` kèm `details` | `test:infra` + `*.spec.ts` |
| DoD | Mọi response 200/404/409/400 của 3 route nội bộ khớp `listing-internal.v1.yaml` (`expectResponseMatchesOpenApi`); `id` không phải UUID → `400` | `test:infra` |
| thêm | `swagger.e2e-spec.ts`: route 11 có trong `openapi.json`, `/internal/*` không lộ | `test:e2e` |
| thêm | Số truy vấn mỗi route đo bằng log TypeORM (search 2, snapshot 1, hold 1–2, status 1–2) | `test:infra` |

### Kiểm chứng cuối

```powershell
git switch develop; git pull origin develop; git switch -c feature/T2.3-listing-search-holds
pnpm infra:up
pnpm --filter @realestate/listing migration:run
pnpm --filter @realestate/listing test; pnpm --filter @realestate/listing test:e2e; pnpm --filter @realestate/listing test:infra
pnpm lint; pnpm format:check; pnpm build; pnpm contracts:check
# EXPLAIN (lệnh "Kiểm chứng" của PHASE-2): ST_DWithin(location, ST_MakePoint(105.84, 21.00)::geography, 2000) -> ix_listings_location
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build
# qua gateway 8080: GET /api/v1/listings?lat=21.00&lng=105.84&radiusKm=2 ; /internal/listings/:id từ ngoài -> 404
```

### Commit dự kiến (A push)

- `docs(design): RE.LISTING v1.4, tìm kiếm và đổi trạng thái (T2.3)`
- `feat(listing): tìm kiếm PostGIS, index tìm kiếm (T2.3)`
- `feat(listing): API nội bộ bản chụp, giữ chỗ, đổi trạng thái (T2.3)`
- `docs: cập nhật walkthrough listing (T2.3)`

### Ước lượng và rủi ro

~10 giờ (đúng ước PHASE-2). Rủi ro: (1) test 7 cần pool kết nối đủ (50 lời gọi, pool mặc định 10 → xếp hàng, vẫn đúng một `200`; không phụ thuộc thứ tự); (2) `EXPLAIN` phụ thuộc thống kê → phải `ANALYZE` sau khi nạp dữ liệu; (3) hợp đồng `listing-internal.v1.yaml` không đổi, nếu khi code lộ chỗ lệch thì dừng và dùng `contract-change` trước; (4) Docker Desktop phải bật cho `test:infra`.

## Kết quả kiểm chứng (2026-11-20)

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @realestate/listing migration:run` | `AddListingSearchIndexes1733100000000` chạy được; 8 index trên `listings` |
| `test` / `test:e2e` / `test:infra` (listing) | 356 / 97 / 109 PASS (T2.2: 233 / 97 / 52) |
| `pnpm lint`, `format:check`, `build`, `contracts:check` | sạch, 4 spec OK |
| `openapi:export` | `GET /api/v1/listings` có 13 tham số, `ListingSummaryDto` có; không có path `/internal` |
| Smoke qua gateway 8080 (compose `re-listing` bản cuối) | tìm kiếm ẩn danh, bán kính 2 km (`distanceM` 707), lọc quận + tiện ích, `radiusKm` thiếu `lat/lng` → 400, `lat=&lng=` → 400, `/internal/*` từ ngoài → 404; nội bộ (từ trong container): bản chụp, giữ chỗ 200, đơn khác 409, HELD→DEPOSITED, nhả sai đơn 409 + `details`, DEPOSITED→AVAILABLE, gọi lại 200. 16/16 OK; dữ liệu smoke và tài khoản tạm đã dọn (`listing_db` 0 dòng, 0 user smoke) |

`EXPLAIN` trên `listing_db` thật (5.000 tin ngẫu nhiên trong transaction đã `ROLLBACK`, `ANALYZE`):

```
Bitmap Heap Scan on listings  (cost=5.05..1431.96 rows=1 width=16)
  Filter: st_dwithin(location, '0101000020E6100000F6285C8FC2755A400000000000003540'::geography, '2000'::double precision, true)
  ->  Bitmap Index Scan on ix_listings_location  (cost=0.00..5.05 rows=104 width=0)
        Index Cond: (location && _st_expand('0101...'::geography, '2000'::double precision))
```

Lọc tiện ích (`amenities @> '{WIFI}'`) dùng `Bitmap Index Scan on ix_listings_amenities`.

Số truy vấn (đo bằng log TypeORM trong test, ngưỡng chi tiết 3 · danh sách 4 · ghi 6): tìm kiếm 2 (1 khi không có kết quả), bản chụp 1, giữ chỗ 1 (2 khi gọi lại hoặc 409), đổi trạng thái 1 (2 khi idempotent hoặc 409).

## Code-review 5 chiều (2026-11-20, trước commit)

- **Security:** mọi giá trị đi qua tham số `$n` (test chứng minh `DROP TABLE` chỉ nằm ở tham số); cột và hướng sắp xếp lấy từ bảng cố định, mảnh `clearHold` chọn từ hằng; `/internal/*` `@Public()` + `@ApiExcludeController()` đúng thiết kế (`security-policy §6`), gateway trả 404 từ ngoài (đã kiểm); route 11 công khai chỉ trả trường công khai (không `description`, trạng thái duyệt, lý do từ chối); log không có token, key bí mật.
- **Performance:** search 2 truy vấn, không N+1 (ảnh bìa `LATERAL`), phân trang tối đa 50, `total = 0` bỏ truy vấn data; index cho mọi cột lọc/sắp xếp (GiST, GIN, `created`, `area`, `price`, `search`), `EXPLAIN` xác nhận. Sửa trong review: `amenities` lặp mã không giới hạn → thêm `@ArrayMaxSize(11)`.
- **Correctness:** khớp `RE.LISTING` v1.4 (BR-05, BR-06, A9); giữ chỗ nguyên tử, 50 đồng thời đúng một `200`; không có transaction bao HTTP. **Lỗi tìm ra khi review:** `?lat=&lng=` (chuỗi rỗng từ form) bị `Number('')` = 0 nên âm thầm tìm tại (0,0), `?minPrice=` thành lọc `>= 0` → thêm `emptyToUndefined` (RED 10 ca rồi GREEN; smoke qua gateway: `lat=&lng=` → 400, `lat=&lng=105.8` → 400, `minPrice=&…` → 200).
- **Style:** Prettier, ESLint, `tsc` sạch; tên file theo `coding-convention §3`; sửa trong review: `TARGET_STATUSES`, `TargetStatus` chuyển về `entities/listing.enums.ts` để DTO không import ngược từ `services/`.
- **Reuse:** khớp Reuse Report (dùng lại `PageQueryDto`, `createUuidParamPipe`, `pointSql`, `rowsOf`, `listingColumns`, `expectResponseMatchesOpenApi`); không thêm thành phần dùng chung ngoài `listing/`; `ListingPresenter` chỉ thêm `presentSummaries` và tách `imageUrl` private. Hai infra-spec mới lặp phần dựng app, schema, đếm truy vấn của `listing-crud.infra-spec.ts` (đã ghi ở walkthrough §6, cùng loại tech-debt #13).
- **Ranh giới service:** không import chéo, không gọi service khác, không `fetch`/`axios`, không đụng `contracts/`.
- **Thành thật về TDD:** RED trước cho `search-listings.query`, `listing-search.sql`, `listing-hold.rules`, `presentSummaries` và 10 ca chuỗi rỗng. `listing-hold.service` và `listing-query.service` viết trước spec (hook `warn` nhắc), spec bổ sung ngay sau PASS ngay lần đầu; infra-spec viết sau code, PASS lần đầu nên đã thử đột biến để chứng minh test bắt được lỗi.

## Blockers / Ghi chú

- Không còn blocker. Docker đã chạy (A bật); 2026-11-20 đã chạy đủ `migration:run`, `test:infra`, `EXPLAIN`, `openapi:export`, smoke.
- Chưa commit, chưa mở PR: chờ A cho phép (`git commit` cần hỏi). Gợi ý tách commit ở mục "Commit dự kiến" của Kế hoạch (có thêm một commit cho tài liệu `RE.DEPOSIT_SAGA` v1.2).
- Chờ C chốt C20 (`409 LISTING_INVALID_STATUS` khi đích `AVAILABLE` là kết cục cuối, rental không retry) ở T3.3; không chặn T2.3.
- `progress.md` còn ghi T2.3 do B, tick và sửa người làm sau merge.
- `[cần xác nhận]` trong thiết kế "Đọc trước": không còn (`RE.LISTING §8` trống). Phụ thuộc T2.2, T0.3 đã tick.
