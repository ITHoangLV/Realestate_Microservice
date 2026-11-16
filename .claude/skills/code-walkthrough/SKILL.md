---
name: code-walkthrough
description: >
  Viết hoặc cập nhật file giải thích code project-knowledge/guides/RE_<Thành_phần>_Code_Walkthrough.md
  sau khi một task có code đã PASS test và lệnh kiểm chứng, trước code-review và commit. Kích hoạt ở
  developer Bước 4, hoặc khi nghe "viết walkthrough", "giải thích code", "file giải thích", "chuẩn bị vấn đáp".
---

# code-walkthrough

**MUST** chạy khi task có code đã PASS test và lệnh "Kiểm chứng", **trước** `code-review` và commit (`CLAUDE.md` gốc §8).
**NEVER** viết khi test chưa xanh. **NEVER** tạo file mới cho thành phần đã có file giải thích — cập nhật file đó.

Khuôn: `project-knowledge/guides/_template_Code_Walkthrough.md`. Mẫu đã có: `guides/RE_Contracts_Code_Walkthrough.md`.

## Bước 0 — Điều kiện

- `.claude/state/<dev-id>/current-task.md` có output test và lệnh kiểm chứng PASS trong phiên. Chưa có → dừng, quay lại cổng test của `developer`.
- Task không có code (chỉ tài liệu, cấu hình vặt một file) → bỏ qua, ghi lý do vào "Blockers / Ghi chú".

## Bước 1 — Chọn file

- Tên: `guides/RE_<Thành_phần>_Code_Walkthrough.md`, `<Thành_phần>` PascalCase theo service hoặc mã chức năng (`RE_Gateway_…`, `RE_Identity_…`, `RE_Deposit_Saga_…`).
- Tìm trong `project-knowledge/CLAUDE.md §2.5` và `guides/` xem đã có chưa. Có → cập nhật, đổi ngày, thêm commit/PR mới vào header.

## Bước 2 — Thu thập (từ code thật, không từ trí nhớ)

- Danh sách file đã tạo/sửa: `git diff --name-only develop...HEAD` (chưa có nhánh → mục "Kế hoạch chi tiết" của `current-task.md`).
- Mở từng file. Ghi **mọi** file thuộc thành phần, kể cả cấu hình, migration, test, Dockerfile, compose, `contracts/`.
- Quyết định đã ghi: `decisions-log.md` của dev, mục "Tái sử dụng" của `current-task.md`, ADR, `van-de-can-quyet-dinh.md`.

## Bước 3 — Viết theo khuôn

| Mục khuôn | Yêu cầu |
|---|---|
| Header | Chủ sở hữu / ngày, thành phần, task `T<x.y>`, thiết kế `design/<CỤM>/<MÃ>/`, commit / PR |
| 1. Luồng chung | 2–5 câu + `sequenceDiagram` khớp `Processing_Flow.md` của thiết kế |
| 2. Cây thư mục | Khớp cây thật, không chép cây trong thiết kế |
| 3. Chức năng từng file | Mỗi file một dòng: làm gì, gọi tới / được gọi bởi, ghi chú |
| 4. Quyết định không hiển nhiên | Lý do, phương án đã loại, căn cứ (`BR-xx`, ADR, §thiết kế) |
| 5. Câu hỏi vấn đáp | ≥ 5 câu giảng viên dễ hỏi về phần này (đồng thời, lỗi phụ thuộc, vì sao không làm cách khác) |
| 6. Hạn chế đã biết | Kèm hướng xử lý; khoản nào là nợ kỹ thuật → cũng ghi `tech-debt.md` |

- Không chép nguyên thiết kế; trỏ tới `§` của thiết kế khi cần.
- Không đưa secret, giá trị `.env` thật.
- Code lệch thiết kế → **dừng**: thiết kế phải được sửa trước (`solution-architect` + `CHANGELOG.md`), walkthrough mô tả code sau khi đã khớp.

## Bước 4 — Đăng ký

- File mới → thêm **một dòng** vào bảng `project-knowledge/CLAUDE.md §2.5`: đường dẫn + "đọc khi" ngắn. Không `@`.
- Tick bước tương ứng trong `current-task.md`, gọi `progress-tracker`.
- Nhắc: lưu file lên Project "Realestate Microservice" cùng đường dẫn nếu nhóm đang đồng bộ `project-knowledge/` lên đó.

## Bước 5 — Báo ngắn

"Đã viết/cập nhật `guides/RE_<…>_Code_Walkthrough.md` (N file, M câu vấn đáp). Bước kế: `code-review`."
