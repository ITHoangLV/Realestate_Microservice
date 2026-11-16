# Tiến độ

> Cập nhật sau mỗi lần merge. Điền ngày hoàn thành thật.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-16 |

**Bảo vệ:** 2026-12-18 (M5) · **Mốc mới** (dời 2026-11-16): M0 11-20, M1 11-27, M2 12-04, M3 12-09, M4 12-11 (`README.md` — Lịch và mốc) · **Hạn nộp báo cáo:** 2026-12-11 (M4, chốt 2026-11-16) · **Đề tài:** Thiết kế hệ thống cho thuê nhà, căn hộ, chung cư Real-estate theo kiến trúc microservices · **Nhóm:** 5 · **Số thành viên:** 3

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
- [x] T0.2 Duyệt kiến trúc và ADR — A, B, C đọc phần của mình (2026-11-16)
- [x] T0.3 Hợp đồng API nội bộ v2 — B (listing), C (rental, payment), A (identity) (2026-11-16)
- [x] T0.4 Hợp đồng sự kiện v2 và topology — A, C (2026-11-16)

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
- [ ] T3.5 Vòng đời đơn: bàn giao, nhận phòng, tự giải ngân — B (chuyển từ C 2026-11-16)
- [ ] T3.6 Payout: hoàn, rút, chứng từ, ví — C

## Phase 4 — Bất đồng bộ, notification, chat

- [ ] T4.1 Binding queue, schema sự kiện trong code — C (chuyển từ A 2026-11-16)
- [ ] T4.2 notification: consumer, API thông báo — A
- [ ] T4.3 Thử lại, DLQ, kiểm chứng — A
- [ ] T4.4 Chat và WebSocket — A

## Phase 5 — Hợp đồng và kiểm thử

- [ ] T5.1 OpenAPI mỗi service — mỗi người phần mình, A tổng hợp
- [ ] T5.2 Postman collection — B, mỗi người thư mục của mình
- [ ] T5.3 CI e2e với Newman — B
- [ ] T5.4 Kiểm tra trên máy sạch — B, chạy trên máy C (chuyển từ A 2026-11-16)

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
| 2026-11-16 | A | T0.3, T0.4 nhóm duyệt chéo xong. `pnpm contracts:check`: 18 event, 4 spec (identity, listing, payment, rental internal), tất cả OK. Đã xóa 7 schema luồng cũ; sự kiện lịch xem sửa theo quyết định 2026-11-16 | Tick |
| 2026-11-16 | A | M0 (2026-11-13) trễ: T0.2, T1.1–T1.3 chưa xong | Ưu tiên T1.2 gateway (A), T1.1 CI (B) trước Phase 2 |
| 2026-11-16 | A | T0.2: Accept 12 ADR; thiết kế v1.0 thành baseline (sửa `design/` từ nay kèm `CHANGELOG.md`). Chốt C7, C17, C18, B16, chi tiết T2.1 (`van-de-can-quyet-dinh.md` mục D). T1.2 hết chặn | Tick T0.2; B, C vẫn đọc ADR phần mình |
| 2026-11-16 | A | Chốt đợt 2: C1, C2, C3–C6, C8, C10, C11, C13, C14, C15, C16 và mọi `[cần xác nhận]` còn lại của thiết kế (trừ `PAYMENT_CALL_TIMEOUT_MS` chờ đo). 11 thiết kế lên v1.1 kèm `CHANGELOG.md`. Báo cáo nộp M4 | B, C xem lại phần mình khi nhận task |
| 2026-11-16 | A | Ước thời lượng: ~240 giờ còn lại, vượt năng lực 12,75 giờ/người/tuần. Dời M0–M3, chia lại T3.5 → B, T4.1 → C, T5.4 → B; kế hoạch tính 16 giờ hiệu dụng/người/tuần | B, C xác nhận mức giờ; không được thì cắt theo `README.md §6` |
