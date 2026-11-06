# Hợp đồng event (RabbitMQ)

Đây là **nguồn sự thật** về hình dạng của mọi domain event. Ai phát và ai nghe event nào thì xem
[ranh giới service](../../docs/architecture/service-boundaries.md), mục 5. Queue và binding nằm ở
[`infra/rabbitmq/definitions.json`](../../infra/rabbitmq/definitions.json).

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
  "eventType": "rental.requested",
  "version": 1,
  "occurredAt": "2026-11-06T08:00:00Z",
  "correlationId": "5e0c7f3a-2b1d-4c9e-8f6a-1b2c3d4e5f60",
  "producer": "rental",
  "payload": { "...": "theo schema của event" }
}
```

| Trường          | Ý nghĩa                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `eventId`       | UUID, sinh một lần khi tạo event. Consumer lưu lại để chống xử lý trùng     |
| `eventType`     | Bằng **đúng** routing key khi publish (`<miền>.<sự kiện>`)                  |
| `version`       | Phiên bản schema của `payload`                                              |
| `occurredAt`    | Thời điểm nghiệp vụ xảy ra, ISO 8601 UTC (không phải lúc gửi lên RabbitMQ)  |
| `correlationId` | `X-Request-ID` của request gốc, để lần log xuyên service                    |
| `producer`      | Service phát event. Phải là service sở hữu miền đó (rental phát `rental.*`) |

## Danh sách event (v1)

| Event                 | Phát bởi | Payload                                                                                                    |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `identity.registered` | identity | `userId`, `email`, `fullName`, `role`                                                                      |
| `rental.requested`    | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`, `listingTitle`, `depositAmount`, `paymentDeadline` |
| `payment.deposited`   | payment  | `reservationId`, `paymentId`, `amount`, `payerId`, `payeeId`                                               |
| `rental.accepted`     | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`, `claimDeadline`                                    |
| `rental.rejected`     | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`, `reason` (có thể `null`)                           |
| `rental.expired`      | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`, `stage`                                            |
| `rental.cancelled`    | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`, `stage`                                            |
| `rental.completed`    | rental   | `reservationId`, `listingId`, `tenantId`, `landlordId`                                                     |
| `payment.refunded`    | payment  | `reservationId`, `paymentId`, `amount`, `payerId`                                                          |
| `payment.released`    | payment  | `reservationId`, `paymentId`, `amount`, `payeeId`                                                          |

`stage` là `PENDING_DEPOSIT` (chưa có tiền) hoặc `AWAITING_LANDLORD` (đã có tiền, payment phải hoàn).
Mọi event của rental đều mang đủ `tenantId` và `landlordId`, để notification gửi được thông báo mà
không phải gọi lại rental.

## Quy ước kiểu dữ liệu

- **ID**: UUID dạng chuỗi (`PrimaryGeneratedColumn('uuid')` của template).
- **Tiền**: số nguyên VND (`3000000`), không dùng số thực hay chuỗi. Trong Postgres lưu `bigint`.
- **Thời gian**: chuỗi ISO 8601 UTC, có `Z` (`2026-11-06T08:15:00Z`).
- **Enum**: chữ hoa, gạch dưới (`AWAITING_LANDLORD`), trùng tên với trạng thái trong DB của service sở hữu.

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
- Event có thể đến **sai thứ tự hoặc muộn** (xem ca khó số 1 trong ranh giới service). Luôn kiểm tra
  trạng thái hiện tại trước khi chuyển trạng thái.

## Đổi schema

| Thay đổi                                              | Cách làm                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Thêm trường **không bắt buộc** vào payload            | Sửa schema `v1` hiện tại, cập nhật ví dụ                                                 |
| Thêm trường bắt buộc, xóa trường, đổi kiểu, đổi nghĩa | Tạo file `v2`. Producer phát song song `v1` và `v2` cho đến khi mọi consumer chuyển xong |
| Thêm event mới                                        | Thêm schema và ví dụ, thêm binding trong `definitions.json` và `check-infra.*`           |

Mọi thay đổi ở đây phải đi cùng PR với việc cập nhật `docs/architecture/service-boundaries.md`, và
cần người phụ trách các service nghe event đó review.
