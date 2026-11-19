# Quy ước API

> Quy ước chung cho mọi API. `API_Spec.md` của từng chức năng chỉ ghi phần đặc thù, không chép lại file này.
> Nguồn: Báo cáo v2 §3.6–3.7, `services/_template-nest/README.md §2`, `contracts/openapi/README.md`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-19 |

## 1. Hai loại API

| | API công khai | API nội bộ |
|---|---|---|
| Đường dẫn | `/api/v1/<resources>` | `/internal/<resources>` |
| Đi qua gateway | Có, cổng 8080 | Không. Gateway trả `404` cho `/internal/*` từ ngoài |
| Ai gọi | Client web, Postman, payOS (webhook) | Service khác |
| Xác thực | `Authorization: Bearer <accessToken>`; gateway và service đều kiểm JWT RS256 | Tạm tin mạng Docker (`@Public()`), xem `security-policy.md §6` |
| Nguồn sự thật hợp đồng | Code (decorator Swagger) → `services/<s>/openapi.json` | File viết tay `contracts/openapi/<service>-internal.v1.yaml`, viết **trước** code |
| Trong Swagger | Có | Không (`@ApiExcludeController()`) |

## 2. Đặt tên

- Danh từ số nhiều, nhiều từ dùng kebab-case: `/api/v1/listings`, `/internal/payment-orders`.
- Không quá 3 lớp resource.
- Tên trường JSON dùng **camelCase**: `accessToken`, `heldUntil`, `amountVnd`.
- Thao tác không phải CRUD đặt dạng hành động sau resource: `POST /api/v1/deposits/:id/confirm-move-in`.
- Cột, bảng trong DB dùng snake_case (`coding-convention.md §3`).

## 3. Status code

| Mã | Khi nào |
|---|---|
| `200` | Đọc, sửa thành công |
| `201` | Tạo tài nguyên |
| `204` | Thành công, không có body (đăng xuất) |
| `400` | `VALIDATION_FAILED`: đầu vào sai, có `details` theo từng trường, kể cả tham số đường dẫn sai kiểu (`id` không phải UUID → message "<tên> phải là UUID", dùng `createUuidParamPipe`, C19). `BAD_REQUEST` chỉ cho body không đọc được (JSON sai cú pháp) và header sai dạng |
| `401` | Thiếu, sai, hết hạn token; sai thông tin đăng nhập |
| `403` | Không đủ vai trò, hoặc không phải chủ tài nguyên |
| `404` | Không có tài nguyên |
| `409` | Xung đột trạng thái: BĐS đã có người giữ, chuyển trạng thái sai, quá hạn hoàn, email trùng, `Idempotency-Key` đang xử lý |
| `422` | `IDEMPOTENCY_KEY_REUSED`: cùng khóa, nội dung khác |
| `429` | Vượt giới hạn tốc độ tại gateway |
| `500` | Lỗi không lường trước, không lộ chi tiết |
| `503` | `UPSTREAM_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`: phụ thuộc không sẵn sàng |
| `504` | `UPSTREAM_TIMEOUT`, `DEPENDENCY_TIMEOUT`: chờ quá hạn |

**Nguyên tắc:** `4xx` là lỗi của bên gọi, không retry. `503/504` là lỗi hạ tầng, gọi lại sau có thể thành công.

Webhook payOS là ngoại lệ: luôn trả `200` khi đã lưu webhook, kể cả webhook trùng hoặc sai số tiền (`design/PAYMENT/RE.PAYMENT/API_Spec.md`).

## 4. Body thành công

`ResponseEnvelopeInterceptor` bọc mọi kết quả; controller trả dữ liệu thuần.

```jsonc
// 200/201
{ "data": { "id": "…" }, "meta": { "correlationId": "abc-123", "timestamp": "2026-11-06T10:00:00.000Z" } }

// danh sách: handler trả new Paginated(items, page, pageSize, total)
{ "data": [ … ], "meta": { "correlationId": "…", "timestamp": "…", "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 } }
```

- Không bọc: `/health` (`@RawResponse()`), route `204`, `StreamableFile`.
- Phân trang: query `page`, `pageSize`. Mặc định 20, tối đa 50 cho mọi API (chốt 2026-11-16), luôn sắp xếp tường minh.

## 5. Body lỗi

```json
{
  "error": { "code": "LISTING_NOT_AVAILABLE", "message": "Bất động sản đang được người khác giữ chỗ", "details": {} },
  "meta": { "correlationId": "5e0c7f3a-…", "timestamp": "2026-11-06T08:00:00Z" }
}
```

Ném lỗi: `throw new AppException(code, message, status, details?)`. `AllExceptionsFilter` đưa mọi lỗi về dạng này, giấu stack ở `5xx`, đổi lỗi kết nối DB/Redis thành `503/504`.

## 6. Mã lỗi

Định dạng `<MIỀN>_<LÝ_DO>`, IN_HOA_GẠCH_DƯỚI. **Không đổi tên** sau khi client đã dùng. Catalog đặt ở `API_Spec.md` của từng chức năng; hằng số đặt trong `src/<miền>/errors/<miền>.errors.ts`.

| Tiền tố | Service |
|---|---|
| (không tiền tố) | Mã dùng chung của template |
| `GATEWAY_` | api-gateway |
| `IDENTITY_` | identity |
| `LISTING_` | listing |
| `RENTAL_` | rental (lịch xem, đơn đặt cọc) |
| `PAYMENT_` | payment (payment order, webhook, hoàn, rút, ví) |
| `NOTIFICATION_` | notification (thông báo, hội thoại) |

Mã dùng chung (`src/common/errors/error-codes.ts`):

| Mã | HTTP |
|---|---|
| `BAD_REQUEST`, `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REQUIRED` | 400 |
| `UNAUTHORIZED`, `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED` | 401 |
| `FORBIDDEN`, `FORBIDDEN_ROLE` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT`, `IDEMPOTENCY_IN_PROGRESS` | 409 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `UNPROCESSABLE_ENTITY`, `IDEMPOTENCY_KEY_REUSED` | 422 |
| `TOO_MANY_REQUESTS` | 429 |
| `INTERNAL_ERROR` | 500 |
| `SERVICE_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`, `AUTH_NOT_CONFIGURED`, `IDEMPOTENCY_UNAVAILABLE` | 503 |
| `DEPENDENCY_TIMEOUT`, `UPSTREAM_TIMEOUT` | 504 |

Thêm mã: thêm vào catalog trong `API_Spec.md` và hằng số trong file `errors` của module, cùng một commit.

## 7. Header

| Header | Hướng | Ý nghĩa |
|---|---|---|
| `X-Request-ID` | Hai chiều | Mã truy vết. Gateway sinh nếu thiếu; service tự sinh UUID nếu vẫn thiếu; `InternalHttpService` tự chuyển tiếp |
| `Authorization: Bearer` | Client → gateway → service | Access token RS256 15 phút |
| `Idempotency-Key` | Client → API ghi quan trọng | Đặt cọc, yêu cầu hoàn, tạo lệnh rút, quản trị viên xác nhận chuyển khoản. Lưu 24 giờ (`IDEMPOTENCY_TTL_SECONDS`) |

Hành vi `Idempotency-Key`: cùng khóa + cùng nội dung → trả kết quả cũ; cùng khóa + khác nội dung → `422 IDEMPOTENCY_KEY_REUSED`; lần đầu chưa xong → `409 IDEMPOTENCY_IN_PROGRESS`.

## 8. Dữ liệu

| Kiểu | Quy ước |
|---|---|
| Id | UUID, sinh bằng `gen_random_uuid()` |
| Tiền | Số nguyên VND; cột `bigint`, DTO `@IsInt()`. Không float, không decimal |
| Thời gian | ISO 8601 UTC; cột `timestamptz` |
| Trạng thái | Chuỗi IN_HOA trong `domain-glossary.md` |

## 9. Tài liệu hóa

- Công khai: `pnpm --filter @realestate/<service> openapi:export` → `services/<service>/openapi.json`.
- Nội bộ: `contracts/openapi/<service>-internal.v1.yaml`, OpenAPI 3.1, mỗi response có `example`; `pnpm contracts:check` kiểm example khớp schema.
- Đổi API nội bộ: thêm trường thì sửa file và báo bên gọi (bên gọi bỏ qua trường lạ); xóa/đổi trường hoặc mã lỗi thì tạo endpoint mới hoặc `v2`. PR cần người phụ trách service gọi review.
- Chi tiết: `guides/RE_OpenAPI_Postman_Guide.md`.
