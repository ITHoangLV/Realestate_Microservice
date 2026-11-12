# Hướng dẫn OpenAPI, Postman và CI

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 1. OpenAPI công khai: sinh từ code

Template đã có `src/scripts/export-openapi.ts` và `swagger.setup.ts`.

```powershell
pnpm --filter @realestate/<service> openapi:export     # → services/<service>/openapi.json
```

- Response thành công dùng `@ApiEnvelope(Dto)` hoặc `@ApiEnvelope(Dto, { isArray: true, status: HttpStatus.CREATED })`.
- Lỗi dùng `ErrorResponseDto`.
- Controller nội bộ có `@ApiExcludeController()`: không xuất hiện trong `openapi.json`.

## 2. Mô tả lỗi nghiệp vụ

Plugin không suy ra được lỗi, phải viết tay. Đây là phần giảng viên nhìn nhiều nhất.

```ts
@ApiOperation({ summary: 'Đặt cọc', description: 'Giữ chỗ 10 phút, tạo link payOS. Cần Idempotency-Key.' })
@ApiEnvelope(DepositCreatedDto, { status: HttpStatus.CREATED })
@ApiConflictResponse({ type: ErrorResponseDto, description: 'LISTING_NOT_AVAILABLE; RENTAL_DEPOSIT_IN_PROGRESS; IDEMPOTENCY_IN_PROGRESS' })
@ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'IDEMPOTENCY_KEY_REUSED' })
@ApiServiceUnavailableResponse({ type: ErrorResponseDto, description: 'UPSTREAM_UNAVAILABLE: listing hoặc payment không sẵn sàng, chỗ giữ đã nhả' })
@ApiGatewayTimeoutResponse({ type: ErrorResponseDto, description: 'UPSTREAM_TIMEOUT: chưa rõ kết quả, hệ thống đối soát' })
@Post()
@Idempotent()
create() {}
```

Tối thiểu mô tả kỹ (đề tài yêu cầu mỗi service ≥ 4 endpoint, có lỗi `4xx` nghiệp vụ):

| Service | Endpoint |
|---|---|
| identity | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` |
| listing | `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id`, `GET /listings` |
| rental | `POST /deposits`, `POST /deposits/:id/refund-request`, `POST /deposits/:id/confirm-move-in`, `POST /admin/deposits/:id/hand-over` |
| payment | `POST /payments/payos/webhook`, `POST /withdrawals`, `POST /admin/withdrawals/:id/complete`, `POST /admin/refund-requests/:id/complete` |
| notification | `GET /notifications`, `PATCH /notifications/:id/read`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` |

Đường dẫn ngoài identity theo đề xuất `[cần xác nhận]`.

## 3. OpenAPI nội bộ: viết tay

`contracts/openapi/<service>-internal.v1.yaml`, OpenAPI 3.1, mỗi response có `example`. Kiểm:

```powershell
pnpm contracts:check
```

## 4. Postman collection

Đặt ở `infra/postman/`. Thư mục theo luồng demo; request chạy tuần tự, dùng biến chuyền dữ liệu.

**Biến:** `base_url`, `tenant_email`, `tenant_password`, `landlord_email`, `landlord_password`, `admin_email`, `admin_password`, `access_token_*`, `listing_id`, `held_listing_id`, `deposit_id`, `withdrawal_id`, `refund_request_id`, `run_suffix`.

| # | Thư mục / Request | Mong đợi | Kiểm tra | Ca báo cáo |
|---|---|---|---|---|
| | **00 Setup** | | | |
| 1 | Health gateway | `200` | `status = ok` | |
| 2 | Đăng nhập admin, chủ trọ, người thuê | `200` | Lưu token | |
| | **01 Tài khoản** | | | |
| 3 | Đăng ký email trùng khác hoa thường | `409` | `IDENTITY_EMAIL_TAKEN` | T01 |
| 4 | Đăng nhập sai mật khẩu | `401` | `IDENTITY_INVALID_CREDENTIALS` | T02 |
| 5 | Dùng lại refresh token đã đổi | `401` | `IDENTITY_INVALID_REFRESH_TOKEN` | T03 |
| 6 | Token sai chữ ký | `401` | `AUTH_TOKEN_INVALID` | T17 |
| 7 | Gọi `/internal/listings/x` qua gateway | `404` | | T16 |
| | **02 Sản phẩm** | | | |
| 8 | Chủ trọ tạo tin (`run_suffix`) | `201` | `PENDING_REVIEW` | |
| 9 | Admin duyệt | `200` | | |
| 10 | Chủ trọ khác sửa tin | `403` | `LISTING_NOT_OWNER` | T04 |
| 11 | Tìm theo bán kính 2 km | `200` | Có tin seed | T05 |
| | **03 Đặt cọc** | | | |
| 12 | Đặt cọc tin `HELD` | `409` | `LISTING_NOT_AVAILABLE` | T06 |
| 13 | Đặt cọc tin trống | `201` | `PENDING_PAYMENT`, có `checkoutUrl` | |
| 14 | Gửi lại cùng `Idempotency-Key` | `201` | Cùng `depositId` | T08 |
| 15 | Webhook sai chữ ký | `200` | Đơn vẫn `PENDING_PAYMENT` | T09 |
| 16 | Webhook hợp lệ (script ký) | `200` | Sau ≤ 5 giây đơn `PAID` | |
| 17 | Webhook hợp lệ lần hai | `200` | Ví không đổi | T10 |
| 18 | Chủ trọ xóa tin `DEPOSITED` | `409` | `LISTING_HAS_ACTIVE_DEPOSIT` | T18 |
| | **04 Vòng đời** | | | |
| 19 | Admin bàn giao, chủ trọ xác nhận | `200` | | |
| 20 | Chủ trọ rút khi chưa `RELEASED` | `409` | `PAYMENT_WITHDRAWAL_NOT_ELIGIBLE` | T13 |
| 21 | Người thuê nhận phòng | `200` | `RELEASED` | |
| 22 | Yêu cầu hoàn sau khi nhận phòng | `409` | `RENTAL_INVALID_TRANSITION` | T11 |
| 23 | Chủ trọ tạo lệnh rút | `201` | `PENDING` | |
| 24 | Admin hoàn tất với chứng từ | `200` | Đơn `WITHDRAWN` | |
| 25 | Admin dùng lại chứng từ cho lệnh khác | `409` | `PAYMENT_RECEIPT_ALREADY_USED` | T14 |
| | **05 Hoàn tiền** | | | |
| 26 | Đơn khác: yêu cầu hoàn trong 48 giờ | `200` | Yêu cầu 70% | T12 |
| 27 | Admin hoàn tất | `200` | Đơn `REFUNDED`, BĐS `AVAILABLE` | T12 |
| | **06 Thông báo, quyền** | | | |
| 28 | Danh sách thông báo | `200` | Có "Đặt cọc thành công" | |
| 29 | Người A đánh dấu thông báo của B | `404` | `NOTIFICATION_NOT_FOUND` | T15 |
| 30 | Người thuê gọi API admin | `403` | `FORBIDDEN_ROLE` | |

Mẫu assertion:

```javascript
pm.test('BĐS không còn khả dụng', () => {
  pm.response.to.have.status(409);
  pm.expect(pm.response.json().error.code).to.eql('LISTING_NOT_AVAILABLE');
});
```

Không đưa payOS thật vào collection CI: webhook dùng script ký bằng `PAYOS_CHECKSUM_KEY` của môi trường test `[cần xác nhận]` cách ký trong Postman (pre-request script).

## 5. Newman

```powershell
npx newman run infra/postman/RealEstate.postman_collection.json `
  -e infra/postman/local.postman_environment.json `
  --delay-request 50 --reporters cli,json --reporter-json-export infra/postman/results/newman.json
```

Chạy lại nhiều lần trên cùng database vẫn xanh: dùng `run_suffix`, tạo tin mới ở Setup.

## 6. CI

`.github/workflows/ci.yml` (T1.1, T5.3):

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm contracts:check
      - run: pnpm build
  test:
    needs: check
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [template-nest, identity]   # thêm service khi có
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @realestate/${{ matrix.service }} test
      - run: pnpm --filter @realestate/${{ matrix.service }} test:e2e
  e2e:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cp .env.example .env && node scripts/generate-jwt-keys.mjs
      - run: docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build --wait
      - run: npx newman run infra/postman/RealEstate.postman_collection.json -e infra/postman/local.postman_environment.json
      - if: failure()
        run: docker compose --env-file .env -f infra/compose/docker-compose.yml logs --tail=100
```

`test:infra` cần hạ tầng: thêm `services:` Postgres/Redis/RabbitMQ vào job hoặc chạy trong job `e2e` `[cần xác nhận]`.
