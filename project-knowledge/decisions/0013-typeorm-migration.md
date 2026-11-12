# ADR-0013: Thay đổi schema chỉ qua migration TypeORM, tắt synchronize

| | |
|---|---|
| **Trạng thái** | Proposed |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `standards/coding-convention.md §5` |

## Bối cảnh

`synchronize: true` tự sửa schema theo entity, có thể xóa cột có dữ liệu và không để lại lịch sử. Năm database cần tái lập được trên máy sạch (NFR05).

## Quyết định

Chúng tôi sẽ đặt `synchronize: false`, mọi thay đổi schema qua migration trong `src/database/migrations/`, UUID bằng `gen_random_uuid()` (pgcrypto). Không sửa migration đã merge. Giữ migration `CreateMessagingTables` ở service phát/nhận sự kiện.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| `synchronize: true` | Mất dữ liệu, không tái lập được |

## Hệ quả

**Tích cực**

- Schema có lịch sử, chạy lại được trên máy sạch.

**Tiêu cực / đánh đổi**

- Phải viết migration cho mỗi thay đổi.
