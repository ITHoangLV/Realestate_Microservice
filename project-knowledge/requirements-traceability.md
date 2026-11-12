# Truy vết yêu cầu đề bài

> Mỗi yêu cầu của đề bài ứng với thiết kế nào, task nào và bằng chứng gì khi nộp. Khớp Báo cáo v2 Phụ lục B.
> Trước khi bảo vệ, cả nhóm rà bảng này: cột "Bằng chứng" nào chưa có thì chưa xong.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 1. Yêu cầu bắt buộc

| # | Yêu cầu | Đáp ứng bằng | Thiết kế | Task | Bằng chứng | Báo cáo |
|---|---|---|---|---|---|---|
| 1 | Bài toán, đối tượng, ≥ 5 quy tắc | 19 quy tắc `BR-01..19` | `business-spec/RE.BUSINESS_RULES.md` | T0.1 | Chương 1, §2.3, §2.6 | ✓ |
| 2 | Sơ đồ kiến trúc một trang, bảng service – dữ liệu – trách nhiệm | 5 service + gateway | `architecture.md §2–3`, ADR-0001 | T0.2 | Hình 4.1, Bảng 4.1 | ✓ |
| 3 | Lý do chia, công nghệ | Tiêu chí phân rã | `architecture.md §5`, ADR-0001, 0010 | T0.2 | §4.2.2, §4.3 | ✓ |
| 4 | Mã nguồn và dữ liệu riêng mỗi service | 5 database, 5 user | ADR-0002 | T1.3, T2.x, T3.x, T4.x | `services/*`, `\l` trong Postgres | Code: identity |
| 5a | Mỗi service ≥ 4 endpoint REST | §4 dưới | `API_Spec.md` từng chức năng | T5.1 | `openapi.json` | Thiết kế |
| 5b | Lỗi nghiệp vụ `4xx` có nghĩa | Cột "4xx nghiệp vụ" ở §4 | Catalog mã lỗi | T5.2 | Request Postman | Thiết kế |
| 5c | OpenAPI mỗi service | `openapi.json` + `contracts/openapi/*.yaml` | `guides/RE_OpenAPI_Postman_Guide.md` | T0.3, T5.1 | File + `contracts:check` | Một phần |
| 6 | Gateway không chứa nghiệp vụ | Chỉ định tuyến, JWT, rate limit | `design/SHARED/RE.GATEWAY/` | T1.2 | Đọc code, Báo cáo T16, T17 | Chưa |
| 7a | Luồng qua ≥ 2 service | Saga đặt cọc rental → listing → payment → payOS | `design/RENTAL/RE.DEPOSIT_SAGA/` | T3.2–T3.4 | Demo, E1, E8 | Chưa |
| 7b | Timeout, retry | `InternalHttpService` | `RE.SERVICE_TEMPLATE`, `reliability-standard.md` | Đã có | Test template | ✓ template |
| 7c | Xử lý dịch vụ dừng hoặc chậm | `503/504`, bù trừ, đối soát | `RE.DEPOSIT_SAGA/Processing_Flow.md §3` | T3.3 | E2, E8 | Chưa |
| 7d | `/health` mỗi service | `HealthModule` | `RE.SERVICE_TEMPLATE/API_Spec.md §1` | Đã có | `curl` | ✓ template |
| 8 | Dockerfile riêng, chạy một lệnh | Compose profile `dev` + `apps` | `guides/RE_Docker_Local_Guide.md` | T1.3, T5.4 | Máy sạch ≤ 10 phút | Một phần |
| 9a | Postman ≥ 10 request | 30 request | `guides/RE_OpenAPI_Postman_Guide.md §4` | T5.2 | `infra/postman/`, Newman | Chưa |
| 9b | ≥ 2 tình huống lỗi có số liệu | E1, E2, E3 (+ E4–E10) | `guides/RE_Failure_Experiment_Guide.md` | T6.2, T6.3 | Bảng 5.3, 5.4 | Chưa đo |
| 10 | Đánh giá, hạn chế, phân công | | `guides/RE_Report_Defense_Guide.md` | T7.1 | Chương 7, Phụ lục A | Phân công ✓, kết quả chưa |

## 2. Điểm cộng

Thang điểm cộng `[cần xác nhận]` theo đề bài của môn.

| Hạng mục | Đáp ứng bằng | Thiết kế | Task |
|---|---|---|---|
| Hàng đợi, consumer idempotent, DLQ | RabbitMQ, `processed_events`, `<queue>.dlq` | `design/SHARED/RE.MESSAGING/` | T4.1–T4.3 |
| JWT tại gateway | RS256, khóa công khai | `design/SHARED/RE.GATEWAY/` | T1.2 |
| Circuit breaker | mở rộng X1 | `reliability-standard.md §5` | Ngoài lộ trình |
| Log tập trung | Filebeat → Elasticsearch → Kibana, mở rộng X2 | `infra/elk/` | Ngoài lộ trình |
| CI | GitHub Actions | `guides/RE_OpenAPI_Postman_Guide.md §6` | T1.1, T5.3 |

## 3. Sản phẩm nộp

| Sản phẩm | Nguồn | Người chịu trách nhiệm |
|---|---|---|
| Báo cáo | `guides/RE_Report_Defense_Guide.md §1` | A tổng hợp |
| Mã nguồn, kho Git | `standards/git-workflow.md` | Cả nhóm |
| OpenAPI | `services/*/openapi.json`, `contracts/openapi/` | Mỗi người phần mình |
| Collection Postman + kết quả Newman | `infra/postman/` | B |
| Số liệu thí nghiệm | `infra/k6/`, Bảng 5.3–5.4 | B, C |
| Slide, video demo | `guides/RE_Report_Defense_Guide.md §3–4` | A, cả nhóm |

## 4. Đối chiếu số endpoint theo service

Số route công khai theo thiết kế (đường dẫn listing, rental, payment, notification chốt 2026-11-12; identity chốt 2026-11-13).

| Service | Route công khai | API nội bộ | Ví dụ `4xx` nghiệp vụ |
|---|---|---|---|
| identity | 5 có + 12 đề xuất (gồm OTP, quên mật khẩu, Google, khóa tài khoản) | 1 | `409 IDENTITY_EMAIL_TAKEN`, `401 IDENTITY_INVALID_CREDENTIALS` |
| listing | 12 | 3 | `403 LISTING_NOT_OWNER`, `409 LISTING_NOT_AVAILABLE`, `409 LISTING_HAS_ACTIVE_DEPOSIT` |
| rental | 4 (lịch xem) + 1 (đặt cọc) + 7 (vòng đời) | 1 | `409 RENTAL_REFUND_WINDOW_CLOSED`, `409 RENTAL_NOT_HANDED_OVER`, `409 LISTING_NOT_AVAILABLE` |
| payment | 1 (webhook) + 12 (payout) | 4 | `409 PAYMENT_WITHDRAWAL_NOT_ELIGIBLE`, `409 PAYMENT_RECEIPT_ALREADY_USED` |
| notification | 2 (thông báo) + 4 (chat) | 0 | `404 NOTIFICATION_NOT_FOUND`, `403 NOTIFICATION_CONVERSATION_FORBIDDEN` |

## 5. Việc còn cần nhóm chốt

1. `[cần xác nhận]` Hạn nộp, số slide, thang điểm cộng. Bảo vệ: 2026-12-18 (M5).
2. `[cần xác nhận]` Bản gốc yêu cầu bài tập lớn (Báo cáo v2 trích dẫn [1]) không có trong repo; bảng §1 lấy theo Phụ lục B của báo cáo.
3. Các mục A ở `implementation/van-de-can-quyet-dinh.md`.
