---
task: T2.1 identity — tài khoản nhận tiền, API nội bộ
updated: 2026-11-19
percent: 98
---

## Đang làm
- Bước hiện tại: xong Bước 8; chờ A đồng ý kế hoạch chia commit rồi commit, mở PR
- Tóm tắt: Bước 0–2 xong. Sửa theo A (2026-11-19): ROTATE_LUA `SADD` + `EXPIRE`; test và 3 tài liệu đã chỉnh. Bước 3: cipher, migration, entity đã viết.

## Đã xong (phiên này)
- ROTATE_LUA: `SADD familyId` rồi `EXPIRE` (code + test infra mới "phiên cũ" và "reuse không thêm vào set" + `Component_Class_Design §2/§3`, `CHANGELOG` v2.1, `security-policy §6`)
- `bank-account.cipher.ts` + spec (RED → GREEN, 16 test), migration `bank_accounts`, entity
- identity unit 138 PASS; build identity và eslint sạch

- Bước 3: migration up/down/up trên DB dev OK. Bước 4: route 6–7 xong (unit 170, e2e 89, infra 62 PASS)

- Bước 5: `GET /internal/users/:id/bank-account`; template thêm `createUuidParamPipe`, `expectResponseMatchesOpenApi`, `yaml@2.9.1`

- Bước 6: `GET /admin/users` + 2 index (migration); C19 ghi vào van-de-can-quyet-dinh

- Bước 7: env + compose + .env; profile apps build lại, smoke qua 8080 và mạng Docker OK (để lại user t21-* trong DB dev)

- Bước 8: walkthrough (`RE_Identity_Code_Walkthrough.md`), code-review 5 chiều (sửa 1 MINOR trùng `trim`), tech-debt #9–13, nháp PR `pr-T2.1.md`

## Còn lại
- A duyệt chia commit → commit → mở PR → CI xanh → tick `implementation/progress.md` sau merge (Bước 7: BANK_ACCOUNT_ENCRYPTION_KEY bắt buộc + compose, container re-identity hiện chạy bản cũ)

## Blockers
_không có_ (Docker đã bật 2026-11-19)
