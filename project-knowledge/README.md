# Tài liệu dự án Real-estate

> Chỉ mục cho thành viên nhóm và giảng viên. Claude dùng `CLAUDE.md` làm cổng vào.
> Đề tài: Thiết kế hệ thống cho thuê nhà, căn hộ, chung cư Real-estate theo kiến trúc microservices — Nhóm 5, môn Phát triển phần mềm hướng dịch vụ.

| | |
|---|---|
| **Chủ sở hữu / Cập nhật** | hoang.lv — 2026-11-12 |
| **Nguồn chuẩn** | Báo cáo giữa kỳ v2 (`Bao_cao_Real-estate_hoan_chinh_v2.docx`) |

## 1. Đọc gì trước

| Bạn cần | Đọc |
|---|---|
| Hiểu hệ thống trong 15 phút | `architecture.md` → `data-model.md` → `domain-glossary.md` |
| Hệ thống phải làm gì | `business-spec/RE.SRS.md`, `business-spec/RE.BUSINESS_RULES.md` |
| Đề bài yêu cầu gì, đáp ứng ở đâu | `requirements-traceability.md` |
| Vì sao thiết kế như vậy | `decisions/README.md` |
| Lịch, mốc, ai làm gì | `implementation/README.md` |
| Đang đến đâu | `implementation/progress.md` |
| Điểm chưa chốt | `implementation/van-de-can-quyet-dinh.md` |

## 2. Thư mục

| Thư mục, file | Nội dung |
|---|---|
| `architecture.md` | 5 service + gateway, dữ liệu, giao tiếp, cô lập lỗi, công nghệ |
| `data-model.md` | ERD 5 database và tham chiếu giữa service |
| `domain-glossary.md` | Thuật ngữ, từ chuẩn, trạng thái |
| `project-structure.md` | Cây thư mục repo |
| `requirements-traceability.md` | Yêu cầu đề bài → thiết kế → task → bằng chứng |
| `business-spec/` | Yêu cầu (SRS), quy tắc nghiệp vụ `BR-01`–`BR-19`, máy trạng thái đơn đặt cọc |
| `design/` | Thiết kế 12 chức năng, mỗi chức năng 3 file: `API_Spec`, `Component_Class_Design`, `Processing_Flow` |
| `decisions/` | Quyết định kiến trúc (ADR) |
| `standards/` | Quy ước API, code, độ tin cậy, bảo mật, phi chức năng, Git, viết thiết kế |
| `guides/` | Chạy Docker, OpenAPI và Postman, thí nghiệm lỗi, báo cáo và bảo vệ, đọc thiết kế |
| `implementation/` | Kế hoạch theo phase và mốc, task, tiến độ, sổ quyết định |
| `playbooks/` | Quy trình TDD dùng khi code với Claude |

Giao diện Next.js ở repo riêng: https://github.com/dotrungthanhCC01/real-estate.

## 3. Quy ước viết

- Thuật ngữ và chính tả theo `domain-glossary.md` (mục Từ chuẩn).
- Ngày dạng `YYYY-MM-DD`. Mỗi file có Chủ sở hữu và ngày cập nhật ở đầu file.
- Điểm chưa chốt gắn `[cần xác nhận]` tại chỗ và ghi vào `implementation/van-de-can-quyet-dinh.md` nếu ảnh hưởng nhiều file.
- Nội dung nhóm tự đặt (không có trong Báo cáo v2) ghi Nguồn = "Đề xuất".
- Ca kiểm thử của báo cáo viết "Báo cáo T01…T18"; thí nghiệm `E1`–`E10`; task `T<x.y>`; phần mở rộng `X1`–`X5`.
- Chuẩn viết tài liệu thiết kế: `standards/design-standards.md`.
