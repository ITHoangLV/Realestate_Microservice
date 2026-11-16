# Playbook TDD — Hướng dẫn

> Áp dụng khi `.claude/playbooks.json → playbooks.tdd.enabled = true`. Cách Claude thực hiện: skill `tdd-workflow`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 1. Vì sao

- Test viết trước là đặc tả sống của từng `BR-xx`, từng nhánh saga, từng bất biến ví.
- Code dễ test thì ít phụ thuộc cứng: client, repository mock qua DI của NestJS.
- Lỗi lộ ra ở bước nhỏ, không dồn tới lúc ghép năm service.

## 2. Quy tắc

- Viết test **trước** code implementation.
- Lặp Red → Green → Refactor cho từng hành vi nhỏ; một test một lần.
- Mỗi commit chạm logic nghiệp vụ có test đi kèm.

## 3. Chu trình

| Pha | Làm | Phải thấy |
|---|---|---|
| RED | Viết 1 test cho 1 hành vi, chạy `pnpm --filter @realestate/<service> test -- <tên>` | FAIL vì thiếu code, không phải lỗi import, cú pháp. Pass ngay → test sai hoặc hành vi đã có |
| GREEN | Code tối thiểu cho test pass | PASS |
| REFACTOR | Khử trùng lặp, đặt tên rõ, không thêm hành vi | Toàn bộ test vẫn PASS |

## 4. Quy ước file test (hook dựa vào đây)

| Code | Test |
|---|---|
| `services/<s>/src/**/foo.service.ts` | `foo.service.spec.ts` cùng thư mục (`coding-convention.md §8`) |
| | Hoặc `__tests__/foo.service.spec.ts`, hoặc `services/<s>/test/` (`*.e2e-spec.ts`, `*.infra-spec.ts`) |

Hook **không đòi** test riêng cho: `*.module.ts`, `*.dto.ts`, `*.entity.ts`, `*.controller.ts` (kiểm bằng e2e, Postman), `*.errors.ts`, `main.ts`, `index.ts`, `app.setup.ts`, `swagger.setup.ts`, `data-source.ts`, `config/`, `migrations/`, `scripts/`, `seed/`.

## 5. Ưu tiên test

Theo "Test bắt buộc" của từng `Component_Class_Design.md`:

1. `BR-xx` của service — nhánh đúng và nhánh sai.
2. Saga đặt cọc: mỗi dòng bảng lỗi ở `RE.DEPOSIT_SAGA/Processing_Flow.md §3`, mock `ListingClient`, `PaymentClient`.
3. Hàm thuần: `deposit-state.ts`, `refund-amount.ts`, `message-templates.ts`.
4. Đồng thời (giữ chỗ, webhook trùng, hoàn đua giải ngân, chi trùng): `*.infra-spec.ts` với Postgres thật.
5. Hợp đồng sự kiện: `expectEventMatchesContract`.

## 6. Khi nào không bắt buộc

- Chỉ sửa cấu hình, tài liệu, Dockerfile, compose, migration, `contracts/`.
- Thử nghiệm dùng rồi bỏ, không merge.
- Phần copy nguyên từ `_template-nest` (đã có test của template).

## 7. Mức enforcement

`monitor-only` (chỉ ghi log `.claude/logs/playbook-tdd.jsonl`) → `warn` (nhắc Claude, không chặn, **đang dùng**) → `block` (chặn, buộc viết test). Đổi ở `.claude/playbooks.json`.
