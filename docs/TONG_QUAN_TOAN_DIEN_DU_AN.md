# CẨM NANG TOÀN DIỆN VỀ DỰ ÁN HỆ THỐNG THUÊ NHÀ MICROSERVICES
> **Dành cho thành viên mới bắt đầu từ con số 0**  
> *Tài liệu cập nhật chính xác theo mã nguồn mới nhất (Nhánh `feature/identity`)*

---

## MỤC LỤC
1. [Dự án này là gì? Giải quyết bài toán đời thực nào?](#1-dự-án-này-là-gì-giải-quyết-bài-toán-đời-thực-nào)
2. [pnpm là gì? Tại sao bắt buộc dùng pnpm Monorepo?](#2-pnpm-là-gì-tại-sao-bắt-buộc-dùng-pnpm-monorepo)
3. [Kiến trúc Microservices & Phân chia công việc cho Team 3 người](#3-kiến-trúc-microservices--phân-chia-công-việc-cho-team-3-người)
4. [Các quyết định kỹ thuật chiến lược đã được chốt](#4-các-quyết-định-kỹ-thuật-chiến-lược-đã-được-chốt)
5. [Luồng nghiệp vụ cốt lõi: Đặt cọc Escrow & Hoàn tiền tự động (Saga)](#5-luồng-nghiệp-vụ-cốt-lõi-đặt-cọc-escrow--hoàn-tiền-tự-động-saga)
6. [Bản đồ cấu trúc thư mục toàn dự án](#6-bản-đồ-cấu-trúc-thư-mục-toàn-dự-án)
7. [Mổ xẻ "Chiếc khuôn đúc mẫu": `services/_template-nest`](#7-mổ-xẻ-chiếc-khuôn-đúc-mẫu-services_template-nest)
8. [Hướng dẫn thực chiến: Các bước để bắt đầu code một Service mới](#8-hướng-dẫn-thực-chiến-các-bước-để-bắt-đầu-code-một-service-mới)
9. [Bảng lệnh thần chú dùng hàng ngày (Cheat-sheet)](#9-bảng-lệnh-thần-chú-dùng-hàng-ngày-cheat-sheet)

---

## 1. DỰ ÁN NÀY LÀ GÌ? GIẢI QUYẾT BÀI TOÁN ĐỜI THỰC NÀO?

Dự án này là một nền tảng ứng dụng **Thuê nhà & Phòng trọ trực tuyến**, kết hợp mô hình của Airbnb và ví trung gian Shopee nhằm giải quyết 3 bài toán nhức nhối:

1. **Tìm kiếm phòng trọ thông minh theo GPS & AI:**
   * Thay vì tìm kiếm thủ công, người thuê tìm phòng theo **bán kính GPS** quanh trường học/nơi làm việc (ví dụ: *"quanh ĐH Bách Khoa 2km"*).
   * Tích hợp **Chatbot AI** đọc hiểu ngôn ngữ tự nhiên: *"Tìm phòng trọ quận Cầu Giấy dưới 3.5 triệu, có ban công thoáng và cho nuôi mèo"*.
2. **Ví cọc trung gian chống lừa đảo (Escrow Payment):**
   * Người thuê không chuyển tiền thẳng cho chủ nhà (tránh bị lừa hoặc phòng không đúng ảnh).
   * Tiền cọc được hệ thống giữ ở ví trung gian. Khi người thuê đến nhận phòng thực tế, bấm xác nhận hài lòng thì tiền mới chuyển cho chủ nhà.
   * Nếu chủ nhà từ chối hoặc quá hạn 24h không duyệt, hệ thống **tự động hoàn tiền cọc 100%**.
3. **Ký hợp đồng & Hậu mãi minh bạch:**
   * Hợp đồng số hóa rõ ràng, tự động nhắc lịch đóng tiền phòng.

---

## 2. PNPM LÀ GÌ? TẠI SAO BẮT BUỘC DÙNG PNPM MONOREPO?

### 2.1. pnpm là gì?
Khi lập trình NodeJS, bạn cần tải các bộ công cụ làm sẵn (thư viện / packages). Công cụ giúp tải và quản lý những thứ này gọi là **Package Manager**.
* **`pnpm`** viết tắt của **p**erformant **npm** (trình quản lý gói siêu nhanh và tiết kiệm ổ cứng).

### 2.2. Sự khác biệt giữa npm cũ và pnpm mới:
* **Cách làm của npm cũ (Lãng phí ổ cứng):** Nếu bạn có 6 service đều dùng NestJS (nặng ~100MB), npm sẽ tải về và nhân bản ra 6 lần -> Mất `600MB` ổ cứng một cách lãng phí cho cùng một nội dung.
* **Cách mạng của pnpm (Thông minh & Tiết kiệm):** pnpm chỉ tải thư viện về **đúng 1 lần duy nhất** vào một "Kho tổng" trên máy tính. Tại mỗi service, nó chỉ tạo một "đường dẫn tắt" (hard link) trỏ về kho tổng. Làm 10 hay 100 service thì máy tính cũng chỉ tốn dung lượng của 1 lần tải!

### 2.3. Cơ chế Monorepo (`pnpm-workspace.yaml`):
Thay vì tạo 6 kho chứa (repository) riêng lẻ trên GitHub khiến việc quản lý rối rắm, dự án gom tất cả vào một kho duy nhất (**Monorepo**).
Chỉ cần đứng ở thư mục gốc gõ:
```powershell
pnpm install
```
pnpm sẽ tự động đi vào từng service con và cài đặt toàn bộ đồ nghề cho cả dự án trong tích tắc.

---

## 3. KIẾN TRÚC MICROSERVICES & PHÂN CHIA CÔNG VIỆC CHO TEAM 3 NGƯỜI

Thay vì dồn toàn bộ code vào một "khối khổng lồ" (Monolith - nếu lỗi một chỗ là sập cả web), dự án chia thành các **dịch vụ nhỏ độc lập (Microservices)**:

```mermaid
flowchart TD
    Client["Ứng dụng Web / Mobile"] --> Gateway["API Gateway (Cổng 8080) - Bạn A"]

    subgraph Nhóm A ["Thành viên A (Cửa ngõ & Tài khoản)"]
        Gateway
        Identity["identity (3001)<br/>Đăng ký, Đăng nhập, JWT"]
        Notification["notification (3005)<br/>Gửi Email, Thông báo"]
    end

    subgraph Nhóm B ["Thành viên B (Tin đăng & AI)"]
        Listing["listing (3002)<br/>Đăng tin, Bản đồ GPS PostGIS, Ảnh S3"]
        Assistant["assistant (3006)<br/>Chatbot AI tư vấn"]
    end

    subgraph Nhóm C ["Thành viên C (Tiền bạc & Hợp đồng)"]
        Rental["rental (3003)<br/>Hợp đồng & Giữ chỗ"]
        Payment["payment (3004)<br/>Ví Escrow & Tự động hoàn tiền"]
    end

    Gateway --> Identity
    Gateway --> Listing
    Gateway --> Rental
    Gateway --> Payment
    Rental <-->|RabbitMQ domain.events| Payment
    Payment -.->|RabbitMQ| Notification
```

### Bảng phân công nhiệm vụ:

| Thành viên | Service phụ trách | Cổng (Port) | Cơ sở dữ liệu | Trách nhiệm chính |
| :---: | :--- | :---: | :--- | :--- |
| **Bạn A** | **api-gateway** | `8080` | *(Không có DB)* | Tiếp tân: Xác thực thẻ ra vào (JWT), gắn mã vết `X-Request-ID`, chuyển tiếp yêu cầu. |
| | **identity** | `3001` | Postgres: `identity_db` | Quản lý người dùng, mật khẩu mã hóa, phân quyền (`TENANT`, `LANDLORD`, `ADMIN`). |
| | **notification** | `3005` | Postgres: `notification_db` | Nhận tin nhắn từ RabbitMQ để gửi email chào mừng, nhắc cọc, báo duyệt hợp đồng. |
| **Bạn B** | **listing** | `3002` | Postgres: `listing_db` (PostGIS) | Quản lý tin đăng, tiện ích, ảnh lưu trên S3, tính khoảng cách GPS đường đi. |
| | **assistant** | `3006` | *(Không có DB)* | Chatbot AI gọi API của `listing` để tư vấn phòng cho khách. |
| **Bạn C** | **rental** | `3003` | Postgres: `rental_db` | Nắm đồng hồ hẹn giờ cọc, duyệt hợp đồng, chặn 2 người đặt trùng 1 phòng. |
| | **payment** | `3004` | Postgres: `payment_db` | Ví trung gian (Escrow), nhận tiền cọc, giải ngân hoặc kích hoạt **hoàn cọc tự động**. |

---

## 4. CÁC QUYẾT ĐỊNH KỸ THUẬT CHIẾN LƯỢC ĐÃ ĐƯỢC CHỐT

1. **Bỏ hoàn toàn MongoDB ➔ Quy về PostgreSQL (ADR-008):**
   * Để giảm tải việc học và vận hành 2 loại DB khác nhau cho team 3 người, `notification` chuyển sang dùng PostgreSQL (dùng cột `jsonb` cho nội dung linh hoạt).
   * Toàn bộ hệ thống thống nhất dùng **PostgreSQL 16**.
2. **Nguyên tắc "Két sắt riêng" (Database-per-service):**
   * Dù chạy chung cụm máy chủ Postgres, nhưng mỗi service có **một database riêng và một user riêng**.
   * User của `rental` tuyệt đối không thể đọc hay ghi vào database của `listing` hay `payment`.
3. **Cắt giảm tinh gọn:**
   * Cắt bỏ dịch vụ sửa chữa thiết bị (`maintenance`).
   * Gộp tính năng tính đường đi (`mobility`) vào thẳng `listing` vì PostgreSQL đã có sẵn công cụ bản đồ **PostGIS**.

---

## 5. LUỒNG NGHIỆP VỤ CỐT LÕI: ĐẶT CỌC ESCROW & HOÀN TIỀN TỰ ĐỘNG (SAGA)

Quy tắc cốt lõi: **Khách thuê trả cọc trước ➔ Tiền vào két trung gian ➔ Chủ nhà mới duyệt**.

```mermaid
sequenceDiagram
    autonumber
    actor Khach as Khách thuê
    participant Rental as rental (Quản lý hợp đồng)
    participant Payment as payment (Ví trung gian)
    actor ChuNha as Chủ nhà

    Khach->>Rental: 1. Gửi yêu cầu giữ chỗ (Hạn nạp cọc: 15 phút)
    Khach->>Payment: 2. Quét mã QR thanh toán cọc vào ví Escrow
    Payment->>Rental: 3. Bắn event "payment.deposited" (Đã nhận cọc)
    Rental->>ChuNha: 4. Báo chủ nhà: Có khách đã cọc tiền, duyệt trong 24h

    alt Trường hợp 1: Chủ nhà Đồng ý
        ChuNha->>Rental: Nhấn "Đồng ý"
        Note over Rental,Payment: Hợp đồng thành công. Khi khách dọn vào,<br/>tiền cọc giải ngân cho chủ nhà.
    else Trường hợp 2: Chủ nhà Từ chối HOẶC Quá 24h không bấm
        ChuNha->>Rental: Nhấn "Từ chối" (hoặc hết hạn 24h)
        Rental->>Payment: Bắn event "rental.rejected" (hoặc rental.expired)
        Payment-->>Khach: Kích hoạt Saga bù trừ: TỰ ĐỘNG HOÀN TIỀN 100% CHO KHÁCH
    end
```

---

## 6. BẢN ĐỒ CẤU TRÚC THƯ MỤC TOÀN DỰ ÁN

```text
Realestate_Microservice/
├── .github/                 # Tự động hóa kiểm tra mã nguồn (CI/CD)
│
├── contracts/               # "BẢN GIAO KÈO CHUẨN HÓA"
│   ├── events/              # JSON Schema chuẩn cho 10 loại tin nhắn RabbitMQ
│   └── openapi/             # Tài liệu chuẩn cho các API gọi nội bộ giữa các service
│
├── docs/                    # "PHÒNG THIẾT KẾ & TÀI LIỆU"
│   ├── adr/                 # Ghi chép quyết định kiến trúc (ADR-007 S3, ADR-008 bỏ Mongo)
│   ├── architecture/        # service-boundaries.md (Luật phân chia dữ liệu tối cao)
│   └── runbook/             # Cẩm nang vận hành khi có lỗi
│
├── infra/                   # "HẠ TẦNG DOCKER"
│   ├── compose/             # docker-compose.yml khởi động Postgres, Redis, RabbitMQ, S3
│   ├── rabbitmq/            # Bản đồ phân luồng hàng đợi thư tín (definitions.json)
│   └── scripts/             # Script check-infra.ps1 kiểm tra sức khỏe hạ tầng tự động
│
├── services/                # "NƠI VIẾT MÃ NGUỒN CÁC MICROSERVICES"
│   └── _template-nest/      # ⭐ CHIẾC KHUÔN ĐÚC BÁNH MẪU
│
├── .env.example             # Bảng mẫu cấu hình cổng và mật khẩu
├── package.json             # Bảng điều khiển lệnh trung tâm của cả dự án
├── pnpm-workspace.yaml      # Khai báo cấu trúc Monorepo
└── tsconfig.base.json       # Tiêu chuẩn viết mã TypeScript nghiêm ngặt
```

---

## 7. MỔ XẺ "CHIẾC KHUÔN ĐÚC MẪU": `services/_template-nest`

Thư mục `_template-nest` chứa sẵn toàn bộ nền tảng kỹ thuật. Khi cần làm service mới, chỉ việc nhân bản thư mục này.

```text
services/_template-nest/
├── Dockerfile              # Bản hướng dẫn đóng gói service chạy độc lập
├── .env.example            # Khai báo cổng PORT, DATABASE_URL, REDIS_URL, S3, RabbitMQ
├── package.json            # Khai báo các thư viện phụ thuộc
├── openapi.json            # Bản vẽ tài liệu Swagger của service
├── scripts/                # ensure-env.mjs (Tự tạo .env nếu lỡ quên)
├── test/                   # Các bài kiểm thử tự động (e2e tests)
└── src/                    # ⭐ MÃ NGUỒN CỐT LÕI
    ├── main.ts             # Điểm khởi đầu (cầu dao bật service)
    ├── app.module.ts       # Nơi lắp ghép tất cả các bộ phận
    │
    ├── common/             # Bộ đồ nghề dùng chung
    │   ├── auth/           # Bảo vệ quét thẻ JWT & phân quyền vai trò
    │   ├── errors/         # Chuẩn hóa mọi lỗi trả về theo định dạng JSON duy nhất
    │   ├── http/           # Điện thoại nội bộ gọi service khác (có tự động retry)
    │   ├── idempotency/    # Chống bấm đúp (chống trừ tiền 2 lần khi mạng lag)
    │   └── logging/        # Ghi nhật ký chuẩn JSON, tự động che giấu mật khẩu
    │
    ├── database/           # Bộ dây nối vào PostgreSQL (TypeORM)
    ├── redis/              # Bộ dây nối vào bộ nhớ đệm siêu tốc Redis
    ├── messaging/          # Bưu điện RabbitMQ (Outbox pattern, Inbox chống nhận trùng thư)
    ├── storage/            # Kho lưu trữ ảnh S3 (Tự tạo bucket, tạo link upload presigned)
    ├── health/             # Phòng y tế (/health kiểm tra service sống hay chết)
    └── example/            # Căn phòng mẫu để tham khảo cách viết code (xóa khi làm thật)
```

---

## 8. HƯỚNG DẪN THỰC CHIẾN: CÁC BƯỚC ĐỂ BẮT ĐẦU CODE MỘT SERVICE MỚI

Giả sử bạn bắt đầu code dịch vụ tài khoản **`identity`** (Cổng `3001`):

### Bước 1: Khởi động cụm hạ tầng Docker
Mở terminal PowerShell tại thư mục gốc `Realestate_Microservice`:
```powershell
pnpm infra:up
```
Kiểm tra xem hạ tầng đã sẵn sàng chưa:
```powershell
pnpm infra:check
```
*(Hiện tất cả các dòng màu xanh lá cây `OK` là thành công!)*

### Bước 2: Nhân bản từ khuôn `_template-nest`
Chạy lệnh copy tự động (bỏ qua các file rác):
```powershell
robocopy services\_template-nest services\identity /E /XD node_modules dist /XF .env openapi.json
```

### Bước 3: Đổi tên và cổng kết nối
Vào thư mục `services/identity/`:
1. Sửa `package.json`: Đổi tên thành `"@realestate/identity"`.
2. Sửa `.env.example`:
   * `SERVICE_NAME=identity`
   * `PORT=3001`
   * `DATABASE_URL=postgresql://identity_user:identity_pass@localhost:5433/identity_db`

### Bước 4: Chạy thử dịch vụ
Ở thư mục gốc, gõ lệnh:
```powershell
pnpm install
pnpm --filter @realestate/identity dev
```
Mở trình duyệt truy cập: `http://localhost:3001/api/docs`  
👉 **Trang tài liệu Swagger trực quan sẽ hiện ra, sẵn sàng để bấm thử!**

### Bước 5: Viết code tính năng
Vào `services/identity/src/`:
1. Xóa thư mục `src/example/`.
2. Tạo thư mục tính năng mới của bạn (ví dụ `src/auth/` hoặc `src/users/`).
3. Viết Entity (bảng dữ liệu), Service (logic nghiệp vụ) và Controller (đầu đón API).

---

## 9. BẢNG LỆNH THẦN CHÚ DÙNG HÀNG NGÀY (CHEAT-SHEET)

| Bạn muốn làm gì? | Lệnh chạy tại thư mục gốc dự án |
| :--- | :--- |
| **Bật hạ tầng (Postgres, Redis, RabbitMQ, S3)** | `pnpm infra:up` |
| **Kiểm tra trạng thái sức khỏe hạ tầng** | `pnpm infra:check` |
| **Tắt hạ tầng an toàn (giữ nguyên dữ liệu)** | `pnpm infra:down` |
| **Kiểm tra tính hợp lệ của các schema hợp đồng** | `pnpm contracts:check` |
| **Chạy 1 service cụ thể để code** | `pnpm --filter @realestate/<tên-service> dev` |
| **Chạy bài kiểm thử tự động của service** | `pnpm --filter @realestate/<tên-service> test` |
| **Tự động format làm đẹp mã nguồn** | `pnpm format` |
| **Kiểm tra lỗi cú pháp toàn bộ dự án** | `pnpm lint` |

> 📌 **Kim chỉ nam khi làm việc:**  
> Mọi quy định về việc service nào được phép lưu dữ liệu gì, service nào được gọi service nào đều được quy định tối cao tại file: [docs/architecture/service-boundaries.md](file:///d:/Realestate_Microservice/docs/architecture/service-boundaries.md). Hãy đọc kỹ tài liệu này trước khi tạo bảng dữ liệu mới!

