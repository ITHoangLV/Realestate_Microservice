# Thiết kế kỹ thuật

> Tài liệu thiết kế viết **trước** khi code, là đầu vào cho procedure `developer`. Duyệt qua PR.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## Quy trình

```
business-spec/RE.BUSINESS_RULES.md
   → solution-architect   → design/<CỤM>/<MÃ>/ (3 tài liệu)
   → architect-reviewer   → duyệt, chốt [cần xác nhận]
   → implementation/PHASE-x → developer code bám thiết kế → code-reviewer
```

## Cấu trúc

```
design/
├─ _template/
├─ SHARED/        RE.SERVICE_TEMPLATE · RE.GATEWAY · RE.MESSAGING
├─ IDENTITY/      RE.IDENTITY
├─ LISTING/       RE.LISTING
├─ RENTAL/        RE.VIEWING · RE.DEPOSIT_SAGA · RE.DEPOSIT_LIFECYCLE
├─ PAYMENT/       RE.PAYMENT · RE.PAYOUT
└─ NOTIFICATION/  RE.NOTIFICATION · RE.CHAT
```

| Chức năng | Service | Người phụ trách |
|---|---|---|
| `RE.SERVICE_TEMPLATE` | `_template-nest` | A |
| `RE.GATEWAY` | api-gateway | A |
| `RE.MESSAGING` | mọi service | A |
| `RE.IDENTITY` | identity | A |
| `RE.LISTING` | listing | B |
| `RE.VIEWING`, `RE.DEPOSIT_SAGA`, `RE.DEPOSIT_LIFECYCLE` | rental | C |
| `RE.PAYMENT`, `RE.PAYOUT` | payment | C |
| `RE.NOTIFICATION`, `RE.CHAT` | notification | A |

Tiến độ code từng chức năng: `implementation/progress.md`.

## Mỗi chức năng

| File | Nội dung |
|---|---|
| `API_Spec.md` | Endpoint, thứ tự kiểm tra, mã lỗi, sự kiện, biến môi trường, DDL |
| `Component_Class_Design.md` | Thư mục, class, entity, client, job, test bắt buộc |
| `Processing_Flow.md` | Luồng tuần tự, transaction, đồng thời, nhánh lỗi, số truy vấn |
| `CHANGELOG.md` | Chỉ tạo từ lần sửa đầu tiên sau baseline v1.0 (baseline tính từ khi T0.1, T0.2 duyệt xong) |

Thêm chức năng: copy 3 file từ `_template/`, thêm cụm vào `project-knowledge/CLAUDE.md §2.3`. Chuẩn viết: `standards/design-standards.md`.

## `[cần xác nhận]`

Bản v1.0 viết khi phần lớn service chưa có code: đường dẫn, mã lỗi mới, tên trạng thái Báo cáo v2 chưa chốt đều là **đề xuất** và gắn `[cần xác nhận]`. Danh sách tổng: `implementation/van-de-can-quyet-dinh.md`. Người phụ trách service chốt trước khi code phần đó; chốt xong thì sửa thiết kế (bản sửa đầu tiên → tạo `CHANGELOG.md`).

## Vòng đời

1. `solution-architect` viết thiết kế, kèm `[cần xác nhận]` và ADR `Proposed` nếu có quyết định lớn.
2. `architect-reviewer` soi theo `standards/design-standards.md §3.1`; người phụ trách service liên quan duyệt qua PR.
3. Người phụ trách chốt các `[cần xác nhận]` chặn code.
4. `developer` bám thiết kế, không tự thiết kế lại. Lệch → sửa tài liệu trước.
5. Sau baseline, mỗi lần sửa thêm một mục `CHANGELOG.md` và tăng phiên bản header 3 tài liệu.

## Thứ tự đọc khi mới vào

Đọc `guides/RE_Design_Reading_Guide.md` trước, rồi:
`SHARED/RE.SERVICE_TEMPLATE` → `SHARED/RE.MESSAGING` → thiết kế service mình phụ trách → `RENTAL/RE.DEPOSIT_SAGA`.
