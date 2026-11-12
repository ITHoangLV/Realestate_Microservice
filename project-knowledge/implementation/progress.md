# Tiến độ

> Cập nhật sau mỗi lần merge. Điền ngày hoàn thành thật.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

**Bảo vệ:** 2026-12-18 (M5, `README.md` — Lịch và mốc) · **Hạn nộp báo cáo:** `[cần xác nhận]` · **Đề tài:** Thiết kế hệ thống cho thuê nhà, căn hộ, chung cư Real-estate theo kiến trúc microservices · **Nhóm:** 5 · **Số thành viên:** 3

| Vai | Họ tên | MSSV |
|---|---|---|
| A | Lưu Việt Hoàng | B23DCCC073 |
| B | Đỗ Trung Thành | B23DCCC149 |
| C | Đỗ Trung Thông | B23DCCC153 |

## Đã có trước kế hoạch này

- [x] Monorepo pnpm, ESLint, Prettier, `.nvmrc`
- [x] Hạ tầng Docker Compose (Postgres + PostGIS, Redis, RabbitMQ, Silo, ELK profile demo), `infra:check`
- [x] Topology RabbitMQ phiên bản đầu (`definitions.json`)
- [x] `contracts/` phiên bản đầu (luồng reservation cũ)
- [x] `services/_template-nest` kèm test
- [x] `services/identity`: đăng ký, đăng nhập, làm mới, đăng xuất, `/me`, seed ADMIN

## Phase 0 — Chốt thiết kế

- [x] T0.1 Duyệt nghiệp vụ và mục A của `van-de-can-quyet-dinh.md` — cả nhóm (2026-11-12)
- [ ] T0.2 Duyệt kiến trúc và ADR — A, B, C đọc phần của mình
- [ ] T0.3 Hợp đồng API nội bộ v2 — B (listing), C (rental, payment), A (identity)
- [ ] T0.4 Hợp đồng sự kiện v2 và topology — A, C

## Phase 1 — Nền tảng, gateway

- [ ] T1.1 CI: lint, format, contracts, build, test — B
- [ ] T1.2 api-gateway — A
- [ ] T1.3 Compose profile `apps`, identity sau gateway — A

## Phase 2 — identity, listing

- [ ] T2.1 identity: tài khoản nhận tiền, đổi vai trò, API nội bộ — A
- [ ] T2.2 listing: khung, CRUD sản phẩm, duyệt, ảnh — B
- [ ] T2.3 listing: tìm kiếm PostGIS, API nội bộ giữ chỗ — B
- [ ] T2.4 listing: seed dữ liệu — B
- [ ] T2.5 identity: OTP, quên mật khẩu, Google, khóa tài khoản, số điện thoại — A

## Phase 3 — rental, payment

- [ ] T3.1 payment: khung, payment order, payOS — C
- [ ] T3.2 rental: khung, lịch xem, saga luồng thành công — C
- [ ] T3.3 Saga: bù trừ, đối soát, đồng bộ listing — C
- [ ] T3.4 Webhook, hết hạn giữ chỗ, tiền đến muộn — C
- [ ] T3.5 Vòng đời đơn: bàn giao, nhận phòng, tự giải ngân — C
- [ ] T3.6 Payout: hoàn, rút, chứng từ, ví — C

## Phase 4 — Bất đồng bộ, notification, chat

- [ ] T4.1 Binding queue, schema sự kiện trong code — A
- [ ] T4.2 notification: consumer, API thông báo — A
- [ ] T4.3 Thử lại, DLQ, kiểm chứng — A
- [ ] T4.4 Chat và WebSocket — A

## Phase 5 — Hợp đồng và kiểm thử

- [ ] T5.1 OpenAPI mỗi service — mỗi người phần mình, A tổng hợp
- [ ] T5.2 Postman collection — B, mỗi người thư mục của mình
- [ ] T5.3 CI e2e với Newman — B
- [ ] T5.4 Kiểm tra trên máy sạch — A, chạy trên máy B hoặc C

## Phase 6 — Thí nghiệm lỗi

- [ ] T6.1 Hạ tầng đo, k6, ảnh chụp dữ liệu — B
- [ ] T6.2 E1, E2, E3 (bắt buộc) — B
- [ ] T6.3 E4–E10 — C, B

## Phase 7 — Nộp bài

- [ ] T7.1 Báo cáo cuối kỳ — A tổng hợp, mỗi người chương của mình
- [ ] T7.2 Slide — A
- [ ] T7.3 Tập demo, video dự phòng, vấn đáp — cả nhóm
- [ ] T7.4 Rà soát cuối — A

## Ghi chú và vướng mắc

| Ngày | Người | Nội dung | Cách xử lý |
|---|---|---|---|
| | | | |
