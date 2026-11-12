# RE.<TÊN> — Đặc tả API

| | |
|---|---|
| **Mã chức năng** | `RE.<TÊN>` — <mô tả một dòng> |
| **Service** | `<service>` (cổng <NNNN>) |
| **Quy tắc** | BR-xx |
| **Quyết định** | ADR-NNNN |
| **CSDL** | `<service>_db` / `<service>_user`: <bảng> |
| **Chủ sở hữu / Cập nhật / Phiên bản** | <chủ sở hữu> — YYYY-MM-DD — v1.0 |

## 1. API công khai

| # | Method, đường dẫn | Quyền | Kết quả |
|---|---|---|---|

### Thứ tự kiểm tra

| # | Điều kiện | Kết quả |
|---|---|---|

## 2. API nội bộ

Hợp đồng: `contracts/openapi/<service>-internal.v1.yaml`.

| Method, đường dẫn | Bên gọi | Kết quả |
|---|---|---|

## 3. Sự kiện

| Phát / Nghe | Routing key | Khi nào / Xử lý |
|---|---|---|

## 4. Catalog mã lỗi

| Mã | HTTP | Thông báo | Quy tắc | Nguồn (Báo cáo / Code / Đề xuất) |
|---|---|---|---|---|

## 5. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|

## 6. DDL

```sql
```

## 7. Điểm [cần xác nhận]

> Chỉ giữ mục này khi tài liệu có điểm chưa chốt; không có thì xóa cả mục.

1.
