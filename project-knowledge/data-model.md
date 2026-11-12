# Mô hình dữ liệu Real-estate

> Năm database, mỗi service một database (ADR-0002). File này là ERD tổng hợp. Cột đầy đủ, ràng buộc, index nằm ở DDL trong `API_Spec.md` của chức năng, ghi ở cột "DDL đầy đủ". Đọc khi: cần nhìn toàn cảnh dữ liệu, vẽ Hình 3.8 cho báo cáo, thêm bảng mới.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |
| **Nguồn** | DDL trong 10 file `design/*/*/API_Spec.md`; Báo cáo v2 Bảng 3.5, Hình 3.7–3.8 |

## 1. Quy ước

- Khóa ngoại chỉ trong cùng database. Cột `*_id` trỏ sang service khác là tham chiếu logic, không có khóa ngoại (`coding-convention.md §5`).
- Tiền `bigint` VND, thời gian `timestamptz` UTC, ID `uuid` sinh bằng `gen_random_uuid()`.
- Sơ đồ chỉ ghi khóa và cột quyết định nghiệp vụ. `PK` khóa chính, `FK` khóa ngoại, `UK` duy nhất.
- Service phát sự kiện có `outbox_events`; service nhận sự kiện có `processed_events` (`design/SHARED/RE.MESSAGING/API_Spec.md`).

## 2. Database và bảng

| Database | Bảng | DDL đầy đủ |
|---|---|---|
| `identity_db` | `users`, `user_identities`, `bank_accounts`; Redis: refresh token, OTP, token đặt lại mật khẩu | `design/IDENTITY/RE.IDENTITY/API_Spec.md` |
| `listing_db` | `listings`, `listing_images` | `design/LISTING/RE.LISTING/API_Spec.md` |
| `rental_db` | `deposits`, `saga_log` | `design/RENTAL/RE.DEPOSIT_SAGA/API_Spec.md` |
| | `audit_log` | `design/RENTAL/RE.DEPOSIT_LIFECYCLE/API_Spec.md` |
| | `viewings` | `design/RENTAL/RE.VIEWING/API_Spec.md` |
| `payment_db` | `payment_orders`, `payos_webhook_events`, `late_payments` | `design/PAYMENT/RE.PAYMENT/API_Spec.md` |
| | `admin_wallet`, `wallet_transactions`, `refund_requests`, `withdrawal_requests`, `transfer_receipts`, `audit_log` | `design/PAYMENT/RE.PAYOUT/API_Spec.md` |
| `notification_db` | `notifications` | `design/NOTIFICATION/RE.NOTIFICATION/API_Spec.md` |
| | `conversations`, `conversation_participants`, `messages` | `design/NOTIFICATION/RE.CHAT/API_Spec.md` |
| Dùng chung | `outbox_events`, `processed_events` | `design/SHARED/RE.MESSAGING/API_Spec.md` |

## 3. identity_db

```mermaid
erDiagram
    users ||--o{ user_identities : "liên kết đăng nhập ngoài"
    users ||--o| bank_accounts : "tài khoản nhận tiền"
    users {
        uuid id PK
        text email UK "lower(email)"
        text role "TENANT, LANDLORD, ADMIN"
        varchar phone UK "không bắt buộc"
        text status "PENDING_VERIFICATION, ACTIVE, LOCKED"
    }
    user_identities {
        uuid id PK
        uuid user_id FK
        text provider "google"
    }
    bank_accounts {
        uuid id PK
        uuid user_id FK,UK
        bytea account_number_encrypted
        char account_last4
    }
```

Mỗi tài khoản một vai trò ở `users.role` (B9, 2026-11-12); không có `roles`, `user_roles` như Báo cáo Bảng 3.5.

## 4. listing_db

```mermaid
erDiagram
    listings ||--o{ listing_images : "có ảnh"
    listings {
        uuid id PK
        uuid owner_id "chủ trọ, identity"
        bigint deposit_amount_vnd
        geography location "GiST"
        varchar status "AVAILABLE, HELD, DEPOSITED, RENTED, HIDDEN"
        varchar approval_status "PENDING_REVIEW, APPROVED, REJECTED"
        timestamptz held_until
        uuid held_by_deposit_id "rental"
        timestamptz deleted_at "xóa mềm"
    }
    listing_images {
        uuid id PK
        uuid listing_id FK
        varchar object_key UK "S3"
    }
```

## 5. rental_db

```mermaid
erDiagram
    deposits ||--o{ saga_log : "bước saga"
    viewings {
        uuid id PK
        uuid listing_id "listing"
        uuid tenant_id "identity"
        uuid owner_id "bản chụp"
        varchar status "REQUESTED, ACCEPTED, DECLINED, CONFIRMED, CANCELLED"
    }
    deposits {
        uuid id PK
        uuid listing_id "listing, một đơn hoạt động mỗi BĐS"
        uuid tenant_id "identity"
        uuid owner_id "bản chụp"
        bigint amount_vnd "bản chụp"
        varchar status "PENDING_PAYMENT ... WITHDRAWN, CANCELLED"
        uuid payment_order_id "payment"
        timestamptz expires_at
        timestamptz refund_deadline_at
        timestamptz auto_release_at
        timestamptz admin_confirmed_at
        timestamptz seller_acknowledged_at
    }
    saga_log {
        uuid id PK
        uuid deposit_id FK
        varchar step
        varchar outcome "OK, BUSINESS_ERROR, NOT_EXECUTED, UNKNOWN"
    }
    audit_log {
        bigint id PK
        uuid actor_id "quản trị viên"
        varchar action "HAND_OVER"
        uuid target_id "deposit"
    }
```

DDL hiện tại không có khóa ngoại giữa `viewings` và `deposits`.

## 6. payment_db

```mermaid
erDiagram
    payment_orders ||--o{ late_payments : "tiền đến muộn"
    refund_requests }o--o| transfer_receipts : "chứng từ"
    withdrawal_requests }o--o| transfer_receipts : "chứng từ"
    payment_orders {
        uuid id PK
        uuid deposit_id UK "rental"
        bigint payos_order_code UK
        varchar payos_reference UK
        varchar status "PENDING, PAID, CANCELLED"
    }
    payos_webhook_events {
        uuid id PK
        varchar reference "UK khi PAID hoặc LATE"
        varchar result
        jsonb raw
    }
    late_payments {
        uuid id PK
        uuid order_id FK
        varchar payos_reference UK
    }
    admin_wallet {
        smallint id PK "một ví"
        bigint balance_vnd ">= 0"
    }
    wallet_transactions {
        uuid id PK
        varchar type "DEPOSIT_IN, LATE_PAYMENT_IN, WITHDRAW_OUT, REFUND_OUT"
        bigint amount_vnd
        varchar ref_type
        uuid ref_id "UK cùng ref_type"
    }
    refund_requests {
        uuid id PK
        uuid deposit_id "rental"
        varchar requester_type "TENANT, SYSTEM"
        varchar status "PENDING_ADMIN, COMPLETED, REJECTED, FAILED"
        uuid receipt_id
    }
    withdrawal_requests {
        uuid id PK
        uuid deposit_id "rental, một lệnh mở mỗi đơn"
        uuid owner_id "identity"
        varchar status "PENDING, COMPLETED, FAILED"
        uuid receipt_id
    }
    transfer_receipts {
        uuid id PK
        char sha256 UK
        varchar object_key "S3"
    }
    audit_log {
        bigserial id PK
        uuid actor_id
        varchar action
    }
```

`wallet_transactions` trỏ tới order, tiền đến muộn, lệnh rút hoặc yêu cầu hoàn qua cặp `ref_type`, `ref_id`; bất biến ví: `RE.PAYOUT/Processing_Flow.md §4`.

## 7. notification_db

```mermaid
erDiagram
    conversations ||--|{ conversation_participants : "người tham gia"
    conversations ||--o{ messages : "tin nhắn"
    notifications {
        uuid id PK
        uuid user_id "identity"
        jsonb data
        uuid source_event_id "UK cùng user_id"
        timestamptz read_at
    }
    conversations {
        uuid id PK
        varchar type "TENANT_LANDLORD, SUPPORT"
        uuid listing_id "listing"
    }
    conversation_participants {
        uuid conversation_id PK,FK
        uuid user_id PK "identity"
    }
    messages {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id "identity"
    }
```

## 8. Tham chiếu giữa các service

| Cột | Ở bảng | Trỏ tới | Giữ bản chụp |
|---|---|---|---|
| `owner_id`, `tenant_id`, `user_id`, `sender_id`, `actor_id` | nhiều bảng | `identity_db.users` | `owner_id` trong `deposits`, `viewings` |
| `listing_id` | `deposits`, `viewings`, `conversations` | `listing_db.listings` | `listing_title`, `amount_vnd` trong `deposits` |
| `held_by_deposit_id` | `listings` | `rental_db.deposits` | |
| `deposit_id` | `payment_orders`, `refund_requests`, `withdrawal_requests`, `wallet_transactions` | `rental_db.deposits` | `tenant_id`, `owner_id`, `listing_title` trong `payment_orders` |
| `payment_order_id` | `deposits` | `payment_db.payment_orders` | |
