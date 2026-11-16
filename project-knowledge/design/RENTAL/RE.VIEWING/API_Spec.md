# RE.VIEWING — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.VIEWING` — đăng ký xem nhà, từ chối, hủy, xác nhận đã xem |
| **Service** | `rental` (cổng 3003) |
| **Quy tắc** | FR04; BR-19 (chỉ người liên quan xem lịch) |
| **CSDL** | `rental_db` / `rental_user`, bảng `viewings` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-16 — v1.1 |

> Báo cáo v2 chỉ nêu ba thao tác (đặt lịch, phản hồi, xác nhận đã xem) và ba sự kiện. Đường dẫn chốt 2026-11-12 (A6). Luồng lịch xem chốt lại 2026-11-16 (`implementation/van-de-can-quyet-dinh.md` mục D):
>
> - Mỗi tin là **một** căn/phòng duy nhất. Người thuê bấm **Đặt lịch xem**, không chọn giờ. Chủ trọ thấy danh sách người đăng ký xem trên tin của mình.
> - Ngày giờ xem do hai bên **nhắn tin** thống nhất (`RE.CHAT`); người dùng tự bấm nút Nhắn tin, rental không tạo hội thoại. Hệ thống **không** lưu giờ hẹn.
> - **Không** có bước chủ trọ đồng ý lịch. Chủ trọ chỉ có thể **từ chối**.
> - Người thuê được tự hủy yêu cầu đang mở; mỗi người thuê chỉ có một yêu cầu đang mở trên mỗi tin.
> - Khi một đơn đặt cọc trên tin chuyển `PAID`, rental tự hủy các yêu cầu `REQUESTED` của **người khác** trên tin đó và báo cho họ. Yêu cầu đã `CONFIRMED` giữ nguyên.
>
> Lịch xem **không** là điều kiện để đặt cọc (theo Báo cáo v2, B1). Mọi khoản cọc đi qua hệ thống (BR-14), không có ghi nhận cọc trực tiếp.

## 1. API công khai

| # | Method, đường dẫn | Quyền | Kết quả |
|---|---|---|---|
| 1 | `POST /api/v1/viewings` | tenant | `201`, `REQUESTED`; body `{ listingId, note? }` |
| 2 | `POST /api/v1/viewings/:id/respond` | landlord, chủ tin | `200`; body `{ decision: 'DECLINE', note? }` → `DECLINED` (giữ route `respond`, chốt 2026-11-16) |
| 3 | `POST /api/v1/viewings/:id/confirm-viewed` | tenant, người đặt | `200`, `REQUESTED → CONFIRMED` |
| 4 | `GET /api/v1/viewings/mine` | tenant, landlord | Phân trang. Người thuê thấy yêu cầu mình gửi; chủ trọ thấy danh sách người đăng ký xem trên tin mình. Lọc `?listingId=&status=` (Đề xuất) |
| 5 | `POST /api/v1/viewings/:id/cancel` | tenant, người đặt | `200`, `REQUESTED → CANCELLED` (`cancel_reason = TENANT`) |

### Thứ tự kiểm tra

| Route | # | Điều kiện | Kết quả |
|---|---|---|---|
| 1 | 1 | Body sai | `400 VALIDATION_FAILED` |
| 1 | 2 | `ListingClient.getSnapshot`: `404` hoặc chưa duyệt | `404 LISTING_NOT_FOUND` (chuyển nguyên) |
| 1 | 3 | Người gọi là chủ tin | `403 RENTAL_VIEWING_OWN_LISTING` |
| 1 | 4 | Đã có yêu cầu `REQUESTED` của người này trên tin (unique index) | `409 RENTAL_VIEWING_DUPLICATE` |
| 1 | 5 | Listing lỗi | `503`/`504` |
| 2, 3, 5 | 1 | Không có | `404 RENTAL_VIEWING_NOT_FOUND` |
| 2, 3, 5 | 2 | Không phải người liên quan (route 2: chủ tin; route 3, 5: người đặt) | `403 FORBIDDEN` |
| 2, 3, 5 | 3 | Không còn `REQUESTED` | `409 RENTAL_INVALID_TRANSITION` |

## 2. Sự kiện phát

| Sự kiện | Khi nào |
|---|---|
| `rental.viewing-requested` | Route 1 |
| `rental.viewing-responded` | Route 2 (`decision = DECLINED`) |
| `rental.viewing-confirmed` | Route 3 |
| `rental.viewing-cancelled` | Route 5 (`reason = TENANT`); hoặc khi rental nhận `payment.deposited` cho một đơn trên tin, với mỗi yêu cầu `REQUESTED` của người khác (`reason = LISTING_DEPOSITED`, `RE.DEPOSIT_SAGA/Component_Class_Design.md §6`) |

Payload: `RE.MESSAGING/API_Spec.md §3`, schema ở `contracts/events/`.

## 3. Catalog mã lỗi

| Mã | HTTP | Thông báo | Nguồn |
|---|---|---|---|
| `RENTAL_VIEWING_NOT_FOUND` | 404 | Không tìm thấy lịch xem | Đề xuất |
| `RENTAL_VIEWING_OWN_LISTING` | 403 | Không thể đặt lịch xem tin của chính mình | Chốt 2026-11-16 |
| `RENTAL_VIEWING_DUPLICATE` | 409 | Bạn đã có yêu cầu xem đang chờ cho tin này | Đề xuất (chốt 2026-11-16: cấm trùng) |
| `RENTAL_INVALID_TRANSITION` | 409 | Không thể chuyển trạng thái | Đề xuất, dùng chung với đơn đặt cọc |

## 4. DDL (đề xuất)

```sql
CREATE TABLE viewings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,                 -- không FK
  tenant_id uuid NOT NULL,
  owner_id uuid NOT NULL,                   -- bản chụp
  listing_title varchar(200) NOT NULL,      -- bản chụp
  status varchar(20) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','DECLINED','CONFIRMED','CANCELLED')),
  cancel_reason varchar(30)
    CHECK (cancel_reason IN ('TENANT','LISTING_DEPOSITED')),
  note varchar(500),
  declined_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'CANCELLED') = (cancel_reason IS NOT NULL))
);
CREATE UNIQUE INDEX ux_viewings_open_per_tenant
  ON viewings (listing_id, tenant_id) WHERE status = 'REQUESTED';
CREATE INDEX ix_viewings_tenant ON viewings (tenant_id, created_at DESC);
CREATE INDEX ix_viewings_owner ON viewings (owner_id, created_at DESC);
```

Không có cột giờ hẹn: giờ xem chỉ nằm trong tin nhắn. Index `ux_viewings_open_per_tenant` vừa chặn trùng, vừa phục vụ câu tự hủy theo `listing_id` khi tin có người cọc.

## 5. Đã chốt 2026-11-16

1. Giữ `POST /viewings/:id/respond` với `decision = DECLINE`; sự kiện giữ tên `rental.viewing-responded`.
2. Giữ `POST /viewings/:id/cancel`.
3. Chủ tin không tự đặt lịch xem tin của mình: `403 RENTAL_VIEWING_OWN_LISTING`.
4. Không có `NO_SHOW`.
5. Yêu cầu đã tự hủy giữ `CANCELLED` khi đơn bị hoàn; muốn xem lại thì gửi yêu cầu mới.
