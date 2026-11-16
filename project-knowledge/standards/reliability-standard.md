# Chuẩn độ tin cậy

> Chuẩn cho mọi giao tiếp liên service và với payOS. Hiện thực ở `InternalHttpService` (`design/SHARED/RE.SERVICE_TEMPLATE/`) và `src/messaging/` (`design/SHARED/RE.MESSAGING/`).
> Nguồn: Báo cáo v2 §4.7, `services/_template-nest/src/common/http/internal-http.service.ts`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-16 |

## 1. Nguyên tắc

1. Mọi lời gọi ra ngoài tiến trình đều có timeout.
2. Chỉ retry khi lỗi có thể tự hết **và** lệnh an toàn khi lặp lại.
3. Không retry `4xx`.
4. Tổng thời gian bên trong phải nhỏ hơn thời gian chờ bên ngoài.
5. Lỗi phụ thuộc không biến thành `500`: `503` hoặc `504` có mã rõ.
6. Lệnh ghi có kết quả không rõ phải được đối soát, không đoán.

## 2. Tham số

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| Timeout HTTP nội bộ | `HTTP_TIMEOUT_MS` = 3.000 ms (mặc định template) | Chốt 2026-11-12 (A2): mặc định 3.000; rental → listing 2.000 (`LISTING_CALL_TIMEOUT_MS`); rental → payment chốt sau khi đo E1, E2 `[cần đo]`. Sửa `.env` gốc từ 5.000 về 3.000 |
| Timeout từng lần gọi | `{ timeoutMs }` khi gọi | Ghi đè được theo lời gọi |
| Số lần thử lại | `HTTP_MAX_RETRIES` = 2 | Tối đa 3 lần gọi |
| Backoff | 100 ms, 200 ms (100 × 2ⁿ) | |
| Điều kiện thử lại | Timeout, mất kết nối, upstream `502/503/504` | |
| Thời hạn trả link đặt cọc | ≤ 8 giây (NFR07) | Ngân sách của cả saga trong request |
| Timeout gọi payOS | `PAYOS_TIMEOUT_MS` = 2.500 ms (chốt 2026-11-16) | Phải < `PAYMENT_CALL_TIMEOUT_MS`; không retry lệnh tạo link |
| Retry trong consumer | 200 → 400 → 800 ms, tối đa 3 lần (`RABBITMQ_MAX_RETRIES`) | Quá số lần: nack không requeue → `<queue>.dlq` |
| Timeout mỗi kiểm tra `/health` | Theo Terminus của template | |
| Circuit breaker | Phần mở rộng X1 | Rental → listing, rental → payment |

**Kiểm ngân sách:** một lời gọi GET xấu nhất ≈ 3 × `HTTP_TIMEOUT_MS` + 300 ms. Với 3.000 ms là ≈ 9,3 giây, vượt NFR07. Vì vậy các lời gọi trong luồng đặt cọc dùng `timeoutMs` riêng (listing 2.000 ms theo A2; payment đo rồi chốt), và lệnh ghi (giữ chỗ, tạo order) không retry nên chỉ tốn một lần timeout.

## 3. Lệnh nào được retry

| Lệnh | Retry | Lý do |
|---|---|---|
| `GET` bất kỳ | Có | Không đổi dữ liệu |
| `PUT`, `DELETE` | Có (template luôn retry, không tắt được) | Mọi `PUT`/`DELETE` nội bộ phải idempotent; không idempotent thì dùng `POST` |
| rental → listing: giữ chỗ | **Không** | Lệnh ghi; kết quả không rõ thì `held_until` tự nhả |
| rental → listing: nhả chỗ, chuyển `DEPOSITED`/`RENTED`/`AVAILABLE` | Có (`idempotent: true`) | Idempotent theo `depositId` + trạng thái đích |
| rental → payment: tạo payment order | Có (`idempotent: true`) | Idempotent theo `depositId` (duy nhất trong `payment_orders`) |
| rental → payment: hủy order | Có | Idempotent |
| rental → payment: tạo yêu cầu hoàn | Có (`idempotent: true`) | Idempotent theo `depositId` |
| payment → identity: tài khoản nhận tiền | Có | Chỉ đọc |
| payment → rental: điều kiện rút | Có | Chỉ đọc |
| payment → payOS: tạo link | **Không** | Có thể tạo trùng |
| payment → payOS: tra cứu, hủy link | Có (chốt 2026-11-16) | Tra cứu chỉ đọc; hủy link idempotent |

## 4. Ánh xạ lỗi

| Điều xảy ra | Retry | Bên gọi nhận | Kết luận |
|---|---|---|---|
| Upstream `2xx` | không | `data` | — |
| Upstream `4xx` nghiệp vụ | không | Giữ nguyên status và `error.code` | Đã có kết luận nghiệp vụ |
| Từ chối kết nối, không phân giải tên | có | `503 UPSTREAM_UNAVAILABLE` | Chắc chắn chưa thực hiện (`not_executed`) |
| Hết thời gian chờ | có nếu idempotent | `504 UPSTREAM_TIMEOUT` | Chưa biết (`unknown`) |
| Upstream `5xx` | có nếu idempotent | `503` | Chưa biết (`unknown`) |

Sau nhiều lần thử, chỉ cần một lần `unknown` thì kết quả là `unknown`. Saga ghi `outcome` vào `saga_log`; `unknown` phải đối soát (`SagaReconcileJob`). Template gắn `details.outcome` (`NOT_EXECUTED` khi chưa gửi được request, còn lại `UNKNOWN`) vào `AppException` `503`/`504` (C14, chốt 2026-11-16; A sửa ở bước 0 T1.2). Không suy ra từ status.

## 5. Circuit breaker

Phần mở rộng, chỉ làm khi đạt mốc feature freeze đúng hạn. Tham số `[cần xác nhận]` khi làm X1. `4xx` không tính là lỗi mạch.

## 6. Health check

`GET /health` (Docker) và alias `GET /api/v1/health`:

```json
{ "status": "ok", "service": "rental", "version": "…", "uptime": 123, "checks": { "db": "up", "redis": "up", "rabbitmq": "up" } }
```

- `200` khi mọi phụ thuộc **của riêng service** sống; `503` nếu không.
- Kiểm: DB, Redis, RabbitMQ, S3 theo module đang bật (`HealthRegistry`).
- **Không** kiểm service khác.
- Không cần xác thực, không bọc envelope.

## 7. Hành vi khi phụ thuộc lỗi

Bảng đầy đủ: `architecture.md §4`. Saga: `design/RENTAL/RE.DEPOSIT_SAGA/Processing_Flow.md §3`.

## 8. Những gì phải đo

`guides/RE_Failure_Experiment_Guide.md`: p50, p95, tỉ lệ `201/409/503/504`, số đơn hoạt động trên một BĐS, sự kiện gửi bù, thời gian hội tụ, số dư ví khớp tổng giao dịch.
