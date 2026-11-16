---
name: code-review
description: >
  Review nhanh code Real-estate 5 chiều (Security, Performance, Correctness, Style, Reuse) trước khi
  commit. Kích hoạt khi implement xong, hoặc khi nghe "review", "check code", "kiểm tra code".
  Review đầy đủ trước PR dùng procedure code-reviewer.
---

# code-review

**MUST** chạy khi implement xong, **trước khi commit**. **NEVER** commit mà chưa đủ 5 chiều.
Review đầy đủ trước PR → `.claude/agents/code-reviewer.md` (thêm chiều ranh giới service).

## Bước 1 — Phạm vi

File, hàm hoặc diff nào. User đã chỉ định → làm luôn. Chưa có git → hỏi danh sách file.

## Bước 2 — 5 chiều

- **Security** (`standards/security-policy.md`): secret, log lộ token / số tài khoản / chữ ký payOS, `@Public()` đặt đúng chỗ, `RolesGuard` + kiểm chủ sở hữu, mức truy cập gateway, chữ ký webhook, truy vấn có tham số.
- **Performance** (`standards/non-functional-standards.md §1`): số truy vấn trong ngưỡng (chi tiết 3 · danh sách 4 · ghi 6 · ghi có thay đổi tiền 8 — vượt chưa được xác nhận = MAJOR), N+1, gọi service trong vòng lặp, phân trang, index.
- **Correctness**: khớp thiết kế và `BR-xx`; máy trạng thái đơn; null, biên; transaction không bao lời gọi HTTP; đồng thời; idempotency; outbox cùng transaction; `Number()` cho `bigint`.
- **Style** (`standards/coding-convention.md`): tên file, class, chỗ đặt file theo `project-structure.md`, controller mỏng, env và mã lỗi được khai đủ.
- **Reuse**: có thành phần dùng chung mới mà thiếu Reuse Report? Trùng phần có sẵn của `services/_template-nest`? Logic lặp ≥ 2 chỗ?

Kèm: **không import chéo service** — vi phạm là CRITICAL.

## Bước 3 — Phân loại

| Mức | Nghĩa |
|---|---|
| CRITICAL | Phải sửa ngay: lỗ bảo mật, mất dữ liệu, sai logic, vi phạm ranh giới service |
| MAJOR | Nên sửa: hiệu năng, khó bảo trì, thiếu Reuse Report |
| MINOR | Cân nhắc: style |

## Bước 4 — Gợi ý sửa

Mỗi CRITICAL / MAJOR kèm đoạn code gợi ý cụ thể.
