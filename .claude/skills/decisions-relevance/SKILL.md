---
name: decisions-relevance
description: >
  Rà kho ADR của Real-estate (project-knowledge/decisions/) để bắt quyết định lỗi thời, mồ côi, mâu
  thuẫn, treo Proposed. Kích hoạt khi "rà ADR", "soi quyết định kiến trúc", "ADR nào còn hiệu lực",
  khi architect-reviewer gọi, hoặc trước/sau khi sửa architecture.md. Chỉ phát hiện và gợi ý.
---

# decisions-relevance

Rà ADR đã có. Sinh ADR mới là việc của `solution-architect`.

## Phạm vi

`project-knowledge/decisions/NNNN-*.md`. Bỏ qua `_template.md`, `README.md`.

## Bước 1 — Thu thập

- Mỗi ADR: tiêu đề, trạng thái, ngày, liên quan, "Superseded by".
- Bảng danh sách trong `decisions/README.md`.
- Chỗ trỏ tới ADR trong `architecture.md`, `design/**`, `standards/**`.

## Bước 2 — Soi

1. **Lỗi thời còn được dùng:** ADR `Superseded` / `Deprecated` vẫn được tài liệu khác trỏ như căn cứ hiện hành thay vì ADR thay thế nó.
2. **Mồ côi, link gãy:** "Superseded by" hoặc "Liên quan" trỏ ADR không tồn tại; ADR thay thế không trỏ ngược.
3. **Mâu thuẫn:** hai ADR còn hiệu lực cùng chủ đề nhưng quyết định trái nhau, không cái nào ghi bị thay.
4. **Thay một phần chưa ghi rõ:** ADR bị ADR mới thay một phần nhưng bảng `README.md` không ghi phần nào.
5. **Treo `Proposed`:** nhắc chốt trước khi code bám theo.
6. **Lệch bảng:** trạng thái trong file khác trạng thái ở bảng `README.md`; trùng số `NNNN`.
7. **Sửa ADR đã `Accepted`** thay vì tạo ADR mới → vi phạm vòng đời.
8. **Bản cũ ở `docs/adr/`:** tài liệu còn trỏ `docs/adr/ADR-007-*`, `ADR-008-*` thay vì `decisions/0007`, `0008` (`decisions/README.md` — Đánh số lại).

## Bước 3 — Báo cáo

```
## Kết quả rà ADR

### Cần xử lý
- [ADR-NNNN, vị trí] mô tả + gợi ý

### Cần theo dõi
- [ADR-NNNN] mô tả + gợi ý

### Nhất quán
- ADR đang có hiệu lực
```

## Ràng buộc

- KHÔNG tự sửa ADR, `architecture.md`, bảng `README.md`; KHÔNG tạo ADR mới.
- Mỗi phát hiện trỏ cụ thể file + mục. Không có vấn đề thì nói không có, không bịa.
