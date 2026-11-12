# Chuẩn viết tài liệu thiết kế

> Áp dụng cho procedure `solution-architect` (viết), `architect-reviewer` (soi) và người đọc.
> Nguồn tham chiếu chéo: `api-convention.md`, `coding-convention.md`, `reliability-standard.md`, `non-functional-standards.md`, `architecture.md`, `project-structure.md`, `domain-glossary.md`.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |

## 0. Phạm vi

Tài liệu này áp dụng cho backend trong repo `Realestate_Microservice`: api-gateway và 5 service NestJS dựng từ `services/_template-nest`. Giao diện Next.js nằm ở repo riêng (https://github.com/dotrungthanhCC01/real-estate), gọi API qua gateway; thiết kế ở đây không mô tả màn hình.

**Nguồn nghiệp vụ là Báo cáo v2** qua `business-spec/RE.BUSINESS_RULES.md`. Hệ thống viết mới, không có monolith để đối chiếu. Mọi điểm báo cáo chưa chốt (đường dẫn, tên trạng thái, mã lỗi mới, routing key) được **đề xuất** trong thiết kế và gắn `[cần xác nhận]`, đồng thời ghi vào `implementation/van-de-can-quyet-dinh.md`.

## 1. Bộ ba tài liệu

Mỗi chức năng `RE.<TÊN>` có thư mục `design/<CỤM>/<MÃ>/`, copy từ `design/_template/`:

| Tài liệu | Trả lời | Không chứa | Bám chuẩn |
|---|---|---|---|
| `API_Spec.md` | Hợp đồng ngoài: endpoint công khai và nội bộ, request, response, thứ tự kiểm tra, mã lỗi, sự kiện, biến môi trường, DDL | Tên class nội bộ | `api-convention.md` |
| `Component_Class_Design.md` | Cấu trúc trong: thư mục, class, entity, client, job, test bắt buộc | Bảng field của request | `architecture.md §6`, `coding-convention.md`, `project-structure.md` |
| `Processing_Flow.md` | Luồng chạy: thứ tự bước, transaction, đồng thời, gọi lại, nhánh lỗi, số truy vấn | Chi tiết field | `reliability-standard.md`, `non-functional-standards.md` |
| `CHANGELOG.md` | Lịch sử sửa thiết kế (§9) | | |

Cụm: `SHARED` (nền kỹ thuật), `IDENTITY`, `LISTING`, `RENTAL`, `PAYMENT`, `NOTIFICATION`. Chức năng con đi theo service chứa nó (`RE.DEPOSIT_SAGA` ở `RENTAL`, `RE.PAYOUT` ở `PAYMENT`, `RE.CHAT` ở `NOTIFICATION`).

## 2. Header

Bảng đầu mỗi tài liệu gồm: **mã chức năng · service (và cổng) · quy tắc `BR-xx` · CSDL · chủ sở hữu / ngày cập nhật (YYYY-MM-DD) / phiên bản**. Ba tài liệu cùng chức năng có cùng phiên bản.

## 3. Trỏ tới nguồn, không chép lại

| Khía cạnh | Tra ở |
|---|---|
| Đường dẫn, đặt tên endpoint, tên trường JSON | `api-convention.md §1–2` |
| Status code, envelope, phân trang | `api-convention.md §3–4` |
| Body lỗi, mã lỗi, tiền tố theo service | `api-convention.md §5–6` |
| Header, `Idempotency-Key` | `api-convention.md §7` |
| Kiểu dữ liệu (id, tiền, thời gian) | `api-convention.md §8` |
| Timeout, retry, phân loại lỗi | `reliability-standard.md` |
| Ngưỡng số truy vấn, phân trang, index | `non-functional-standards.md §1` |
| Đặt tên file, class, cấu trúc module | `coding-convention.md §2–3` |
| Ranh giới service, chỗ đặt file | `architecture.md §6`, `project-structure.md` |
| Thuật ngữ, trạng thái | `domain-glossary.md` |
| Sự kiện, routing key | `design/SHARED/RE.MESSAGING/API_Spec.md §3` |

Mâu thuẫn → theo file nguồn.

### 3.1 Bộ kiểm tuân thủ — bắt buộc trước khi trình

Mở file chuẩn ra soi **từng** endpoint, trường, mã lỗi. Còn một điểm lệch → sửa, chưa trình. `architect-reviewer` soi lại y hệt.

- [ ] Đường dẫn `/api/v1/*` hay `/internal/*` đúng loại; danh từ số nhiều, kebab-case; ≤ 3 lớp; hành động sau resource.
- [ ] Đường dẫn identity đã có trong code **giữ nguyên**; đường dẫn mới gắn `[cần xác nhận]` cho tới khi nhóm chốt.
- [ ] Trường JSON camelCase; tiền là số nguyên VND.
- [ ] Response theo envelope `{ data, meta }`; lỗi `{ error, meta }`.
- [ ] Status code đúng bảng `api-convention.md §3`.
- [ ] Mã lỗi `<MIỀN>_<LÝ_DO>` đúng tiền tố service, có trong catalog; cột "Nguồn" ghi `Báo cáo`, `Code` hoặc `Đề xuất`.
- [ ] Danh sách có phân trang, sắp xếp tường minh.
- [ ] Quyền ở gateway (`public` / `user` / `tenant` / `landlord` / `admin` / `payos`, `RE.GATEWAY/API_Spec.md §2`) ghi cho từng route công khai; service kiểm chủ sở hữu.
- [ ] Thao tác ghi quan trọng có `Idempotency-Key`; API nội bộ ghi idempotent theo khóa nghiệp vụ.
- [ ] Mỗi lời gọi liên service có trong bảng retry `reliability-standard.md §3`.
- [ ] API nội bộ có trong `contracts/openapi/<service>-internal.v1.yaml` (hoặc ghi rõ file cần cập nhật).
- [ ] Sự kiện có trong danh mục `RE.MESSAGING/API_Spec.md §3` và schema `contracts/events/`.
- [ ] Số truy vấn dự kiến trong ngưỡng, hoặc đã ghi lý do vượt.
- [ ] Tên file, class theo `coding-convention.md §3`; cấu trúc khớp `project-structure.md`.
- [ ] Thuật ngữ, trạng thái đúng `domain-glossary.md`.
- [ ] Mỗi `BR-xx` liên quan có nơi kiểm tra và mã lỗi.

Không chắc → tra file chuẩn. Tra không thấy → `[cần xác nhận]`.

## 4. Sơ đồ

Mermaid là mặc định: `sequenceDiagram` cho luồng, `classDiagram` cho lớp, `stateDiagram-v2` cho trạng thái, `flowchart` cho kiến trúc, `erDiagram` cho dữ liệu.

## 5. `[cần xác nhận]`

Mọi điểm chưa chốt (đường dẫn, cột, trạng thái, quyền, hợp đồng service khác) → ghi `[cần xác nhận]` tại chỗ **và** gom thành danh sách đánh số ở mục cuối tài liệu. Tài liệu không có điểm nào chưa chốt thì không có mục này. Điểm ảnh hưởng nhiều chức năng → thêm vào `implementation/van-de-can-quyet-dinh.md`. Không đoán cho xong.

## 6. Thao tác ghi phải nêu rõ

- Thứ tự kiểm tra (guard) ↔ mã lỗi.
- Ranh giới transaction. **Không giữ transaction khi gọi HTTP**.
- Chống đồng thời: `UPDATE ... WHERE` có điều kiện, khóa Redis, ràng buộc duy nhất.
- Gọi lại lần hai (idempotency), khóa là gì.
- Khi phụ thuộc lỗi: chưa thực hiện và chưa biết xử lý ra sao.
- Sự kiện phát ra (qua outbox, cùng transaction).

## 7. Súc tích

- **Một thông tin một nơi.** Chi tiết endpoint, mã lỗi chỉ ở `API_Spec.md`; file khác nhắc tên và trỏ.
- **Không lặp trong cùng tài liệu.**
- **Cắt phần thừa:** diễn giải dài, chép lại quy ước chung, chữ mẫu chưa điền.
- **Ưu tiên dạng máy đọc:** bảng, danh sách, code fence.

Vi phạm là finding MINOR/MAJOR, không chặn trình.

## 8. Đối chiếu thiết kế liên quan

Trước khi viết, quét `design/` tìm chức năng cùng service hoặc dùng chung entity, endpoint, mã lỗi, sự kiện, client.

- Trùng khái niệm → **trỏ và tái dùng**.
- Hợp đồng nội bộ phải khớp **hai phía**: `API_Spec.md` bên cung cấp và client bên gọi.
- Xung đột không tự hòa giải được → `[cần xác nhận]`, không đè thiết kế cũ.

## 9. Nhật ký thay đổi (`CHANGELOG.md`)

- **Bản đầu (v1.0) không ghi** — đó là baseline. Baseline tính từ khi T0.1, T0.2 (`implementation/PHASE-0.md`) duyệt xong; trước đó sửa thẳng, giữ v1.0. Tạo `CHANGELOG.md` từ `_template/` ở **lần sửa đầu tiên** sau baseline.
- Mỗi lần sửa thêm **một mục mới lên đầu**. Không sửa, gộp, xóa mục cũ.
- Một mục gồm: `## [vX.Y] — YYYY-MM-DD`; `type` (MAJOR / MINOR); `author`; `summary` một câu; **Thay đổi** đánh số (`# · Vị trí · Loại` + **Cũ / Mới / Lý do**); **File design đã sửa**; **Ảnh hưởng**.
- **MAJOR:** phá hợp đồng — xóa/đổi endpoint, đổi shape, đổi/bỏ mã lỗi, đổi bảng đã dùng, đổi sự kiện. **MINOR:** thêm mới, sửa không phá, chốt một `[cần xác nhận]`.
- Phiên bản mục mới nhất **khớp** header 3 tài liệu.

## 10. MUST / NEVER

- **MUST** đủ 3 tài liệu, header chuẩn; có danh sách `[cần xác nhận]` khi còn điểm chưa chốt.
- **MUST** qua bộ kiểm §3.1 trước khi trình.
- **MUST** cập nhật `contracts/` khi đổi API nội bộ hoặc sự kiện.
- **MUST** cập nhật `CHANGELOG.md` khi sửa thiết kế đã có baseline.
- **MUST** cập nhật `project-structure.md` khi đổi cấu trúc, và `project-knowledge/CLAUDE.md §2.3` khi thêm chức năng.
- **MUST** tạo ADR `Proposed` cho quyết định có đánh đổi lâu dài (`decisions/README.md`).
- **NEVER** thiết kế trái `architecture.md`, `api-convention.md`, hoặc trái `RE.BUSINESS_RULES.md`.
- **NEVER** đổi đường dẫn, mã lỗi đã có trong code mà không qua ADR/CHANGELOG.
- **NEVER** để thiết kế chỉ nằm trong chat.
