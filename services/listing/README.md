# @realestate/listing

Listing-service: sản phẩm của chủ trọ (thêm, sửa, ẩn, xóa mềm), duyệt của quản trị viên, ảnh tin đăng, tìm kiếm PostGIS, giữ chỗ cho rental. Cổng **3002**, DB `listing_db` (PostGIS), bucket S3 `listing-images`.
Dựng từ `services/_template-nest` nên dùng chung log JSON, correlation ID, định dạng lỗi, health check (đọc README của template cho các phần đó). Sản phẩm và tin đăng là một bản ghi (ADR-0010). Listing **không** phát, không nghe sự kiện, không gọi service khác.

Thiết kế: `project-knowledge/design/LISTING/RE.LISTING/`. Giải thích code: `project-knowledge/guides/RE_Listing_Code_Walkthrough.md`.

## Chức năng (T2.2, T2.3)

| Route (`/api/v1`)                             | Quyền     | Mô tả                                                                                                                            |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /listings`                               | công khai | Tìm kiếm (T2.3): chỉ tin đã duyệt, chưa xóa, không `HIDDEN`; lọc giá, diện tích, quận, tiện ích, còn trống; bán kính; phân trang |
| `POST /listings`                              | LANDLORD  | Thêm sản phẩm: `PENDING_REVIEW`, `AVAILABLE`                                                                                     |
| `GET /listings/mine`                          | LANDLORD  | Sản phẩm của tôi (phân trang)                                                                                                    |
| `GET /listings/:id`                           | công khai | Chi tiết tin đã duyệt, chưa xóa (tin `HIDDEN` vẫn xem được)                                                                      |
| `PATCH /listings/:id`                         | chủ tin   | Sửa; sửa nội dung hiển thị thì về `PENDING_REVIEW`                                                                               |
| `POST /listings/:id/hide`, `/unhide`          | chủ tin   | `AVAILABLE ↔ HIDDEN`                                                                                                             |
| `DELETE /listings/:id`                        | chủ tin   | Xóa mềm; `409` khi tin đang `HELD`/`DEPOSITED`                                                                                   |
| `POST /listings/:id/images/upload-url`        | chủ tin   | Presigned PUT, service đặt key                                                                                                   |
| `POST /listings/:id/images`                   | chủ tin   | Xác nhận ảnh (`HeadObject`: ≤ 5 MB, jpeg/png/webp, ≤ 10 ảnh); gọi lại cùng key: `200`                                            |
| `POST /admin/listings/:id/approve`, `/reject` | ADMIN     | Duyệt, từ chối (lý do bắt buộc)                                                                                                  |

### Tìm kiếm `GET /api/v1/listings`

| Query                        | Ý nghĩa                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `minPrice`, `maxPrice`       | Giá thuê (VND, số nguyên ≥ 0), gồm hai đầu; `min > max` → `400`                                               |
| `minArea`, `maxArea`         | Diện tích (m²), gồm hai đầu                                                                                   |
| `district`                   | Quận, so khớp **đúng chuỗi** (có dấu, phân biệt hoa thường)                                                   |
| `amenities`                  | CSV (`WIFI,PARKING`) hoặc lặp tham số; tin phải có **mọi** mã, mã lạ → `400`                                  |
| `available=true`             | Chỉ tin `AVAILABLE` (mặc định trả cả `HELD`, `DEPOSITED`, `RENTED`; luôn loại `HIDDEN`)                       |
| `lat` + `lng` (+ `radiusKm`) | `lat`, `lng` đi cùng nhau; có `radiusKm` (0 < r ≤ 50) thì lọc `ST_DWithin`; không có thì chỉ tính `distanceM` |
| `sort`                       | `newest` (mặc định), `price_asc`, `price_desc`, `distance` (cần `lat`, `lng`)                                 |
| `page`, `pageSize`           | 1 và 20, tối đa 50                                                                                            |

Response: `ListingSummaryDto` (có `coverImageUrl`, `distanceM` khi có `lat/lng`; không có `description`, `images[]`). Ví dụ: `GET /api/v1/listings?lat=21.0054&lng=105.8431&radiusKm=2&sort=distance`.

### API nội bộ `/internal/listings/*` (chỉ rental gọi, gateway trả `404` từ ngoài)

Không có prefix `/api/v1`, không có trong Swagger. Hợp đồng: `contracts/openapi/listing-internal.v1.yaml`.

| Route                               | Mô tả                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /internal/listings/:id`        | Bản chụp `{ id, ownerId, title, depositAmountVnd, status, approvalStatus }`; `404` nếu không có hoặc đã xóa                                                                          |
| `POST /internal/listings/:id/holds` | Giữ chỗ nguyên tử `{ depositId, heldUntil }`: `200`, `409 LISTING_NOT_AVAILABLE`; gọi lại cùng đơn `200`; `HELD` quá hạn thì giữ được                                                |
| `PUT /internal/listings/:id/status` | Đổi theo đơn `{ depositId, status }`: `HELD→AVAILABLE/DEPOSITED`, `DEPOSITED→RENTED/AVAILABLE`; idempotent; sai cặp hoặc tin của đơn khác `409 LISTING_INVALID_STATUS` kèm `details` |

## Chạy

```powershell
pnpm infra:up                                            # postgres, s3, ... (ở gốc repo)
pnpm --filter @realestate/listing dev                    # tự tạo .env từ .env.example
pnpm --filter @realestate/listing migration:run          # lần đầu, và khi có migration mới
pnpm --filter @realestate/listing test                   # unit
pnpm --filter @realestate/listing test:e2e               # e2e trong tiến trình (không cần hạ tầng)
pnpm --filter @realestate/listing test:infra             # Postgres + S3 thật
pnpm --filter @realestate/listing seed:listings          # 30 tin Hà Nội cho dev (T2.4), chạy lại an toàn
```

### Seed tin đăng (T2.4)

30 tin có tọa độ thật ở Hà Nội, id cố định `c0000000-0000-4000-8000-0000000000NN` (NN = `01`…`30`), chủ là 3 chủ trọ seed của identity (`a0000000-…-000000000001`…`3`). Chạy `pnpm --filter @realestate/identity seed:users` trước để chủ trọ đăng nhập được; listing không đọc `identity_db` nên seed tin vẫn chạy dù chưa nạp người dùng. Chạy lại không đổi gì và không ghi đè tin đã sửa. Cơ cấu, bảng id: `project-knowledge/guides/RE_Docker_Local_Guide.md §5`. Không có ảnh (tải qua API).

Trong Docker: `docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build listing`
(chạy migration từ host trước). Listing không publish cổng ra host, gọi qua gateway `8080`.

## Biến môi trường riêng

Bắt buộc (thiếu thì dừng khi khởi động, in rõ biến nào): `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKETS` (có `listing-images`), `JWT_PUBLIC_KEY` hoặc `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`.
Tùy chọn: `LISTING_IMAGE_MAX_BYTES` (5242880), `LISTING_IMAGE_MAX_COUNT` (10), `LISTING_IMAGE_TYPES` (`image/jpeg,image/png,image/webp`). Chi tiết ở `.env.example`.

## Lưu ý

- Chỉ tin `sub` trong JWT làm chủ sở hữu; mọi thay đổi trạng thái là một câu `UPDATE ... WHERE <trạng thái mong đợi>`.
- `listing_user` không phải superuser: migration không `CREATE EXTENSION`; PostGIS đã bật ở `infra/compose/postgres/init/01-create-databases.sh`.
- Test hạ tầng đặt `search_path` có `public` để thấy kiểu `geography`.
- Sửa phần kỹ thuật chung (`src/common`, `src/storage`, ...) thì sửa `_template-nest` trước rồi chép sang (ADR-0014).
