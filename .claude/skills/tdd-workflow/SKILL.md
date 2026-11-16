---
name: tdd-workflow
description: >
  Áp chu trình TDD Red → Green → Refactor khi implement hoặc sửa logic nghiệp vụ Real-estate. Kích hoạt
  khi playbook tdd bật trong .claude/playbooks.json và nghe "implement [X]", "tạo [X]", "viết hàm [X]",
  "thêm tính năng [X]", "fix bug [X]". Phối hợp với procedure developer Bước 3.
---

# tdd-workflow

**MUST** áp dụng khi `.claude/playbooks.json → playbooks.tdd.enabled = true` và thay đổi có hành vi kiểm chứng được.
**NEVER** viết implementation trước khi có test FAIL tương ứng.

Hướng dẫn đầy đủ, khi nào được miễn: `project-knowledge/playbooks/tdd/tdd-guide.md`.

## Lặp cho từng hành vi

1. Từ thiết kế (mục "Test bắt buộc" của `Component_Class_Design.md`, các `BR-xx`) liệt kê hành vi, chọn cái nhỏ nhất.
2. **RED:** viết **1** test trong `<tên>.spec.ts` cạnh file code → `pnpm --filter @realestate/<service> test -- <tên>` → thấy FAIL vì thiếu code (không phải lỗi import, cú pháp).
3. **GREEN:** viết code tối thiểu → chạy lại → PASS.
4. **REFACTOR:** gọn lại, không thêm hành vi → chạy lại → vẫn PASS.
5. Gọi `progress-tracker` → quay lại bước 2.

## Ràng buộc

- Một test một lần, một hành vi một lần.
- Không thêm hành vi trong pha refactor.
- Test cần hạ tầng thật (đồng thời, khóa dòng, ràng buộc duy nhất, outbox, inbox, DLQ) đặt ở `test/*.infra-spec.ts`, chạy `pnpm --filter @realestate/<service> test:infra`; ghi rõ trong kế hoạch.
- Hook `tdd-guard.js` nhắc khi sửa `services/*/src/**/*.ts` mà chưa có `.spec.ts`. Làm đúng quy trình thì không gặp cảnh báo.
