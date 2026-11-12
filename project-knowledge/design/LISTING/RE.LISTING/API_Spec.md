# RE.LISTING — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.LISTING` — sản phẩm của chủ trọ, duyệt, ảnh, tìm kiếm, giữ chỗ nguyên tử |
| **Service** | `listing` (cổng 3002) |
| **Quy tắc** | BR-03, BR-05, BR-06, BR-14 |
| **Quyết định** | ADR-0010 (gộp sản phẩm vào listing), ADR-0007 (S3) |
| **CSDL** | `listing_db` / `listing_user` (PostGIS, pgcrypto); S3 bucket `listing-images` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

> Báo cáo v2 Bảng 3.8 chỉ liệt kê **thao tác**. Đường dẫn chốt 2026-11-12 (A6); tên trường, giá trị còn đề xuất gắn `[cần xác nhận]` tại chỗ.

## 1. API công khai

| # | Method, đường dẫn | Quyền | Thao tác (Bảng 3.8) |
|---|---|---|---|
| 1 | `POST /api/v1/listings` | landlord | Thêm sản phẩm, `approvalStatus = PENDING_REVIEW`, `status = AVAILABLE` |
| 2 | `PATCH /api/v1/listings/:id` | landlord, chủ sở hữu | Sửa |
| 3 | `POST /api/v1/listings/:id/hide` | landlord, chủ sở hữu | Ẩn: `AVAILABLE → HIDDEN` |
| 4 | `POST /api/v1/listings/:id/unhide` | landlord, chủ sở hữu | Hiện: `HIDDEN → AVAILABLE` |
| 5 | `DELETE /api/v1/listings/:id` | landlord, chủ sở hữu | Xóa mềm (`deleted_at`) |
| 6 | `GET /api/v1/listings/mine` | landlord | Sản phẩm của tôi, kèm trạng thái duyệt và trạng thái BĐS |
| 7 | `POST /api/v1/listings/:id/images/upload-url` | landlord, chủ sở hữu | Presigned PUT; service đặt key |
| 8 | `POST /api/v1/listings/:id/images` | landlord, chủ sở hữu | Xác nhận key đã tải; `HeadObject` kiểm kích thước |
| 9 | `POST /api/v1/admin/listings/:id/approve` | admin | Duyệt |
| 10 | `POST /api/v1/admin/listings/:id/reject` | admin | Từ chối, lý do bắt buộc |
| 11 | `GET /api/v1/listings` | public | Tìm kiếm, lọc, bán kính, phân trang; chỉ tin `APPROVED`, chưa xóa, không `HIDDEN` |
| 12 | `GET /api/v1/listings/:id` | public | Chi tiết; `404` nếu không có, chưa duyệt, đã xóa |

### 1.1 Trường sản phẩm (route 1, 2)

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `title` | string | 5–200 `[cần xác nhận]` |
| `description` | string | |
| `propertyType` | string | `ROOM`, `APARTMENT`, `HOUSE` `[cần xác nhận]` |
| `priceVnd` | int | > 0, giá thuê tháng |
| `depositAmountVnd` | int | > 0, tiền cọc (BR-04) |
| `areaM2` | number | > 0 |
| `district`, `city`, `address` | string | |
| `amenities` | string[] | `[cần xác nhận]` danh mục tiện ích |
| `lat`, `lng` | number | WGS84 |

Sửa giá hoặc tiền cọc không ảnh hưởng đơn đã tạo (rental giữ bản chụp). Sửa có đưa tin về `PENDING_REVIEW` không `[cần xác nhận]`.

### 1.2 Thứ tự kiểm tra (route 2–5, 7–8)

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Không có hoặc đã xóa | `404 LISTING_NOT_FOUND` |
| 2 | `owner_id ≠ sub` | `403 LISTING_NOT_OWNER` (BR-03, Báo cáo T04) |
| 3 | Route 5: `status ∈ {HELD, DEPOSITED}` | `409 LISTING_HAS_ACTIVE_DEPOSIT` (BR-03, Báo cáo T18) |
| 4 | Route 3: `status ≠ AVAILABLE` | `409 LISTING_INVALID_STATUS` |
| 5 | Route 8: ảnh vượt kích thước hoặc không tồn tại | `400 LISTING_IMAGE_INVALID` |

### 1.3 Tìm kiếm (route 11)

Query: `minPrice`, `maxPrice`, `minArea`, `maxArea`, `district`, `amenities` (mọi tiện ích phải có), `available` (chỉ `AVAILABLE`), `lat` + `lng` + `radiusKm`, `page`, `pageSize`, `sort` (`price_asc`, `price_desc`, `newest`, `distance`) `[cần xác nhận]`. Có `lat/lng/radiusKm` thì dùng `ST_DWithin` trên `geography` (index GiST, Báo cáo T05).

## 2. API nội bộ

Hợp đồng: `contracts/openapi/listing-internal.v1.yaml`. Đã có route a; route b, c thêm khi viết lại ở T0.3 (A7).

| # | Method, đường dẫn | Bên gọi | Kết quả |
|---|---|---|---|
| a | `GET /internal/listings/:id` | rental (S1) | Bản chụp: `id, landlordId, landlordName, title, depositAmount, isPublished` (đã có) + đề xuất thêm `status`, `approvalStatus`. `404 LISTING_NOT_FOUND` |
| b | `POST /internal/listings/:id/holds` | rental (S1) | Giữ chỗ. Body `{ depositId, heldUntil }`. `200 { status: 'HELD', heldUntil }`; `409 LISTING_NOT_AVAILABLE` |
| c | `PUT /internal/listings/:id/status` | rental (S1) | Đổi trạng thái theo đơn. Body `{ depositId, status }`, `status ∈ {AVAILABLE, DEPOSITED, RENTED}` |

### 2.1 Giữ chỗ (b) — BR-05, BR-06

Một câu lệnh:

```sql
UPDATE listings
SET status = 'HELD', held_until = $heldUntil, held_by_deposit_id = $depositId, version = version + 1
WHERE id = $id AND deleted_at IS NULL AND approval_status = 'APPROVED'
  AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < now()))
RETURNING status, held_until;
```

| Kết quả | Response |
|---|---|
| 1 dòng | `200` |
| 0 dòng, nhưng `held_by_deposit_id = depositId` và `status = HELD` | `200` (gọi lại cùng đơn) |
| 0 dòng | `409 LISTING_NOT_AVAILABLE` |

Điều kiện `HELD AND held_until < now()` để chỗ giữ của một đơn không tạo được (listing đã `HELD` nhưng rental không nhận được trả lời) tự hết hiệu lực — đây là cách hiện thực câu "`held_until` vẫn bảo đảm chỗ được nhả khi hết hạn" ở Báo cáo §4.7.2 (A9).

### 2.2 Đổi trạng thái (c)

Idempotent: đã ở trạng thái đích với cùng `depositId` → `200`.

| Từ | Sang | Khi | Điều kiện |
|---|---|---|---|
| `HELD` | `AVAILABLE` | Hết hạn, bù trừ | `held_by_deposit_id = depositId` |
| `HELD` | `DEPOSITED` | Đơn `PAID` | như trên |
| `DEPOSITED` | `RENTED` | Đơn `RELEASED` | như trên |
| `DEPOSITED` | `AVAILABLE` | Đơn `REFUNDED` | như trên |

Sai cặp → `409 LISTING_INVALID_STATUS`. Về `AVAILABLE` thì xóa `held_until`, `held_by_deposit_id`.

## 3. Sự kiện

Không phát, không nghe (Báo cáo v2 §4.2).

## 4. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn |
|---|---|---|---|---|
| `LISTING_NOT_FOUND` | 404 | Không tìm thấy tin đăng | | Báo cáo, hợp đồng |
| `LISTING_NOT_AVAILABLE` | 409 | Bất động sản đang được người khác giữ chỗ | BR-05, BR-06, BR-14 | Báo cáo |
| `LISTING_NOT_OWNER` | 403 | Bạn không phải chủ tin đăng này | BR-03 | Đề xuất |
| `LISTING_HAS_ACTIVE_DEPOSIT` | 409 | Tin đang có đơn đặt cọc, không thể xóa | BR-03 | Đề xuất |
| `LISTING_INVALID_STATUS` | 409 | Không thể chuyển trạng thái tin | | Đề xuất |
| `LISTING_ALREADY_REVIEWED` | 409 | Tin đã được duyệt hoặc từ chối | | Đề xuất |
| `LISTING_IMAGE_INVALID` | 400 | Ảnh không hợp lệ hoặc vượt kích thước | | Đề xuất |

## 5. Biến môi trường

| Biến | Mặc định dev | Ý nghĩa |
|---|---|---|
| `PORT` | `3002` | |
| `DATABASE_URL` | `postgres://listing_user:…@localhost:5433/listing_db` | |
| `S3_*`, `S3_BUCKETS` | `listing-images` | |
| `LISTING_IMAGE_MAX_BYTES` | `[cần xác nhận]` | Đề xuất tên biến |
| `LISTING_IMAGE_TYPES` | `image/jpeg,image/png,image/webp` `[cần xác nhận]` | |

## 6. DDL (đề xuất theo Báo cáo Bảng 3.5)

```sql
CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,                              -- tham chiếu identity, không FK
  owner_name varchar(200),                             -- bản chụp cho hợp đồng nội bộ (landlordName) [cần xác nhận] nguồn
  title varchar(200) NOT NULL,
  description text,
  property_type varchar(20),
  price_vnd bigint NOT NULL CHECK (price_vnd > 0),
  deposit_amount_vnd bigint NOT NULL CHECK (deposit_amount_vnd > 0),
  area_m2 numeric(8,2) NOT NULL,
  address varchar(300), district varchar(100), city varchar(100),
  location geography(Point, 4326) NOT NULL,
  amenities text[] NOT NULL DEFAULT '{}',
  status varchar(20) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','HELD','DEPOSITED','RENTED','HIDDEN')),
  approval_status varchar(20) NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (approval_status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  reject_reason varchar(500),
  reviewed_by uuid, reviewed_at timestamptz,
  held_until timestamptz,
  held_by_deposit_id uuid,                             -- A8, không có trong Bảng 3.5
  version int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_listings_location ON listings USING GIST (location);
CREATE INDEX ix_listings_search ON listings (approval_status, status, district) WHERE deleted_at IS NULL;
CREATE INDEX ix_listings_price ON listings (price_vnd);
CREATE INDEX ix_listings_owner ON listings (owner_id, created_at DESC);

CREATE TABLE listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  object_key varchar(300) NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 7. Điểm [cần xác nhận]

1. Tên trường §1–2.
2. Tên giá trị `approval_status`, `property_type`, danh mục tiện ích.
3. Sửa tin có phải duyệt lại không.
4. `landlordName` lấy ở đâu: listing không nghe `identity.registered`; đề xuất rental đọc tên từ JWT hoặc bỏ trường này khỏi hợp đồng.
5. Giới hạn loại và kích thước ảnh.
