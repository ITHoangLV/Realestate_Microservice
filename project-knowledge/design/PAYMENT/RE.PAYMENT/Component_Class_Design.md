# RE.PAYMENT — Thiết kế thành phần

| | |
|---|---|
| **Service** | `services/payment/src/payment/` |
| **Quy ước** | `standards/coding-convention.md §4`, `standards/reliability-standard.md §3` |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Cấu trúc

```text
src/payment/
├─ payment.module.ts
├─ controllers/
│  ├─ payos-webhook.controller.ts          # @Public, đọc body thô
│  ├─ payment-orders.internal.controller.ts
│  ├─ withdrawals.controller.ts            # RE.PAYOUT
│  ├─ payouts.admin.controller.ts          # RE.PAYOUT
│  └─ transactions.controller.ts           # RE.PAYOUT
├─ services/
│  ├─ payment-order.service.ts             # create, cancel, get
│  ├─ webhook.service.ts                   # handle(raw): bảng §1 API_Spec
│  ├─ deposit-capture.service.ts           # §1.1, §1.2 trong một transaction
│  ├─ wallet.service.ts                    # RE.PAYOUT: credit/debit + wallet_transactions
│  ├─ refund.service.ts, withdrawal.service.ts, receipt.service.ts, audit.service.ts  # RE.PAYOUT
├─ clients/
│  ├─ payos.client.ts                      # bọc SDK payOS: timeout, không retry createPaymentLink
│  ├─ rental.client.ts                     # RE.PAYOUT
│  └─ identity.client.ts                   # RE.PAYOUT
├─ entities/ dto/ errors/payment.errors.ts config/payment.env.ts
```

## 2. Sơ đồ lớp

```mermaid
classDiagram
    class PaymentOrderService {
      +create(dto) OrderView
      +cancel(depositId) CancelResult
      +get(depositId) OrderView
    }
    class WebhookService {
      +handle(raw) void
    }
    class DepositCaptureService {
      +capture(m, order, webhook)
      +recordLate(m, order, webhook)
    }
    class WalletService {
      +credit(m, type, amount, ref)
      +debit(m, type, amount, ref)
    }
    class PayosClient {
      +createLink(orderCode, amount, desc, expiredAt) Link
      +cancelLink(orderCode)
      +getLink(orderCode) LinkInfo
      +verify(raw) boolean
    }
    PaymentOrderService --> PayosClient
    WebhookService --> PayosClient
    WebhookService --> DepositCaptureService
    DepositCaptureService --> WalletService
    DepositCaptureService --> OutboxService
```

## 3. `WebhookService.handle`

```ts
async handle(raw: unknown) {
  const ev = await this.events.save(toWebhookEvent(raw, this.payos.verify(raw)));   // luôn lưu
  if (!ev.signatureValid) return this.mark(ev, 'INVALID_SIGNATURE');
  if (!isSuccess(raw)) return this.mark(ev, 'IGNORED');
  const order = await this.orders.findOneBy({ payosOrderCode: ev.orderCode });
  if (!order) return this.mark(ev, 'UNKNOWN_ORDER');
  if (ev.amountVnd !== order.amountVnd) return this.mark(ev, 'AMOUNT_MISMATCH');
  try {
    await this.dataSource.transaction(async (m) => {
      await m.update(WebhookEvent, ev.id, { result: order.status === 'PENDING' ? 'PAID' : 'LATE' }); // unique → trùng
      const won = await this.capture.capture(m, order, ev);            // UPDATE ... WHERE status='PENDING'
      if (!won) await this.capture.recordLate(m, order, ev);           // CANCELLED, hoặc vừa đổi
    });
  } catch (e) {
    if (isUniqueViolation(e, 'ux_webhook_accepted_reference')) return this.mark(ev, 'DUPLICATE');
    throw e;                                                           // 500, payOS gửi lại
  }
}
```

`capture` trả `false` khi `UPDATE` 0 dòng; khi đó đọc lại order trong cùng transaction để quyết định `LATE`, đúng kết quả cuối ghi vào `result`.

## 4. Test bắt buộc

| # | Tình huống | Mong đợi |
|---|---|---|
| 1 | Webhook hợp lệ | Order `PAID`, 1 `DEPOSIT_IN`, `balance` tăng đúng, 1 `payment.deposited` |
| 2 | Webhook hợp lệ gửi hai lần | Một giao dịch ví, một sự kiện (Báo cáo T10) |
| 3 | Hai webhook cùng `reference` đồng thời, Postgres thật | Như trên |
| 4 | Sai chữ ký | Không đổi gì, có log `warn` (Báo cáo T09) |
| 5 | Sai số tiền | Không đổi ví, order `PENDING` (Báo cáo T09) |
| 6 | Webhook cho order `CANCELLED` | `late_payments`, `LATE_PAYMENT_IN`, yêu cầu hoàn 100% `SYSTEM`, 1 `late-payment-credited` (E5) |
| 7 | Tạo order hai lần cùng `depositId` | Một order, một lần gọi payOS |
| 8 | payOS timeout khi tạo link | `503`, order có trước khi gọi |
| 9 | Hủy order `PENDING` | payOS `cancel` gọi trước `UPDATE` |
| 10 | Hủy khi webhook vừa thắng | `409 PAYMENT_ORDER_ALREADY_PAID` |
| 11 | Mọi sự kiện | Đúng schema `contracts/events/` |
| 12 | Số dư ví sau mỗi test | = tổng vào − tổng ra (E10) |

## 5. Điểm [cần xác nhận]

1. Phiên bản SDK payOS và cách cấu hình timeout, tắt retry của SDK.
