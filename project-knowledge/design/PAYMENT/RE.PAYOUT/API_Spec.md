# RE.PAYOUT — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.PAYOUT` — ví trung gian, yêu cầu hoàn, lệnh rút, chứng từ, nhật ký quản trị |
| **Service** | `payment` (cổng 3004) |
| **Quy tắc** | BR-10, BR-12, BR-15, BR-16, BR-17, BR-19 |
| **Quyết định** | ADR-0009 |
| **CSDL** | `payment_db`: `admin_wallet`, `wallet_transactions`, `refund_requests`, `withdrawal_requests`, `transfer_receipts`, `audit_log`; S3 bucket `payment-proofs`. `Idempotency-Key` lưu Redis bằng `@Idempotent()` của template, không có bảng `idempotency_keys` (B11) |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-18 — v1.2 |

> Thao tác theo Báo cáo v2 Bảng 3.10. Đường dẫn chốt 2026-11-12 (A6).

## 1. API công khai

| # | Method, đường dẫn | Quyền | Thao tác |
|---|---|---|---|
| 1 | `GET /api/v1/payments/transactions/mine` | user | Giao dịch ví liên quan người gọi (BR-19) |
| 2 | `POST /api/v1/withdrawals` | landlord, `Idempotency-Key` | Tạo lệnh rút `PENDING` |
| 3 | `GET /api/v1/withdrawals/mine` | landlord | Lệnh rút của tôi |
| 4 | `GET /api/v1/admin/withdrawals?status=` | admin | Lệnh rút đang chờ |
| 5 | `GET /api/v1/admin/refund-requests?status=` | admin | Yêu cầu hoàn đang chờ |
| 6 | `POST /api/v1/admin/withdrawals/:id/complete` | admin, `Idempotency-Key`, multipart `receipt` | `COMPLETED`, `WITHDRAW_OUT` |
| 7 | `POST /api/v1/admin/withdrawals/:id/fail` | admin, body `{ reason }` | `FAILED`, ví không đổi |
| 8 | `POST /api/v1/admin/refund-requests/:id/complete` | admin, `Idempotency-Key`, multipart `receipt` | `COMPLETED`, `REFUND_OUT` |
| 9 | `POST /api/v1/admin/refund-requests/:id/reject` | admin, body `{ reason }` | `REJECTED`, đơn về `PAID` |
| 10 | `POST /api/v1/admin/refund-requests/:id/fail` | admin, body `{ reason }` | `FAILED`, đơn giữ `REFUND_REQUESTED` |
| 11 | `GET /api/v1/admin/wallet` | admin | `{ balanceVnd, pendingWithdrawalVnd, pendingRefundVnd }` |
| 12 | `GET /api/v1/admin/audit-logs` | admin | Nhật ký thao tác, phân trang |

### 1.1 Tạo lệnh rút (route 2) — BR-15

Body: `{ depositId }`. Số tiền do payment tính, không nhận từ client (BR-15 sửa 2026-11-12):

| `status` từ rental | Số tiền rút |
|---|---|
| `RELEASED` | `amountVnd` |
| `REFUNDED` | `amountVnd` − `amount_vnd` của yêu cầu hoàn `TENANT` `COMPLETED` (phần 30% thuộc chủ trọ, BR-12) |

Kết quả bằng 0 → `409 PAYMENT_WITHDRAWAL_NOT_ELIGIBLE`.

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | `RentalClient.withdrawalEligibility(depositId)` `404` | `404 RENTAL_DEPOSIT_NOT_FOUND` |
| 2 | `ownerId ≠ sub` | `403 FORBIDDEN` |
| 3 | `eligible = false` | `409 PAYMENT_WITHDRAWAL_NOT_ELIGIBLE`, `details.missing` (Báo cáo T13) |
| 4 | Có lệnh rút `PENDING`/`COMPLETED` hoặc yêu cầu hoàn `PENDING_ADMIN`/`FAILED` cho đơn | `409 PAYMENT_PAYOUT_ALREADY_OPEN` (BR-15, BR-16) |
| 5 | `IdentityClient.getBankAccount(sub)` `404` | `409 PAYMENT_BANK_ACCOUNT_MISSING` |
| 6 | Rental hoặc identity lỗi | `503`/`504` |
| 7 | Hợp lệ | Transaction: `INSERT withdrawal_requests PENDING` (bản chụp ngân hàng đã che) + outbox `payment.withdrawal-requested` → `201` |

### 1.2 Hoàn tất lệnh chi (route 6, 8) — BR-17

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Không có | `404 PAYMENT_PAYOUT_NOT_FOUND` |
| 2 | Không phải `PENDING` (rút) / `PENDING_ADMIN` hoặc `FAILED` (hoàn) | `409 PAYMENT_PAYOUT_INVALID_STATUS` |
| 3 | Thiếu tệp, sai loại, quá cỡ | `400 PAYMENT_RECEIPT_INVALID` |
| 4 | `sha256` đã có trong `transfer_receipts` | `409 PAYMENT_RECEIPT_ALREADY_USED` (Báo cáo T14) |
| 5 | Số dư ví < số tiền | `409 PAYMENT_WALLET_INSUFFICIENT`, log `error` (không được xảy ra nếu bất biến đúng) |
| 6 | Hợp lệ | Lưu tệp S3 trước; transaction: `transfer_receipts`, `UPDATE ... WHERE status=<từ>` → `COMPLETED`, `wallet_transactions` `WITHDRAW_OUT`/`REFUND_OUT`, `balance -= amount`, `audit_log`, outbox `payment.withdrawal-completed` / `payment.refunded` → `200` |

Yêu cầu hoàn `FAILED` được hoàn tất lại (Báo cáo: "đơn giữ `REFUND_REQUESTED` để xử lý lại"). Lệnh rút `FAILED` thì chủ trọ tạo lệnh mới sau khi sửa ngân hàng.

### 1.3 Từ chối, thất bại (route 7, 9, 10)

`reason` bắt buộc. `UPDATE ... WHERE status=<từ>` + `audit_log` + outbox (`payment.withdrawal-failed`, `payment.refund-rejected`; yêu cầu hoàn `FAILED` không phát sự kiện).

## 2. API nội bộ

| Method, đường dẫn | Bên gọi | Kết quả |
|---|---|---|
| `POST /internal/refund-requests` | rental | Body `{ depositId }`. Tạo yêu cầu hoàn 70% `PENDING_ADMIN` (`requester_type = TENANT`); idempotent theo `depositId` (đã có → `200`). Order chưa `PAID` → `409 PAYMENT_ORDER_NOT_PAID` |

Số tiền hoàn = `floor(amount_vnd × 70 / 100)` VND của payment order; tỉ lệ `70` là hằng số trong `domain/refund-amount.ts` (Báo cáo cố định). `tenantId` lấy từ `payment_orders`.

## 3. Lời gọi ra ngoài

| Tới | Lệnh | Retry |
|---|---|---|
| rental (S4) | `GET /internal/deposits/:id/withdrawal-eligibility` | Có |
| identity (S3) | `GET /internal/users/:id/bank-account` | Có |

## 4. Sự kiện phát

| Sự kiện | Khi nào |
|---|---|
| `payment.withdrawal-requested` | Route 2 |
| `payment.withdrawal-completed` | Route 6 |
| `payment.withdrawal-failed` | Route 7 |
| `payment.refunded` (DepositRefunded, kèm `requesterType`) | Route 8 |
| `payment.refund-rejected` | Route 9 |

## 5. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn |
|---|---|---|---|---|
| `PAYMENT_WITHDRAWAL_NOT_ELIGIBLE` | 409 | Đơn chưa đủ điều kiện rút tiền | BR-15 | Đề xuất |
| `PAYMENT_PAYOUT_ALREADY_OPEN` | 409 | Đơn đã có lệnh rút hoặc yêu cầu hoàn | BR-15, BR-16 | Đề xuất |
| `PAYMENT_BANK_ACCOUNT_MISSING` | 409 | Vui lòng khai tài khoản nhận tiền | | Đề xuất |
| `PAYMENT_PAYOUT_NOT_FOUND` | 404 | Không tìm thấy lệnh chi | | Đề xuất |
| `PAYMENT_PAYOUT_INVALID_STATUS` | 409 | Lệnh chi không ở trạng thái xử lý được | | Đề xuất |
| `PAYMENT_RECEIPT_INVALID` | 400 | Chứng từ không hợp lệ | BR-17 | Đề xuất |
| `PAYMENT_RECEIPT_ALREADY_USED` | 409 | Chứng từ đã được dùng cho lệnh khác | BR-17 | Đề xuất |
| `PAYMENT_WALLET_INSUFFICIENT` | 409 | Số dư ví trung gian không đủ | NFR01 | Đề xuất |
| `PAYMENT_ORDER_NOT_PAID` | 409 | Đơn chưa được thanh toán | | Đề xuất |

## 6. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `INTERNAL_RENTAL_URL`, `INTERNAL_IDENTITY_URL` | | |
| `S3_*`, `S3_BUCKETS` | `payment-proofs` | Chứng từ |
| `RECEIPT_MAX_BYTES` | `5242880` (5 MB) | Chứng từ tải multipart qua payment; loại `image/jpeg`, `image/png`, `application/pdf` |

## 7. DDL (đề xuất theo Báo cáo Bảng 3.5)

```sql
CREATE TABLE admin_wallet (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),     -- một ví
  balance_vnd bigint NOT NULL DEFAULT 0 CHECK (balance_vnd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (                       -- chỉ thêm, không sửa, không xóa
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(20) NOT NULL CHECK (type IN ('DEPOSIT_IN','LATE_PAYMENT_IN','WITHDRAW_OUT','REFUND_OUT')),
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  deposit_id uuid,
  ref_type varchar(20) NOT NULL,                          -- ORDER, LATE_PAYMENT, WITHDRAWAL, REFUND
  ref_id uuid NOT NULL,
  tenant_id uuid, owner_id uuid,                          -- A8, phục vụ route 1
  correlation_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ref_type, ref_id)                               -- một tham chiếu một dòng
);
CREATE INDEX ix_wallet_tx_tenant ON wallet_transactions (tenant_id, created_at DESC);
CREATE INDEX ix_wallet_tx_owner ON wallet_transactions (owner_id, created_at DESC);

CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  requester_type varchar(10) NOT NULL CHECK (requester_type IN ('TENANT','SYSTEM')),
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  status varchar(20) NOT NULL DEFAULT 'PENDING_ADMIN'
    CHECK (status IN ('PENDING_ADMIN','COMPLETED','REJECTED','FAILED')),
  reason varchar(500),
  receipt_id uuid,
  processed_by uuid, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Một yêu cầu hoàn của người thuê đang mở hoặc đã xong mỗi đơn
CREATE UNIQUE INDEX ux_refund_tenant_active ON refund_requests (deposit_id)
  WHERE requester_type = 'TENANT' AND status IN ('PENDING_ADMIN','FAILED','COMPLETED');

CREATE TABLE withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  bank_snapshot jsonb NOT NULL,                           -- tên ngân hàng, chủ tài khoản, bốn số cuối
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  reason varchar(500),
  receipt_id uuid,
  processed_by uuid, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Mỗi đơn chỉ rút một lần (BR-16)
CREATE UNIQUE INDEX ux_withdrawal_active ON withdrawal_requests (deposit_id) WHERE status IN ('PENDING','COMPLETED');

CREATE TABLE transfer_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 char(64) NOT NULL UNIQUE,                        -- BR-17
  object_key varchar(300) NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL,
  action varchar(50) NOT NULL,                            -- COMPLETE_WITHDRAWAL, FAIL_WITHDRAWAL, COMPLETE_REFUND, ...
  target_type varchar(30) NOT NULL, target_id uuid NOT NULL,
  before jsonb, after jsonb,
  correlation_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 8. Đã chốt 2026-11-16

1. Tiền hoàn `floor(amount × 70 / 100)` VND, tỉ lệ là hằng số.
2. Chứng từ tải multipart qua payment (server tính `sha256`, kiểm loại và kích thước) rồi lưu S3 `payment-proofs`.
3. Yêu cầu hoàn `FAILED` không phát sự kiện.
4. `tenantId` lấy từ `payment_orders`, rental không cần gửi.

## 9. Điểm `[cần xác nhận]`

1. **Quản trị viên xem tài khoản của người thuê khi hoàn** (ghi 2026-11-18, từ T2.1). Đề xuất: màn hình yêu cầu hoàn gọi `GET /internal/users/:tenantId/bank-account` (identity trả số đầy đủ, payment không lưu). Nếu người thuê chưa khai (ví dụ tiền đến muộn): hỏi qua chat `SUPPORT`. Giao diện hiện form khai khi người dùng gửi yêu cầu hoàn lần đầu (`RE.IDENTITY/API_Spec.md §1.4`). Chốt thiết kế chi tiết ở T3.6; không làm trong T2.1.
