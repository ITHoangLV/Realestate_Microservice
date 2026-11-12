# Phase 1 — Nền tảng và gateway

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

**Mục tiêu:** client gọi được identity qua gateway; CI chạy trên mọi PR.

**Hạn:** M0 — 2026-11-13 (cuối S1).

**Điều kiện xong:** tag `v0.1-skeleton`.

---

## T1.1 CI

| | |
|---|---|
| **Người làm** | B |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Mã WBS** | E1-1 |
| **Đọc trước** | `guides/RE_OpenAPI_Postman_Guide.md §6`, `standards/git-workflow.md` |
| **Phụ thuộc** | Không |

**Các bước:**

1. `.github/workflows/ci.yml`: cache pnpm, `pnpm lint`, `pnpm format:check`, `pnpm contracts:check`, `pnpm build`, `test` và `test:e2e` theo ma trận service.
2. Bật bảo vệ nhánh `main`, `develop`: cần một review và CI xanh.

**Kiểm chứng:** mở PR cố ý làm hỏng một schema trong `contracts/events/` → CI đỏ.

**DoD:** CI xanh trên `develop`; nhánh được bảo vệ.

---

## T1.2 api-gateway

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Mã WBS** | E1-2, E1-3, E1-4 |
| **Đọc trước** | `design/SHARED/RE.GATEWAY/` (cả 3 file), ADR-0003 |
| **Phụ thuộc** | T0.1 (thư viện proxy, timeout, rate limit) |

**Các bước:**

1. Tạo `services/api-gateway` từ template (`RE.SERVICE_TEMPLATE/Component_Class_Design.md §3`), không bật DB.
2. `routes.ts` theo `RE.GATEWAY/API_Spec.md §3`; `RouteResolver`.
3. `InternalBlockMiddleware`, `AccessGuard` (JWT RS256 bằng khóa công khai), throttler.
4. `ProxyMiddleware`: timeout, đổi lỗi kết nối thành `503/504`, giữ body thô cho webhook.

**Kiểm chứng:**

```powershell
pnpm --filter @realestate/api-gateway test
curl.exe -i http://localhost:8080/internal/listings/x                      # 404
curl.exe -i http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer sai"  # 401 AUTH_TOKEN_INVALID
```

**DoD:** Test 1–11 ở `RE.GATEWAY/Component_Class_Design.md §4` pass.

---

## T1.3 Compose profile `apps`, identity sau gateway

| | |
|---|---|
| **Người làm** | A |
| **Thời lượng** | `[cần xác nhận]` |
| **Hạn** | M0 — 2026-11-13 |
| **Đọc trước** | `guides/RE_Docker_Local_Guide.md`, `services/_template-nest/README.md §6` |
| **Phụ thuộc** | T1.2 |

**Các bước:**

1. Thêm `api-gateway`, `identity` vào `infra/compose/docker-compose.yml` profile `apps`; mount khóa JWT; `INTERNAL_*_URL` dùng tên service.
2. Chỉ gateway publish cổng `127.0.0.1:8080`.

**Kiểm chứng:**

```powershell
docker compose --env-file .env -f infra/compose/docker-compose.yml --profile dev --profile apps up -d --build
curl.exe -X POST http://localhost:8080/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"t1@x.com\",\"password\":\"Matkhau@123\",\"fullName\":\"T1\",\"role\":\"TENANT\"}'
```

**DoD:** Đăng ký, đăng nhập, `/me` qua 8080; cùng `X-Request-ID` ở log gateway và identity. Đặt tag `v0.1-skeleton`.
