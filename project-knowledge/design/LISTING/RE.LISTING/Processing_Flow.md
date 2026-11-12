# RE.LISTING — Luồng xử lý

| | |
|---|---|
| **Chức năng** | Quản lý sản phẩm, tải ảnh, tìm kiếm, giữ chỗ và đổi trạng thái theo đơn |
| **Tham chiếu** | `API_Spec.md`, `Component_Class_Design.md`, ADR-0010 |
| **Chủ sở hữu / Cập nhật / Phiên bản** | hoang.lv — 2026-11-12 — v1.0 |

## 1. Vòng đời trạng thái BĐS

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE: tạo (approval PENDING_REVIEW)
    AVAILABLE --> HIDDEN: chủ trọ ẩn
    HIDDEN --> AVAILABLE: chủ trọ hiện
    AVAILABLE --> HELD: rental giữ chỗ
    HELD --> AVAILABLE: hết hạn / bù trừ
    HELD --> DEPOSITED: đơn PAID
    DEPOSITED --> RENTED: đơn RELEASED
    DEPOSITED --> AVAILABLE: đơn REFUNDED
```

## 2. Tải ảnh

```mermaid
sequenceDiagram
    participant C as Trình duyệt
    participant L as listing
    participant S3 as S3 (Silo)
    C->>L: POST /listings/:id/images/upload-url { contentType }
    L->>L: kiểm chủ sở hữu, loại file, key = listings/{id}/{uuid}.{ext}
    L-->>C: presigned PUT (Content-Type đã ký)
    C->>S3: PUT ảnh
    C->>L: POST /listings/:id/images { key }
    L->>S3: HeadObject(key)
    alt quá kích thước / không có
        L-->>C: 400 LISTING_IMAGE_INVALID
    else
        L->>L: INSERT listing_images
        L-->>C: 201
    end
```

## 3. Giữ chỗ khi hai người cùng đặt cọc

```mermaid
sequenceDiagram
    participant R1 as rental (đơn A)
    participant R2 as rental (đơn B)
    participant L as listing
    participant DB as listing_db
    R1->>L: POST /internal/listings/x/holds {A}
    R2->>L: POST /internal/listings/x/holds {B}
    L->>DB: UPDATE ... WHERE status='AVAILABLE' (A)
    L->>DB: UPDATE ... WHERE status='AVAILABLE' (B)
    DB-->>L: A: 1 dòng
    DB-->>L: B: 0 dòng
    L-->>R1: 200 HELD
    L-->>R2: 409 LISTING_NOT_AVAILABLE
```

Postgres khóa dòng khi `UPDATE`; lệnh thứ hai chờ rồi đánh giá lại `WHERE`, thấy `HELD` nên 0 dòng. Không cần khóa ứng dụng. Khóa Redis ở rental chỉ chặn bấm lặp sớm.

## 4. Xóa mềm

Một câu `UPDATE listings SET deleted_at = now() WHERE id AND owner_id AND status NOT IN ('HELD','DEPOSITED') AND deleted_at IS NULL`. 0 dòng → đọc lại để chọn `404`/`403`/`409`. Không có cửa sổ giữa kiểm tra và xóa.

## 5. Số truy vấn

| Endpoint | Truy vấn |
|---|---|
| Tìm kiếm | 2 (count + data có ảnh bìa qua join cùng DB) |
| Chi tiết | 2 (tin + ảnh) |
| Giữ chỗ | 1, cộng 1 khi 0 dòng để phân biệt gọi lại |
| Đổi trạng thái | 1, cộng 1 khi 0 dòng |
