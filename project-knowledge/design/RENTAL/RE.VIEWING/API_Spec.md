# RE.VIEWING — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.VIEWING` — đặt lịch xem nhà, phản hồi, xác nhận đã xem |
| **Service** | `rental` (cổng 3003) |
| **Quy tắc** | FR04; BR-19 (chỉ người liên quan xem lịch) |
| **CSDL** | `rental_db` / `rental_user`, bảng `viewings` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

> Báo cáo v2 chỉ nêu ba thao tác (đặt lịch, phản hồi, xác nhận đã xem) và ba sự kiện. Đường dẫn chốt 2026-11-12 (A6); trạng thái, trường dưới đây là **đề xuất** `[cần xác nhận]`. Lịch xem **không** là điều kiện để đặt cọc (theo Báo cáo v2).

## 1. API công khai

| # | Method, đường dẫn | Quyền | Kết quả |
|---|---|---|---|
| 1 | `POST /api/v1/viewings` | tenant | `201`, `REQUESTED`; body `{ listingId, scheduledAt, note? }` |
| 2 | `POST /api/v1/viewings/:id/respond` | landlord, chủ tin | `200`; body `{ decision: 'ACCEPT' \| 'DECLINE', note? }` → `ACCEPTED` / `DECLINED` |
| 3 | `POST /api/v1/viewings/:id/confirm-viewed` | tenant, người đặt | `200`, `ACCEPTED → CONFIRMED` |
| 4 | `GET /api/v1/viewings/mine` | tenant, landlord | Phân trang; người thuê thấy lịch mình đặt, chủ trọ thấy lịch trên tin mình |

### Thứ tự kiểm tra

| Route | # | Điều kiện | Kết quả |
|---|---|---|---|
| 1 | 1 | `scheduledAt` ở quá khứ | `400 VALIDATION_FAILED` |
| 1 | 2 | `ListingClient.getSnapshot`: `404` hoặc chưa duyệt | `404 LISTING_NOT_FOUND` (chuyển nguyên) |
| 1 | 3 | Người thuê là chủ tin | `409 RENTAL_VIEWING_OWN_LISTING` `[cần xác nhận]` có cần |
| 1 | 4 | Listing lỗi | `503`/`504` |
| 2, 3 | 1 | Không có | `404 RENTAL_VIEWING_NOT_FOUND` |
| 2, 3 | 2 | Không phải người liên quan | `403 FORBIDDEN` |
| 2, 3 | 3 | Sai trạng thái | `409 RENTAL_INVALID_TRANSITION` |

## 2. Sự kiện phát

| Sự kiện | Khi nào |
|---|---|
| `rental.viewing-requested` | Route 1 |
| `rental.viewing-responded` | Route 2 |
| `rental.viewing-confirmed` | Route 3 |

Payload: `RE.MESSAGING/API_Spec.md §3`.

## 3. Catalog mã lỗi

| Mã | HTTP | Thông báo | Nguồn |
|---|---|---|---|
| `RENTAL_VIEWING_NOT_FOUND` | 404 | Không tìm thấy lịch xem | Đề xuất |
| `RENTAL_VIEWING_OWN_LISTING` | 409 | Không thể đặt lịch xem tin của chính mình | Đề xuất |
| `RENTAL_INVALID_TRANSITION` | 409 | Không thể chuyển trạng thái | Đề xuất, dùng chung với đơn đặt cọc |

## 4. DDL (đề xuất)

```sql
CREATE TABLE viewings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,                 -- không FK
  tenant_id uuid NOT NULL,
  owner_id uuid NOT NULL,                   -- bản chụp
  listing_title varchar(200) NOT NULL,      -- bản chụp
  scheduled_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','ACCEPTED','DECLINED','CONFIRMED','CANCELLED')),
  note varchar(500),
  responded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_viewings_tenant ON viewings (tenant_id, created_at DESC);
CREATE INDEX ix_viewings_owner ON viewings (owner_id, created_at DESC);
```

## 5. Điểm [cần xác nhận]

1. Tên trạng thái (`nghiep-vu-dat-coc-payos.md` dùng `REQUESTED → CONFIRMED → VERIFIED`).
2. Có cho hủy lịch, `NO_SHOW` không.
3. Có chặn chủ trọ tự đặt lịch xem tin của mình không.
