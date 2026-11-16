---
name: code-reviewer
description: >
  Review code Real-estate 5 chiều (Security, Performance, Correctness, Style, Reuse) cộng ranh giới
  service trước khi mở PR. Kích hoạt khi "review code", "check code", "chuẩn bị PR", "trước khi
  merge". Output CRITICAL/MAJOR/MINOR kèm gợi ý sửa.
---

# code-reviewer — Review code trước PR

Tiêu chí lấy từ `standards/*`, `architecture.md`, thiết kế của chức năng.

**Căn cứ là thiết kế** trong `design/<CỤM>/<MÃ>/`: code **lệch thiết kế** mà thiết kế không ghi lý do → MAJOR. Hành vi giữ nguyên từ code đã merge (`services/identity`, `services/_template-nest`) không phải CRITICAL / MAJOR — đáng bàn thì ghi vào `implementation/van-de-can-quyet-dinh.md`.

## 1. Security — `standards/security-policy.md`

- [ ] Không hardcode secret, token, khóa payOS; `.env.example` chỉ có giá trị dev vô hại; không commit khóa trong `secrets/` (`security-policy.md §1`).
- [ ] Log không chứa mật khẩu, token, số tài khoản, chữ ký payOS (`coding-convention.md §7`).
- [ ] Route công khai giữ `JwtAuthGuard` mặc định; chỉ `@Public()` khi `API_Spec.md` ghi `public` / `payos`, hoặc là `/internal/*`.
- [ ] Vai trò kiểm bằng `RolesGuard` **và** kiểm chủ sở hữu ở service; chỉ tin `sub` trong JWT, không tin `userId` trong body.
- [ ] Mức truy cập trong `services/api-gateway/src/gateway/routes.ts` khớp `API_Spec.md` và bảng định tuyến `RE.GATEWAY`.
- [ ] Webhook payOS kiểm chữ ký trước mọi xử lý; `returnUrl` không được coi là bằng chứng thanh toán.
- [ ] Truy vấn có tham số, không nối chuỗi từ input.
- [ ] Không phải chủ tài nguyên → status, mã lỗi đúng `API_Spec.md` của chức năng (`api-convention.md §3`).
- [ ] `/internal/*` không được mở qua gateway (gateway trả `404`).

## 2. Performance — `standards/non-functional-standards.md §1`

- [ ] Số truy vấn mỗi request trong ngưỡng (chi tiết 3 · danh sách 4 · ghi 6 · ghi có thay đổi tiền 8). Vượt mà không được xác nhận = **MAJOR**.
- [ ] Không N+1, không truy vấn trong vòng lặp, không lazy relation trong vòng lặp.
- [ ] Không gọi service khác trong vòng lặp — API batch hoặc bản chụp.
- [ ] Danh sách có phân trang, `limit` bị chặn, sắp xếp tường minh có khóa phụ.
- [ ] Cột lọc, sắp xếp có index qua migration; tìm theo bán kính dùng index GiST.
- [ ] Không làm tác vụ dài trong request người dùng; ảnh qua presigned URL.

## 3. Correctness

- [ ] Khớp thiết kế: endpoint, status code, mã lỗi, thứ tự kiểm tra.
- [ ] Mỗi `BR-xx` liên quan có kiểm tra và test cả nhánh đúng, nhánh sai.
- [ ] Chuyển trạng thái đơn đúng `RE.BUSINESS_RULES.md §5`; không có đường ra từ `REFUNDED`/`WITHDRAWN`.
- [ ] Transaction đúng chỗ; **không giữ transaction khi gọi HTTP**; sự kiện ghi outbox trong cùng transaction.
- [ ] Chống đồng thời (`UPDATE ... WHERE status = <mong đợi>`, 0 dòng là bên thua; unique index).
- [ ] Thao tác ghi quan trọng có `@Idempotent()`; API nội bộ idempotent theo khóa nghiệp vụ (`depositId`).
- [ ] Consumer chống trùng qua `processed_events`; lỗi quá số lần vào DLQ.
- [ ] `bigint` bọc `Number()` hoặc transformer trước khi tính.
- [ ] Lỗi phụ thuộc: phân biệt `not_executed` với `unknown`; `unknown` có đường đối soát (`reliability-standard.md §4`).
- [ ] Mọi thay đổi tiền cùng transaction; chi tiền có chứng từ (BR-17).

## 4. Style — `standards/coding-convention.md`

- [ ] Đặt tên file, class theo §3: `*.internal.controller.ts`, `<đích>.client.ts`, `<việc>.job.ts`.
- [ ] Controller chỉ nhận request; luật nghiệp vụ trong service (§2).
- [ ] File đặt đúng chỗ theo `project-structure.md`.
- [ ] Biến môi trường mới có trong `.env.example` và `infra/compose/docker-compose.yml`, validate ở `env.validation.ts`.
- [ ] Mã lỗi mới `<MIỀN>_<LÝ_DO>` có trong `API_Spec.md` và `src/<miền>/errors/`.
- [ ] Trường JSON camelCase; cột DB snake_case; schema chỉ đổi qua migration, không sửa migration đã merge.

## 5. Reuse và trùng lặp

- [ ] Đối chiếu mục "Tái sử dụng" trong `.claude/state/<dev-id>/current-task.md`.
- [ ] Tạo thành phần dùng chung mà **thiếu Reuse Report** → **MAJOR**.
- [ ] Trùng chức năng với phần có sẵn của `services/_template-nest` (`InternalHttpService`, `AppException`, `@Idempotent()`, outbox/inbox, S3, health) hoặc code sẵn trong `src/` → **MAJOR**.
- [ ] Sửa phần kỹ thuật chung mà không sửa `_template-nest` trước (ADR-0014) → **MAJOR**.
- [ ] Logic lặp ≥ 2 chỗ trong thay đổi → gom lại.

## 6. Ranh giới service — `coding-convention.md §1`, `architecture.md §6`

- [ ] Không import code, entity của service khác. Vi phạm = **CRITICAL**.
- [ ] Không kết nối database service khác, không `@ManyToOne` sang dữ liệu service khác.
- [ ] Chỉ `clients/` gọi ra ngoài, qua `InternalHttpService`; địa chỉ từ `INTERNAL_<SERVICE>_URL`.
- [ ] Không đặt nghiệp vụ trong phần kỹ thuật chung, `_template-nest` hoặc gateway.
- [ ] API nội bộ, sự kiện khớp `contracts/`; `pnpm contracts:check` xanh.

## Output

```
## Kết quả review

### CRITICAL (phải sửa trước khi merge)
- [file:dòng] mô tả + gợi ý sửa

### MAJOR (nên sửa)
### MINOR (cân nhắc)
### Điểm tốt
```
