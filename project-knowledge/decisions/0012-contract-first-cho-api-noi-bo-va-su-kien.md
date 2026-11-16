# ADR-0012: Contract-first cho API nội bộ và sự kiện

| | |
|---|---|
| **Trạng thái** | Accepted |
| **Ngày** | 2026-11-10 |
| **Người quyết định** | Nhóm 5 |
| **Liên quan** | `contracts/openapi/README.md`, `contracts/events/README.md`, `standards/git-workflow.md §3` |

## Bối cảnh

Người viết API nội bộ và người gọi là hai thành viên khác nhau (B viết listing, C gọi từ rental). Chờ nhau thì chậm.

## Quyết định

Chúng tôi sẽ viết **trước** khi code:

- API nội bộ: OpenAPI 3.1 viết tay `contracts/openapi/<service>-internal.v1.yaml`, mỗi response có `example`.
- Sự kiện: JSON Schema `contracts/events/<miền>.<sự kiện>.v1.schema.json` + example, `additionalProperties: false`.
- `pnpm contracts:check` kiểm example khớp schema; CI chạy lệnh này.
- API công khai sinh từ code (`openapi.json`) vì một người làm cả hai đầu.
- Thêm trường không bắt buộc: sửa v1. Xóa, đổi nghĩa, thêm trường bắt buộc: tạo v2, chạy song song tới khi bên gọi chuyển xong.

### Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Sinh hợp đồng nội bộ từ code | Bên gọi phải chờ code xong |

## Hệ quả

**Tích cực**

- Bên gọi mock theo `example`, làm song song.

**Tiêu cực / đánh đổi**

- Hợp đồng có thể lệch code nếu quên cập nhật; giảm bằng `expectEventMatchesContract` trong test.
