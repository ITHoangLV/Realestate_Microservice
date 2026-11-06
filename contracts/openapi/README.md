# Hợp đồng REST (OpenAPI)

## Hai loại API, hai cách quản lý

| Loại                       | Ai gọi                  | Nguồn sự thật                                        | Ở đâu                                                              |
| -------------------------- | ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| **Nội bộ** (`/internal/*`) | Service khác            | **File viết tay trong thư mục này**, viết trước code | `contracts/openapi/<service>-internal.v1.yaml`                     |
| **Public** (`/api/v1/*`)   | Client, qua api-gateway | Code của service (decorator Swagger)                 | `services/<service>/openapi.json`, sinh bằng `pnpm openapi:export` |

API nội bộ được viết trước vì người gọi và người viết là **hai người khác nhau**. Ví dụ B viết listing,
C viết rental gọi sang listing. Khi chốt file ở đây, hai người code song song được. C mock theo
`example` trong spec, không phải chờ B.

API public chỉ có một người làm cả hai đầu (service và màn hình demo), nên để code tự sinh, tránh phải
sửa hai nơi.

## API nội bộ hiện có

| File                                                   | Endpoint                          | Người viết | Người gọi |
| ------------------------------------------------------ | --------------------------------- | ---------- | --------- |
| [`listing-internal.v1.yaml`](listing-internal.v1.yaml) | `GET /internal/listings/{id}`     | B          | rental    |
| [`rental-internal.v1.yaml`](rental-internal.v1.yaml)   | `GET /internal/reservations/{id}` | C          | payment   |

## Quy ước

- OpenAPI **3.1** (schema là JSON Schema 2020-12, cùng chuẩn với `contracts/events`).
- Mỗi file tự chứa đủ, chỉ dùng `$ref` trong cùng file (`#/components/...`).
- Response theo khung chung của template: thành công `{ data, meta }`, lỗi `{ error: { code, message, details? }, meta }` (`meta` gồm `correlationId`, `timestamp`).
  Mã lỗi riêng có prefix tên service: `LISTING_NOT_FOUND`, `RENTAL_RESERVATION_NOT_FOUND`.
- Mỗi response JSON phải có `example`. `pnpm contracts:check` kiểm tra example khớp schema.
- Tiền là số nguyên VND, thời gian ISO 8601 UTC, ID là UUID (giống `contracts/events`).
- Controller nội bộ dùng `@ApiExcludeController()` (như `example-internal.controller.ts` của template),
  nên **không** xuất hiện trong `openapi.json` public. File ở đây là nơi duy nhất mô tả chúng.

## Đổi API nội bộ

- Thêm trường vào response: sửa file và báo người gọi. Người gọi phải bỏ qua trường lạ.
- Xóa hoặc đổi trường, đổi mã lỗi: tạo endpoint mới hoặc `v2`, người gọi chuyển xong mới xóa bản cũ.
- PR sửa file ở đây cần người phụ trách service **gọi** review, và cập nhật
  `docs/architecture/service-boundaries.md` mục 4 nếu thêm hoặc bớt endpoint.
