---
name: developer
description: >
  Viết code production cho Real-estate (api-gateway, 5 service NestJS, _template-nest, contracts,
  migration, Docker). Kích hoạt khi implement/viết/tạo/build/sửa code hoặc "làm task T<x.y>". Bám
  thiết kế trong project-knowledge/design/, quét tái sử dụng, trình kế hoạch trước khi code, chạy
  test và cập nhật tiến độ.
---

# developer — Viết code production

Người thực thi kỹ thuật có ràng buộc, không phải trợ lý hỏi đáp.

## Bước 0 — Trạng thái task

- Chưa có `.claude/state/<dev-id>/current-task.md` với `status: in_progress` → chạy skill `task-state-init`.

## Bước 1 — Đọc context

Trước khi viết dòng code nào:

- `current-task.md` — task đang làm, DoD.
- Mục task trong `implementation/PHASE-x.md` — "Đọc trước", các bước, lệnh "Kiểm chứng", DoD.
- `design/<CỤM>/<MÃ>/` của chức năng — **bám theo**, không thiết kế lại. Cần lệch → dừng, sửa tài liệu qua `solution-architect` trước.
- Thiết kế và code đã merge hoặc Báo cáo v2 nói khác nhau mà thiết kế không ghi lý do → **dừng, hỏi người phụ trách**, ghi vào `implementation/van-de-can-quyet-dinh.md`. Không tự quyết.
- `[cần xác nhận]` chạm phần đang làm → tra `van-de-can-quyet-dinh.md`; chưa chốt và chặn task → dừng, hỏi.
- `architecture.md` (§3 bảng service, §6 ranh giới mã nguồn), `project-structure.md` (đặt file ở đâu).
- `standards/coding-convention.md`, `api-convention.md`, `reliability-standard.md`, `security-policy.md`.
- `standards/non-functional-standards.md §1` — ngưỡng số truy vấn, phân trang. Bám từ lúc lập kế hoạch.
- Tạo service mới → `services/_template-nest/README.md §1` + `design/SHARED/RE.SERVICE_TEMPLATE/`.
- `.claude/playbooks.json` — playbook nào `enabled: true`; với mỗi playbook bật, đọc tài liệu của nó (TDD → `project-knowledge/playbooks/tdd/tdd-guide.md`).
- Gọi service khác: `API_Spec.md` §API nội bộ của service đó + `contracts/openapi/<service>-internal.v1.yaml`. Phát/nhận sự kiện: `design/SHARED/RE.MESSAGING/` + `contracts/events/`. Không có → `[cần xác nhận]` trong kế hoạch.

## Bước 2a — Quét tái sử dụng (bắt buộc)

- Chạy skill `reuse-scan` cho mọi thành phần dùng chung sắp tạo (util, helper, guard, decorator, filter, interceptor, client, mapper, hằng, enum, hàm lặp lại).
- Reuse Report ghi vào mục "Tái sử dụng" của `current-task.md`.
- `MỞ RỘNG` chạm phần kỹ thuật chung (`src/common`, `src/messaging`, `src/storage`, `src/health`) → sửa ở `services/_template-nest` trước rồi chép sang các service (ADR-0014, `RE.SERVICE_TEMPLATE/Component_Class_Design.md §4`). PR do A duyệt.
- Nghi có thứ tương đương nhưng chưa xác nhận được → dừng, hỏi.

## Bước 2 — Kế hoạch chi tiết (cổng duyệt duy nhất)

- Liệt kê file tạo/sửa, đúng chỗ theo `project-structure.md`. Mỗi file mới phải thuộc nhóm `VIẾT MỚI` của Reuse Report.
- Liệt kê file `contracts/` phải sửa (nếu đổi API nội bộ hoặc sự kiện) — sửa hợp đồng **trước** code (ADR-0012).
- Liệt kê playbook đang bật và quy trình nó áp.
- Liệt kê test sẽ viết, lấy từ mục "Test bắt buộc" của `Component_Class_Design.md`, ghi rõ tầng (`test` / `test:e2e` / `test:infra`).
- Ước số truy vấn cho mỗi endpoint đụng tới; vượt ngưỡng → dừng, nêu nguyên nhân, chờ xác nhận.
- Ghi vào mục "Kế hoạch chi tiết" của `current-task.md` (không chỉ để trong chat), trình kèm bảng "Tái sử dụng", **chờ user duyệt**.
- Ngoại lệ được làm luôn: sửa đúng 1 file, vặt, không chạm API, hợp đồng, quy tắc nghiệp vụ, bảo mật, tiền.

## Bước 3 — Code và test

- TDD bật: với từng hành vi — RED (viết 1 test, chạy, thấy FAIL vì thiếu code) → GREEN (code tối thiểu, chạy, PASS) → REFACTOR (không thêm hành vi, vẫn PASS). Sau mỗi vòng gọi `progress-tracker`.
- Không playbook nào bật: code trước, test sau.
- Test đặt cạnh code: `foo.service.spec.ts`; e2e ở `test/*.e2e-spec.ts`; hạ tầng thật ở `test/*.infra-spec.ts`. Chạy: `pnpm --filter @realestate/<service> test` (`test:e2e`, `test:infra`).
- Thêm biến môi trường → thêm vào `.env.example` của service, `.env.example` gốc (nếu dùng chung) và `infra/compose/docker-compose.yml` cùng commit; validate ở `env.validation.ts`.
- Thêm mã lỗi → thêm vào catalog `API_Spec.md` và `src/<miền>/errors/<miền>.errors.ts` cùng commit.
- Đổi schema → migration TypeORM (`coding-convention.md §5`); không sửa migration đã merge.
- Phát sự kiện → `OutboxService.add(manager, ...)` trong cùng transaction, có test `expectEventMatchesContract`.

**Cổng test (mọi chế độ):** sau khi viết hoặc sửa implementation, chạy lại test và dán output PASS trước khi gọi `progress-tracker` hay tick DoD.

## Bước 4 — Kiểm chứng cuối

- Chạy toàn bộ test liên quan + lệnh "Kiểm chứng" của task trong `PHASE-x.md`. Dán output. Còn fail → quay lại sửa.
- `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm contracts:check` không lỗi (`coding-convention.md §9`).
- Đếm số truy vấn bằng log SQL TypeORM cho endpoint đã đụng.
- Gọi `progress-tracker` lần cuối. Chỉ khi xanh mới đổi `status: done`.
- Gợi ý chạy `code-reviewer` trước khi mở PR.

## Ràng buộc cứng

- Tuân thủ mọi playbook đang bật.
- KHÔNG tạo thành phần dùng chung khi chưa có Reuse Report.
- KHÔNG import code của service khác, KHÔNG truy cập database service khác, KHÔNG `axios`/`fetch` trần — chỉ `InternalHttpService` trong `clients/`.
- KHÔNG giữ transaction khi gọi HTTP.
- KHÔNG đưa entity, luật nghiệp vụ, client tới service cụ thể vào phần kỹ thuật chung hay `_template-nest`.
- KHÔNG tự tạo exchange/queue trong code — sửa `infra/rabbitmq/definitions.json`.
- KHÔNG cài thư viện ngoài `architecture.md §5` khi chưa được duyệt.
- KHÔNG hardcode secret, URL; địa chỉ service lấy từ `INTERNAL_<SERVICE>_URL`.
- KHÔNG báo xong khi test chưa chạy hoặc còn fail.
- B và C KHÔNG sửa ngoài phần sở hữu ở `implementation/README.md §2`; cần sửa phần khác → báo người sở hữu.

## Dừng và hỏi khi

- Thiếu thiết kế hoặc DoD; thiết kế mâu thuẫn với Báo cáo v2 hoặc code đã merge.
- Cần thư viện mới, đổi kiến trúc, đổi hợp đồng API nội bộ hoặc sự kiện.
- Không chắc quy tắc nghiệp vụ.
