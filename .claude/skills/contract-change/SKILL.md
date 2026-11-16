---
name: contract-change
description: >
  Sửa hợp đồng API nội bộ (contracts/openapi/) hoặc sự kiện (contracts/events/, definitions.json) theo
  contract-first (ADR-0012) TRƯỚC khi sửa code. Kích hoạt khi kế hoạch có thêm/đổi endpoint /internal/*,
  thêm/đổi event, payload, routing key, binding, hoặc khi nghe "sửa contract", "thêm event", "đổi schema",
  "thêm API nội bộ".
---

# contract-change

**MUST** sửa `contracts/` **trước** code và chạy `pnpm contracts:check` (`CLAUDE.md` gốc §8, ADR-0012).
**NEVER** đoán hợp đồng của service khác. **NEVER** tự tạo exchange/queue trong code.

Quy tắc gốc: `contracts/openapi/README.md` ("Đổi API nội bộ"), `contracts/events/README.md` ("Đổi schema"). Danh mục sự kiện: `design/SHARED/RE.MESSAGING/API_Spec.md §3`.

## Bước 1 — Phân loại thay đổi

| Thay đổi | Cách làm | Ai duyệt |
|---|---|---|
| Thêm trường vào response API nội bộ | Sửa yaml + `example`; bên gọi bỏ qua trường lạ | Người phụ trách service **gọi** |
| Xóa/đổi trường, đổi mã lỗi API nội bộ | Endpoint mới hoặc `v2`; bên gọi chuyển xong mới xóa bản cũ | Bên gọi |
| Thêm trường **không bắt buộc** vào payload event | Sửa schema `v1` + ví dụ | Mọi service nghe event |
| Thêm trường bắt buộc / xóa / đổi kiểu / đổi nghĩa | Tạo `v2`; producer phát song song `v1`, `v2` tới khi consumer chuyển xong | Mọi service nghe |
| Event mới | Schema + ví dụ + binding `infra/rabbitmq/definitions.json` + `infra/scripts/check-infra.*` | A (topology) + bên nghe |
| Chưa có code phát/nghe event đó | Được sửa thẳng `v1`; ghi ngày vào `contracts/events/README.md` (như 2026-11-16) | Như trên |

Không chắc thuộc dòng nào → dừng, hỏi người phụ trách.

## Bước 2 — Sửa đồng bộ trong một PR

- [ ] File `contracts/` (yaml hoặc `*.schema.json` + `examples/*.json`). Schema giữ `additionalProperties: false`; `eventType` khớp regex `^[a-z]+\.[a-z-]+$`.
- [ ] `API_Spec.md` của chức năng (mục API nội bộ hoặc sự kiện phát/nhận) — sửa thiết kế qua `solution-architect`, sau baseline thêm `CHANGELOG.md`.
- [ ] Danh mục `RE.MESSAGING/API_Spec.md §3` nếu đụng event; bảng event trong `contracts/events/README.md`.
- [ ] `definitions.json` + `check-infra.ps1` / `check-infra.sh` nếu thêm binding. Queue mới là việc của A (T4.1).
- [ ] Bảng định tuyến `RE.GATEWAY` **không** chứa `/internal/*` (gateway trả `404`).

## Bước 3 — Kiểm

```powershell
pnpm contracts:check
```

Đụng topology:

```powershell
pnpm infra:down; docker volume rm realestate_rabbitmq_data; pnpm infra:up; pnpm infra:check
```

Dán output. Đỏ → sửa, không đi tiếp sang code.

## Bước 4 — Sau đó mới code

- Producer: `OutboxService.add(manager, …)` trong cùng transaction + test `expectEventMatchesContract` (`test/helpers/contracts.ts`).
- Consumer: handler chống trùng qua `processed_events`, bỏ qua trường lạ.
- Client gọi API nội bộ: chỉ qua `InternalHttpService` trong `clients/`, mock bằng `example` của yaml trong unit test.
- Ghi vào `current-task.md`: file `contracts/` đã sửa, người cần duyệt. Gọi `progress-tracker`.
