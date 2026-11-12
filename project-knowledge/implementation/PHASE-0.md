# Phase 0 — Chốt thiết kế và hợp đồng

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

**Mục tiêu:** cả nhóm hiểu cùng một nghiệp vụ (Báo cáo v2), chốt các `[cần xác nhận]` chặn code, viết lại hợp đồng nội bộ và sự kiện theo luồng payOS.

**Hạn:** M0 — 2026-11-13 (cuối S1).

**Điều kiện xong:** `pnpm contracts:check` xanh với hợp đồng v2; mục A của `van-de-can-quyet-dinh.md` có quyết định.

---

## T0.1 Duyệt nghiệp vụ và vấn đề chặn code

| | |
|---|---|
| **Người làm** | Cả nhóm, A chủ trì |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Đọc trước** | `business-spec/RE.BUSINESS_RULES.md`, `van-de-can-quyet-dinh.md` |
| **Phụ thuộc** | Không |

**Các bước:**

1. Đọc `RE.BUSINESS_RULES.md §4–5`, đối chiếu Báo cáo v2 Bảng 2.5, 3.4.
2. Đi qua mục A của `van-de-can-quyet-dinh.md`, điền cột "Quyết định".
3. Mỗi quyết định ảnh hưởng thiết kế → người phụ trách sửa `design/` (lần sửa đầu tiên: tạo `CHANGELOG.md`).

**DoD:** Mục A không còn dòng trống ở cột "Quyết định". `RE.BUSINESS_RULES.md §8` cập nhật.

---

## T0.2 Duyệt kiến trúc và ADR

| | |
|---|---|
| **Người làm** | A; B, C đọc phần của mình |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Đọc trước** | `architecture.md`, `decisions/` |
| **Phụ thuộc** | T0.1 |

**Các bước:**

1. Mỗi người đọc ADR liên quan phần mình: B (0002, 0007, 0010), C (0004, 0005, 0006, 0009), A (còn lại).
2. ADR đồng ý → đổi `Proposed` thành `Accepted` (file và `decisions/README.md`).
3. Xóa `docs/adr/`, `docs/architecture/service-boundaries.md` khỏi repo bằng `git rm` (B14, chốt 2026-11-12).

**DoD:** Mọi ADR có trạng thái chốt.

---

## T0.3 Hợp đồng API nội bộ v2

| | |
|---|---|
| **Người làm** | B (listing), C (rental, payment), A (identity) |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Đọc trước** | `contracts/openapi/README.md`, `API_Spec.md §2` của `RE.LISTING`, `RE.DEPOSIT_LIFECYCLE`, `RE.PAYMENT`, `RE.PAYOUT`, `RE.IDENTITY` |
| **Phụ thuộc** | T0.1 |

**Các bước:**

1. `listing-internal.v1.yaml`: giữ `GET /internal/listings/{id}`, thêm `status`, `approvalStatus`; thêm `holds`, `status` (thêm endpoint là không phá).
2. `rental-internal.v1.yaml`: `GET /internal/reservations/{id}` thuộc luồng cũ → thay bằng `GET /internal/deposits/{id}/withdrawal-eligibility` (đổi phá hợp đồng: đánh dấu bản cũ bỏ, chưa ai gọi `[cần xác nhận]`).
3. Tạo `payment-internal.v1.yaml`: `payment-orders` (tạo, hủy, tra cứu), `refund-requests`.
4. Tạo `identity-internal.v1.yaml`: `users/{id}/bank-account`.
5. Mỗi response có `example`; người phụ trách bên gọi duyệt PR.

**Kiểm chứng:**

```powershell
pnpm contracts:check
```

**DoD:** 4 file hợp đồng phủ mọi lời gọi ở `architecture.md §7.1`; CI/lệnh kiểm xanh.

---

## T0.4 Hợp đồng sự kiện v2 và topology

| | |
|---|---|
| **Người làm** | A (khung, topology), C (sự kiện rental, payment) |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Đọc trước** | `design/SHARED/RE.MESSAGING/API_Spec.md`, `contracts/events/README.md` |
| **Phụ thuộc** | T0.1 (chốt routing key, regex `eventType`) |

**Các bước:**

1. Chốt routing key; nới regex trong `envelope.v1.schema.json` nếu dùng gạch ngang.
2. Schema + example cho mọi sự kiện ở `RE.MESSAGING/API_Spec.md §3`; cập nhật payload `payment.deposited`, `payment.refunded`.
3. Xử lý schema luồng cũ (`rental.requested`…, `payment.released`).
4. `definitions.json`: binding mới cho `rental.payment-events`; quyết định queue dự phòng; cập nhật `infra/scripts/check-infra.*`.

**Kiểm chứng:**

```powershell
pnpm contracts:check
pnpm infra:down; docker volume rm realestate_rabbitmq_data; pnpm infra:up; pnpm infra:check
```

**DoD:** Mọi sự kiện có schema và example; `infra:check` OK với binding mới.
