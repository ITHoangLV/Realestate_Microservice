---
task: T2.5 identity: xác minh OTP, quên mật khẩu, Google, khóa tài khoản, số điện thoại
updated: 2026-11-20 17:40
percent: 100
---

## Đang làm
- Bước hiện tại: xong; commit, push, mở PR (A merge, quyết định 2026-11-21)
- Tóm tắt: review lại phát hiện hai lỗi `500` (`PATCH /users/me` `fullName: null`; Google với tài khoản đã liên kết `sub` khác). Đã sửa thiết kế v2.4 trước, test RED rồi GREEN ở unit; infra-spec 21a, 23a đã viết nhưng chưa chạy

## Đã xong (phiên này)
- Thiết kế `RE.IDENTITY` v2.3, CHANGELOG; `van-de-can-quyet-dinh.md` C21
- Cấu hình, migration, entity, `UserDto`, seed #16
- MailService, OTP, quên/đặt lại mật khẩu, Google, khóa/mở khóa, PATCH me
- identity unit 354, e2e 97, infra 200; gateway unit 239 + e2e 137; template unit 101 + e2e 111 PASS; lint, format, build, contracts sạch
- Smoke qua gateway 8080 + Mailpit đạt

## Còn lại
- A merge PR T2.5; sau merge tick `implementation/progress.md`
- Postgres trên máy A: lần `test:infra` 2026-11-20 17:48 bị `Connection terminated unexpectedly`, Postgres từng tắt không sạch lúc 17:02; chưa tái hiện nên chưa kết luận (xem `current-task.md` R3b)
- Chưa làm, chờ A quyết: `refresh` kiểm `status = LOCKED` (phòng khi bước thu hồi của khóa lỗi 503)
- A xem `git diff` → commit, push, PR vào `develop` (PR chạm `_template-nest` nên A duyệt)
- Sau merge: tick `implementation/progress.md` T2.5

## Blockers
_không có_
