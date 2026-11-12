# Hướng dẫn thí nghiệm lỗi

> Đề yêu cầu tối thiểu 2 tình huống lỗi có số liệu. E1, E2, E3 là bắt buộc (Báo cáo v2 §5.4.3); E4–E10 bổ sung (Bảng 5.4).
>
> **Mọi ô trống điền bằng số đo thật.** Cột "Kỳ vọng" là giả thuyết. Kết quả khác kỳ vọng thì ghi đúng và giải thích. Ô "Chưa đo" chỉ được thay khi có bằng chứng.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 1. Chuẩn bị

| Việc | Ghi chú |
|---|---|
| Thống nhất `HTTP_TIMEOUT_MS` | `van-de-can-quyet-dinh.md` A2. Đổi giữa các lần đo thì số liệu không so được |
| Rút ngắn hạn | `HOLD_TTL_SECONDS=60`, `AUTO_RELEASE` vài chục giây (đơn vị: A3) |
| Seed | 30 tin, tài khoản người thuê cho k6 |
| Ghi môi trường | Commit, cấu hình máy, số VU, thời gian chạy |
| Reset giữa các lần | `down -v` rồi dựng lại để dữ liệu sạch |

Báo cáo v2 không định nghĩa chế độ "trước/sau xử lý" như các đề tài có cờ tắt cơ chế chịu lỗi. Nếu muốn có cột "trước" thì cần cờ tắt timeout/retry/bù trừ `[cần xác nhận]`; nếu không, mỗi thí nghiệm so **trước, trong, sau** sự cố.

## 2. Công cụ

**k6** chạy trong Docker:

```powershell
docker run --rm -i --network realestate-net -e BASE_URL=http://api-gateway:8080 `
  -v "${PWD}/infra/k6:/k6" grafana/k6 run --summary-export=/k6/results/e1-1.json /k6/e1-concurrent-deposit.js
```

`[cần xác nhận]` tên network Docker (`realestate-net` theo README template).

`infra/k6/e1-concurrent-deposit.js` (khung):

```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const status = new Counter('deposit_status');
export const options = { scenarios: { burst: { executor: 'per-vu-iterations', vus: 50, iterations: 1 } } };
const BASE = __ENV.BASE_URL;
const LISTING = __ENV.LISTING_ID;

export function setup() { /* đăng nhập 50 người thuê seed, trả mảng token */ }

export default function (tokens) {
  const res = http.post(`${BASE}/api/v1/deposits`, JSON.stringify({ listingId: LISTING }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[__VU - 1]}`, 'Idempotency-Key': uuidv4() },
  });
  status.add(1, { status: String(res.status) });
  check(res, { 'có phản hồi': (r) => r.status !== 0 });
}
```

**Ảnh chụp dữ liệu** (`infra/k6/snapshot.ps1` hoặc `.sh`):

| Chỉ số | Truy vấn |
|---|---|
| Đơn hoạt động mỗi BĐS | `rental_db`: `select listing_id, count(*) from deposits where status in ('PENDING_PAYMENT','PAID','REFUND_REQUESTED') group by 1 having count(*) > 1` |
| Trạng thái đơn | `rental_db`: `select status, count(*) from deposits group by 1` |
| Trạng thái BĐS | `listing_db`: `select status, count(*) from listings group by 1` |
| Outbox tồn | Mỗi DB phát: `select count(*) from outbox_events where published_at is null` |
| Số dư ví vs giao dịch | `payment_db`: `select balance_vnd from admin_wallet` và tổng theo `type` của `wallet_transactions` |
| Sự kiện đã xử lý | `rental_db`, `notification_db`: `select count(*) from processed_events` |

## 3. E1 — 50 yêu cầu đặt cọc đồng thời một BĐS (bắt buộc)

**Câu hỏi:** chỉ một người giữ được chỗ không? Gateway tốn bao nhiêu thời gian?

| Chỉ số | Kỳ vọng | Lần 1 | Lần 2 | Lần 3 |
|---|---|---|---|---|
| Số `201` | 1 | | | |
| Số `409` | 49 | | | |
| Số `5xx` | 0 | | | |
| Đơn hoạt động trên BĐS | 1 | | | |
| p50, p95 qua gateway (ms) | | | | |
| p50, p95 gọi thẳng rental (ms) | | | | |

## 4. E2 — Tắt listing khi có người đặt cọc (bắt buộc)

```powershell
# tải nền: đặt cọc nhiều BĐS khác nhau + xem đơn, hoàn, thông báo
docker compose ... stop listing      # sau 15 giây
docker compose ... start listing     # sau 25 giây
```

| Chỉ số | Kỳ vọng | Trước | Trong | Sau |
|---|---|---|---|---|
| Tỉ lệ `201/409/503/504` của `POST /deposits` | Trong: `503` có mã rõ | | | |
| Đơn được tạo khi listing tắt | 0 | | | |
| `GET /deposits/mine`, thông báo | `200` | | | |
| p95 (ms) | | | | |
| Thời gian hồi phục sau khi bật (giây) | | | | |

## 5. E3 — Tắt RabbitMQ rồi bật lại (bắt buộc)

```powershell
docker compose ... stop rabbitmq
# đặt cọc, gửi webhook hợp lệ
docker compose ... start rabbitmq
```

| Chỉ số | Kỳ vọng | Kết quả |
|---|---|---|
| `POST /deposits` khi RabbitMQ tắt | `201` | |
| Webhook khi RabbitMQ tắt | `200`, payment commit, outbox tăng | |
| Outbox tồn lúc bật lại | > 0 | |
| Thời gian tới khi outbox rỗng (giây) | | |
| Đơn chuyển `PAID` sau khi bật | Có | |
| `processed_events` = số sự kiện duy nhất | Có | |

## 6. Bảng tổng hợp cho báo cáo (Bảng 5.3)

| Chỉ số | E1 | E2 | E3 |
|---|---|---|---|
| Số mẫu, số lần lặp | | | |
| p50, p95 (ms) | | | |
| Tỉ lệ `201/409/503/504` | | | |
| Đơn hoạt động trên một BĐS | | | Không áp dụng |
| Sự kiện gửi bù, xử lý trùng | Không áp dụng | Không áp dụng | |
| Thời gian hội tụ (giây) | Không áp dụng | | |

## 7. E4–E10 (Bảng 5.4)

| Mã | Kịch bản | Tiêu chí | Kết quả |
|---|---|---|---|
| E4 | `HOLD_TTL_SECONDS=60`, không thanh toán | Link hủy trước; `EXPIRED` ≤ 70 giây; BĐS `AVAILABLE` | |
| E5 | Webhook hợp lệ sau khi `EXPIRED` | `late_payments`, `LATE_PAYMENT_IN`, yêu cầu hoàn 100% `SYSTEM`; đơn giữ `EXPIRED` | |
| E6 | Rút ngắn tự giải ngân | Có nhắc; `RELEASED` đúng hạn; BĐS `RENTED` | |
| E7 | Yêu cầu hoàn đúng lúc `AutoReleaseJob` | Một trạng thái cuối | |
| E8 | Payment dừng ngay sau khi giữ chỗ | BĐS về `AVAILABLE`; không đơn treo | |
| E9 | Message hỏng vào queue | Vào `<queue>.dlq`; consumer xử lý tiếp | |
| E10 | Sau mỗi kịch bản | Số dư ví = Σ vào − Σ ra | |

E7 cần chỉnh `auto_release_at` trong DB hoặc biến thời gian để hai việc trùng nhau; ghi cách làm.

## 8. Trình bày

- Lấy trung vị 3 lần, ghi cả 3 giá trị vào phụ lục.
- Lưu kết quả thô k6, log theo `correlationId`, ảnh chụp dữ liệu trước/sau, kèm commit.
- Mỗi kịch bản viết: hiện tượng, số liệu, nguyên nhân, kết luận.
