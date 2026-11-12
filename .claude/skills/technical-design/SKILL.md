---
name: technical-design
description: >
  Sinh hoặc sửa tài liệu thiết kế kỹ thuật Real-estate TRƯỚC khi code. Kích hoạt khi nghe "thiết kế [X]",
  "đặc tả API cho [X]", "design luồng/class", "từ spec làm thiết kế", "sửa thiết kế [X]". Ra bộ 3
  tài liệu trong project-knowledge/design/<CỤM>/<MÃ>/ theo design/_template/ và
  standards/design-standards.md.
---

# technical-design

Skill này là checklist; người thực hiện là procedure `solution-architect` (`.claude/agents/solution-architect.md`).
Khác `task-state-init`: skill này ra **tài liệu**, chưa ra code.

## Bước 1 — Đọc context

- `business-spec/RE.BUSINESS_RULES.md` hoặc spec user đưa; thứ tự ưu tiên nguồn ở `business-spec/README.md` (Báo cáo v2 là chuẩn).
- `architecture.md`, `project-structure.md`, `domain-glossary.md`.
- `standards/design-standards.md`, `api-convention.md`, `coding-convention.md`, `reliability-standard.md`, `non-functional-standards.md`.
- Thiết kế liên quan trong `design/` (`design-standards.md §8`), hợp đồng `contracts/`, ADR liên quan.

## Bước 2 — Phạm vi

- Chốt mã `RE.<TÊN>`, cụm (`SHARED`, `IDENTITY`, `LISTING`, `RENTAL`, `PAYMENT`, `NOTIFICATION`), service sở hữu, người làm (A/B/C), danh sách thao tác.
- Mới: copy 3 file từ `design/_template/` (không copy `CHANGELOG.md`). Sửa: giữ thư mục, thêm mục `CHANGELOG.md`.

## Bước 3 — Viết

1. `API_Spec.md` → 2. `Component_Class_Design.md` → 3. `Processing_Flow.md`. Giữ tên trùng khớp.

## Bước 4 — Tự kiểm trước khi trình

- [ ] **Cổng tuân thủ** `design-standards.md §3.1` trên từng endpoint, trường, mã lỗi — 0 điểm lệch.
- [ ] Header đủ (mã, service, `BR-xx`, CSDL, chủ sở hữu / ngày cập nhật / phiên bản).
- [ ] Endpoint, DTO, mã lỗi, tên class, sự kiện trùng khớp giữa 3 file.
- [ ] Có `sequenceDiagram` cho luồng, `classDiagram` cho lớp.
- [ ] Thao tác ghi: thứ tự kiểm tra, transaction, đồng thời, gọi lại, khi phụ thuộc lỗi.
- [ ] Số truy vấn dự kiến trong ngưỡng hoặc đã ghi lý do vượt.
- [ ] Lời gọi liên service có trong bảng retry của `reliability-standard.md`.
- [ ] API nội bộ, sự kiện mới hoặc đổi đã ghi file `contracts/` cần cập nhật.
- [ ] Cấu trúc thư mục khớp `project-structure.md` (đổi thì cập nhật cùng lúc).
- [ ] Đã gom `[cần xác nhận]`.
- [ ] Súc tích (§7), nhất quán chéo (§8).
- [ ] Sửa sau baseline: có mục `CHANGELOG.md`, phiên bản khớp header (§9).
- [ ] Chức năng mới: đã thêm cụm vào `project-knowledge/CLAUDE.md §2.3`.

Gợi ý chạy `architect-reviewer` sau khi xong.

## Ràng buộc

- KHÔNG đoán cột, mã trạng thái, hợp đồng service khác → `[cần xác nhận]`.
- KHÔNG để thiết kế chỉ trong chat.
