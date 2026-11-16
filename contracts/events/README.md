# Hợp đồng event (RabbitMQ)

Đây là **nguồn sự thật** về hình dạng của mọi domain event. Ai phát và ai nghe event nào, ý nghĩa
nghiệp vụ, xem danh mục sự kiện ở
[`project-knowledge/design/SHARED/RE.MESSAGING/API_Spec.md`](../../project-knowledge/design/SHARED/RE.MESSAGING/API_Spec.md)
§3. Queue và binding nằm ở [`infra/rabbitmq/definitions.json`](../../infra/rabbitmq/definitions.json).

```text
contracts/events/
  envelope.v1.schema.json          # phần chung của mọi event
  <miền>.<sự kiện>.v<N>.schema.json # một file cho mỗi event và phiên bản
  examples/<miền>.<sự kiện>.v<N>.json
```

Kiểm tra: `pnpm contracts:check`. Lệnh này kiểm tra schema compile được, ví dụ khớp schema, schema
từ chối payload thiếu trường hoặc thừa trường, routing key cụ thể trong binding đều có schema, và mỗi
event có ít nhất một queue nhận.

## Envelope

Mỗi message gửi lên exchange `domain.events` là một JSON có dạng:

```json
{
  "eventId": "0b8f6a2c-1d3e-4f5a-9b7c-000000000002",
  "eventType": "rental.deposit-created",
  "version": 1,
  "occurredAt": "2026-11-06T08:00:00Z",
  "correlationId": "5e0c7f3a-2b1d-4c9e-8f6a-1b2c3d4e5f60",
  "producer": "rental",
  "payload": { "...": "theo schema của event" }
}
```

| Trường          | Ý nghĩa                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `eventId`       | UUID, sinh một lần khi tạo event. Consumer lưu lại để chống xử lý trùng                |
| `eventType`     | Bằng **đúng** routing key khi publish (`<miền>.<sự kiện>`, sự kiện được có gạch ngang) |
| `version`       | Phiên bản schema của `payload`                                                         |
| `occurredAt`    | Thời điểm nghiệp vụ xảy ra, ISO 8601 UTC (không phải lúc gửi lên RabbitMQ)             |
| `correlationId` | `X-Request-ID` của request gốc, để lần log xuyên service                               |
| `producer`      | Service phát event. Phải là service sở hữu miền đó (rental phát `rental.*`)            |

## Danh sách event (v1)

Theo Báo cáo v2 Bảng 3.13, chốt ở họp T0.1 (2026-11-12). Tên PascalCase trong ngoặc là tên trong báo cáo.

| Event                                                 | Phát bởi | Payload                                                                                | Nghe                 |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- | -------------------- |
| `identity.registered` (UserRegistered)                | identity | `userId`, `email`, `fullName`, `role`                                                  | notification         |
| `rental.viewing-requested` (ViewingRequested)         | rental   | `viewingId`, `listingId`, `tenantId`, `ownerId`                                        | notification         |
| `rental.viewing-responded` (ViewingResponded)         | rental   | như trên + `decision` (chỉ `DECLINED`)                                                 | notification         |
| `rental.viewing-confirmed` (ViewingConfirmed)         | rental   | như `viewing-requested`                                                                | notification         |
| `rental.viewing-cancelled` (không có trong báo cáo)   | rental   | như `viewing-requested` + `reason` (`TENANT`/`LISTING_DEPOSITED`)                      | notification         |
| `rental.deposit-created` (DepositCreated)             | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`, `amountVnd`, `expiresAt`              | notification         |
| `rental.deposit-expired` (DepositExpired)             | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`                                        | notification         |
| `rental.deposit-cancelled` (DepositCancelled)         | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`                                        | notification         |
| `rental.deposit-handed-over` (AdminConfirmedToSeller) | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`, `adminId`                             | notification         |
| `rental.deposit-released` (DepositReleased)           | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`, `trigger` (`TENANT`/`AUTO`)           | notification         |
| `rental.release-reminder` (không có trong báo cáo)    | rental   | `depositId`, `listingId`, `tenantId`, `ownerId`, `autoReleaseAt`                       | notification         |
| `payment.deposited` (DepositPaid)                     | payment  | `depositId`, `orderId`, `tenantId`, `ownerId`, `amountVnd`, `payosReference`, `paidAt` | rental, notification |
| `payment.refunded` (DepositRefunded)                  | payment  | `depositId`, `refundRequestId`, `tenantId`, `ownerId`, `amountVnd`, `requesterType`    | rental, notification |
| `payment.refund-rejected` (RefundRejected)            | payment  | `depositId`, `refundRequestId`, `tenantId`, `ownerId`, `reason`                        | rental, notification |
| `payment.late-payment-credited` (LatePaymentCredited) | payment  | `orderId`, `depositId`, `tenantId`, `amountVnd`, `payosReference`                      | notification         |
| `payment.withdrawal-requested` (WithdrawalRequested)  | payment  | `withdrawalId`, `depositId`, `ownerId`, `amountVnd`                                    | notification         |
| `payment.withdrawal-completed` (WithdrawalCompleted)  | payment  | `withdrawalId`, `depositId`, `ownerId`, `amountVnd`                                    | rental, notification |
| `payment.withdrawal-failed` (WithdrawalFailed)        | payment  | `withdrawalId`, `depositId`, `ownerId`, `amountVnd`, `reason`                          | notification         |

Mọi event của rental mang đủ `tenantId` và `ownerId`; event của payment mang người nhận thông báo
(`tenantId` và/hoặc `ownerId`, thêm so với Báo cáo theo quyết định A5), để notification không phải gọi
lại service khác. Rental không nghe `payment.withdrawal-requested`, `payment.withdrawal-failed` (chốt 2026-11-16,
mục C10 trong `project-knowledge/implementation/van-de-can-quyet-dinh.md`).

Schema của luồng reservation cũ (`rental.requested/accepted/rejected/expired/cancelled/completed`,
`payment.released`) đã xóa ngày 2026-11-12. `payment.deposited`, `payment.refunded` được viết lại ngay
trong `v1` vì khi đó chưa service nào phát hay nghe (ngoại lệ một lần, xem "Đổi schema").

## Quy ước kiểu dữ liệu

- **ID**: UUID dạng chuỗi (`PrimaryGeneratedColumn('uuid')` của template).
- **Tiền**: số nguyên VND (`3000000`), không dùng số thực hay chuỗi. Trong Postgres lưu `bigint`.
- **Thời gian**: chuỗi ISO 8601 UTC, có `Z` (`2026-11-06T08:15:00Z`).
- **Enum**: chữ hoa, gạch dưới (`PENDING_PAYMENT`), trùng tên với trạng thái trong DB của service sở hữu.
- **Tên trường tiền** có hậu tố `Vnd` (`amountVnd`).

## Quy tắc cho producer

- Validate event theo schema trước khi publish. Schema đặt `additionalProperties: false`, nên gõ sai
  tên trường sẽ bị bắt ngay.
- Publish qua bảng outbox, cùng transaction với thay đổi dữ liệu. Không publish thẳng trong request
  handler: DB commit thành công mà publish lỗi thì event mất.
- Message đặt `persistent` (`deliveryMode: 2`), `contentType: application/json`, `messageId = eventId`.

## Quy tắc cho consumer

- **Chống xử lý trùng**: RabbitMQ giao _ít nhất một lần_. Lưu `eventId` đã xử lý trong cùng transaction
  với thay đổi dữ liệu. Gặp lại thì `ack` và bỏ qua.
- **Bỏ qua trường lạ** trong `payload` (không validate chặt ở phía nhận), để producer thêm trường mà
  không làm hỏng consumer.
- Không xử lý được vì lỗi dữ liệu thì `nack` không requeue, message sẽ vào `<queue>.dlq`. Lỗi tạm thời
  (DB chết) thì retry có giới hạn, đừng requeue vô hạn.
- Event có thể đến **sai thứ tự hoặc muộn** (ví dụ `payment.deposited` đến sau khi đơn đã `EXPIRED`).
  Luôn kiểm tra trạng thái hiện tại trước khi chuyển trạng thái (`UPDATE ... WHERE status = <mong đợi>`).

## Đổi schema

| Thay đổi                                              | Cách làm                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Thêm trường **không bắt buộc** vào payload            | Sửa schema `v1` hiện tại, cập nhật ví dụ                                                 |
| Thêm trường bắt buộc, xóa trường, đổi kiểu, đổi nghĩa | Tạo file `v2`. Producer phát song song `v1` và `v2` cho đến khi mọi consumer chuyển xong |
| Thêm event mới                                        | Thêm schema và ví dụ, thêm binding trong `definitions.json` và `check-infra.*`           |

Trước khi có code phát hoặc nghe một event, được sửa thẳng `v1` (đã dùng ngày 2026-11-12; ngày 2026-11-16 cho ba sự kiện lịch xem: bỏ `scheduledAt`, `decision` chỉ còn `DECLINED`, thêm `rental.viewing-cancelled`).
Từ khi có code, theo đúng bảng trên.

Mọi thay đổi ở đây phải đi cùng PR với việc cập nhật danh mục sự kiện
`project-knowledge/design/SHARED/RE.MESSAGING/API_Spec.md` §3, và cần người phụ trách các service nghe
event đó review.
