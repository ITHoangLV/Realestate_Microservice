# TỔNG QUAN VÀ PHÂN TÍCH CHI TIẾT HỆ THỐNG THUÊ NHÀ (DÀNH CHO NGƯỜI MỚI BẮT ĐẦU)

> Tài liệu này được biên soạn đặc biệt theo lối giải thích đời thường, trực quan, chi tiết từng li từng tí nhằm giúp bất kỳ ai dù chưa có nền tảng kỹ thuật cũng có thể hiểu rõ bản chất, kiến trúc và cách vận hành của hệ thống này.

---

## 1. DỰ ÁN NÀY SINH RA ĐỂ LÀM GÌ? (GÓC NHÌN ĐỜI THỰC & BÀI TOÁN KINH DOANH)

Dự án này là mã nguồn xây dựng một **Nền tảng ứng dụng Thuê nhà / Phòng trọ trực tuyến**, giải quyết những nỗi đau lớn nhất của người đi thuê phòng và chủ trọ:

1. **Tìm kiếm phòng trọ thông minh theo vị trí & AI:**
   * Thay vì phải đi lùng sục từng ngõ ngách, người thuê có thể tìm phòng xung quanh trường học hoặc nơi làm việc theo **bán kính GPS** (ví dụ: *"tìm phòng trong bán kính 2km quanh ĐH Bách Khoa"*).
   * Tích hợp **Chatbot AI** tư vấn tự động: Đọc hiểu nhu cầu ngôn ngữ tự nhiên (ví dụ: *"Tìm phòng trọ quận Cầu Giấy dưới 3.5 triệu, có ban công thoáng và cho nuôi mèo"*).
2. **Đặt cọc giữ chỗ an toàn chống lừa đảo (Escrow Payment):**
   * Nỗi sợ lớn nhất của người đi thuê là chuyển khoản đặt cọc xong đến nơi bị lừa hoặc phòng không như hình.
   * Hệ thống áp dụng **Ví trung gian**: Tiền cọc của người thuê được hệ thống giữ lại. Sau khi người thuê đến nhận phòng thực tế, kiểm tra đúng như mô tả và xác nhận hài lòng thì tiền mới chuyển cho chủ nhà.
3. **Quản lý hợp đồng & dịch vụ sau thuê:**
   * Ký hợp đồng điện tử rõ ràng, minh bạch.
   * Nhận thông báo nhắc hạn đóng tiền phòng tự động.
   * Gửi yêu cầu sửa chữa, bảo trì thiết bị khi hỏng hóc (điều hòa hỏng, tắc đường ống nước).

---

## 2. HIỆN TRẠNG: DỰ ÁN ĐANG Ở GIAI ĐOẠN NÀO?

Dự án đang ở **Giai đoạn 1 (Foundation / Thiết lập Nền móng & Hạ tầng kỹ thuật)**:
* **Hạ tầng cơ sở (Đã hoàn thành 100%):** Cơ sở dữ liệu, hàng đợi bưu điện chuyển phát tin nhắn, kho lưu trữ ảnh, các công cụ kiểm tra tự động và tiêu chuẩn viết code đều đã được dựng hoàn chỉnh và chạy trơn tru.
* **Tầng dịch vụ nghiệp vụ (Chuẩn bị bước vào Giai đoạn 2):** Thư mục `services/` hiện tại đang sẵn sàng làm khung chứa để viết mã nguồn NestJS chi tiết cho từng dịch vụ.

---

## 3. KIẾN TRÚC MICROSERVICES LÀ GÌ? (HÌNH DUNG ĐỜI THỰC)

Để hiểu kiến trúc của dự án, hãy so sánh 2 cách thức tổ chức:

* **Mô hình truyền thống (Monolith - Đơn khối):**
  * Giống như một **tiệm tạp hóa nhỏ chỉ có 1 người làm hết mọi việc**.
  * Chủ tiệm vừa tiếp khách, vừa vào sổ nợ, vừa đi chở hàng, vừa lau dọn.
  * **Nhược điểm:** Nếu người này bị ốm hoặc có việc bận, cả cửa hàng buộc phải đóng cửa ngừng hoạt động hoàn toàn.
* **Mô hình Microservices (Vi dịch vụ) của dự án này:**
  * Giống như một **công ty chuyên nghiệp được chia thành nhiều phòng ban độc lập**:
    * Phòng Tiếp tân (API Gateway).
    * Phòng Nhân sự/Bảo vệ (Identity).
    * Phòng Trưng bày/Đăng tin (Listing).
    * Phòng Hợp đồng (Rental).
    * Phòng Kế toán/Thu ngân (Payment).
    * Phòng Bưu điện/Phát thanh (Notification).
  * **Nguyên tắc "Két sắt riêng" (Database-per-service):** Mỗi phòng ban sở hữu một cơ sở dữ liệu riêng, không phòng nào được phép tự ý thọc tay vào két sắt của phòng khác. Muốn lấy thông tin, các phòng phải nhắn tin hoặc gọi điện trao đổi qua các kênh chuẩn hóa.
  * **Ưu điểm vượt trội:** Nếu phòng Bưu điện bị quá tải, khách hàng vẫn vào xem phòng và chuyển tiền bình thường mà không bị sập cả hệ thống.

---

## 4. BẢN ĐỒ CHI TIẾT CÁC "PHÒNG BAN" (SERVICES) TRONG DỰ ÁN

Hệ thống được thiết kế chia nhỏ thành 8 - 9 dịch vụ độc lập:

| Tên Dịch Vụ | Cổng mạng (Port) | Đóng vai trò là gì? | Nhiệm vụ chi tiết |
| :--- | :---: | :--- | :--- |
| **api-gateway** | `8080` | **Quầy lễ tân / Cửa đón tiếp duy nhất** | Điểm tiếp nhận duy nhất cho toàn bộ người dùng bên ngoài (Web, App). Nhận diện khách hàng và điều hướng yêu cầu đến đúng phòng ban chức năng. |
| **identity** | `3001` | **Phòng cấp thẻ nhân viên & Bảo vệ** | Quản lý đăng ký, đăng nhập tài khoản, bảo mật mật khẩu, cấp "thẻ ra vào điện tử" (JWT token), phân quyền (khách thuê, chủ nhà hay quản trị viên). |
| **listing** | `3002` | **Gian hàng trưng bày & Đăng tin** | Quản lý tin đăng phòng: giá tiền, diện tích, tiện ích, ảnh chụp, đặc biệt là **tọa độ địa lý GPS** (kinh độ, vĩ độ) để tìm kiếm phòng quanh đây. |
| **rental** | `3003` | **Phòng quản lý hợp đồng thuê** | Lập hợp đồng thuê, thỏa thuận tiền cọc, theo dõi chu kỳ thuê, trạng thái hợp đồng (chờ cọc, đang thuê, đã kết thúc). |
| **payment** | `3004` | **Phòng kế toán & Thu ngân** | Quản lý tiền bạc: ví cọc trung gian (Escrow), tạo mã QR thanh toán ngân hàng, xác nhận đã nhận tiền, giải ngân cho chủ nhà hoặc hoàn cọc cho khách. |
| **notification** | `3005` | **Bưu điện & Loa phát thanh** | Gửi email, tin nhắn SMS, thông báo trên ứng dụng điện thoại (Push Notification) mỗi khi có thông tin quan trọng. |
| **assistant** | `3006` | **Trợ lý tư vấn thông minh (AI)** | Chatbot AI thông minh, hỗ trợ hỏi đáp, đọc hiểu mong muốn của khách để đề xuất những phòng trọ phù hợp nhất. |
| **maintenance** *(tùy chọn)* | `3007` | **Đội bảo trì & Sửa chữa** | Tiếp nhận phản ánh hư hỏng thiết bị từ người thuê (hỏng máy giặt, chập điện), điều phối thợ đến sửa chữa. |
| **mobility** *(tùy chọn)* | `3008` | **Bộ phận tính toán giao thông** | Đo đạc khoảng cách và thời gian di chuyển từ phòng trọ đến trường học, văn phòng làm việc. |

---

## 5. CÁC "CỖ MÁY NGẦM" BÊN DƯỚI (HẠ TẦNG DATABASE & DỊCH VỤ NỀN)

Để các phòng ban hoạt động được, dự án trang bị các "cỗ máy ngầm" chuyên dụng, được quản lý qua Docker:

1. **PostgreSQL 16 (kèm tiện ích mở rộng PostGIS):**
   * *Bản chất:* Cơ sở dữ liệu quan hệ dạng bảng biểu chặt chẽ, an toàn hàng đầu thế giới.
   * *Phân bổ:* Dùng cho `identity_db`, `listing_db`, `rental_db`, `payment_db`. Mỗi DB có tài khoản đăng nhập riêng biệt.
   * *Điểm đặc biệt:* Có cài sẵn **PostGIS** giúp xử lý bản đồ không gian cực nhanh (tính toán khoảng cách kilomet giữa phòng trọ và vị trí của bạn).
2. **MongoDB 7.0:**
   * *Bản chất:* Cơ sở dữ liệu tài liệu linh hoạt (NoSQL).
   * *Phân bổ:* Dùng cho `notification_db` và `maintenance_db`, nơi dữ liệu thư từ và báo cáo sửa chữa biến đổi đa dạng.
3. **Redis 7.4:**
   * *Bản chất:* Bộ nhớ tạm cực nhanh trên RAM.
   * *Tác dụng:* Lưu phiên đăng nhập, bộ nhớ đệm (cache) giúp máy tính trả lời câu hỏi của người dùng trong một phần nghìn giây.
4. **RabbitMQ 3.13 (Bưu cục chuyển phát thư từ):**
   * *Bản chất:* Hàng đợi tin nhắn bất đồng bộ giữa các phòng ban.
   * *Ví dụ:* Khi phòng `payment` nhận được tiền cọc, nó quẳng một lá thư `payment.deposited` vào RabbitMQ. RabbitMQ lập tức tự động đưa lá thư đó cho `rental` (để chốt hợp đồng) và `notification` (để gửi email cho người thuê).
5. **Silo (Kho lưu trữ S3 Object Storage):**
   * *Bản chất:* Kho chuyên lưu file dung lượng lớn tương thích chuẩn Amazon S3.
   * *Tác dụng:* Lưu trữ ảnh chụp thực tế của phòng trọ, file hợp đồng thuê đã ký, ảnh chụp biên lai chuyển tiền.
6. **Elasticsearch & Kibana (ELK Stack):**
   * *Bản chất:* Cỗ máy tìm kiếm văn bản tốc độ cao và màn hình hiển thị trực quan.
7. **Docker & Docker Compose:**
   * *Bản chất:* Trình đóng gói môi trường ảo. Bạn không cần tự cài Postgres, Redis, RabbitMQ lên Windows (rất dễ lỗi); Docker tự tạo ra những "chiếc hộp cách ly" và khởi động tất cả chỉ bằng 1 câu lệnh.

---

## 6. MỔ XẺ CHI TIẾT TỪNG TÍ MỘ CẤU TRÚC THƯ MỤC & CÁC FILE

Dưới đây là cấu trúc toàn bộ dự án:

```text
Realestate_Microservice/
├── .github/                 # Cấu hình kiểm tra code tự động trên GitHub (CI/CD)
├── contracts/               # "Bản hợp đồng kỹ thuật" giữa các dịch vụ
│   ├── events/              # Cấu trúc mẫu của các bức thư gửi qua RabbitMQ
│   └── openapi/             # Tài liệu mô tả các cổng API đón khách (REST)
├── docs/                    # Thư mục chứa toàn bộ tài liệu hướng dẫn
│   ├── adr/                 # Ghi chép quyết định kỹ thuật lớn (Architecture Decision Records)
│   ├── architecture/        # Sơ đồ bản vẽ thiết kế kiến trúc hệ thống
│   └── runbook/             # Cẩm nang xử lý sự cố khi chạy ứng dụng thực tế
├── infra/                   # Toàn bộ mã nguồn thiết lập hạ tầng máy chủ ảo (Docker)
│   ├── compose/             # File docker-compose và script khởi tạo tài khoản database
│   ├── elk/                 # Cấu hình máy chủ Elasticsearch & Kibana
│   ├── rabbitmq/            # Bản đồ phân luồng đường thư của RabbitMQ
│   └── scripts/             # Công cụ kiểm tra sức khỏe hạ tầng tự động
├── services/                # Nơi sẽ chứa code của các microservices (NestJS)
├── .editorconfig            # Quy ước khoảng cách hiển thị mã nguồn giữa các phần mềm code
├── .env.example             # Bảng mẫu danh sách các biến môi trường và mật khẩu mẫu
├── .env                     # Bảng mật khẩu thực tế máy bạn đang chạy (bảo mật, không đưa lên mạng)
├── .gitignore               # Danh sách những file không được tải lên GitHub
├── .nvmrc                   # Khóa phiên bản Node.js (dự án chạy Node 22 LTS)
├── .prettierrc              # Bộ quy tắc tự động căn lề, format code cho đẹp mắt
├── eslint.config.mjs        # Bộ kiểm tra và cảnh báo lỗi chính tả, sai sót cú pháp code
├── package.json             # File quản lý thông tin dự án, thư viện dùng chung và các lệnh chạy
├── pnpm-lock.yaml           # Bản khóa cứng phiên bản chính xác của từng thư viện
├── pnpm-workspace.yaml      # Khai báo Monorepo (quản lý nhiều service con cùng lúc)
├── README.md                # Hướng dẫn chính của dự án bằng tiếng Việt
└── tsconfig.base.json       # Bộ quy chuẩn biên dịch mã nguồn ngôn ngữ TypeScript
```

### Điểm danh chi tiết các file cốt lõi:

* **`pnpm-workspace.yaml`**:
  * Định nghĩa dự án hoạt động theo mô hình **Monorepo** (`packages: - 'services/*'`). Toàn bộ 8-9 services nằm chung một nơi, chia sẻ chung các bộ quy tắc chuẩn nhưng vẫn có thể phát triển và đóng gói độc lập.
* **`package.json`**:
  * Là "bảng điều khiển trung tâm" của dự án. Khai báo các câu lệnh tắt cực kỳ tiện dụng:
    * `pnpm infra:up`: Bật toàn bộ database, redis, rabbitmq, s3.
    * `pnpm infra:check`: Chạy script tự động kiểm tra xem các database đã chạy sẵn sàng chưa.
    * `pnpm infra:down`: Tắt hạ tầng an toàn mà không làm mất dữ liệu.
* **`infra/compose/docker-compose.yml`**:
  * "Bản thiết kế kỹ thuật số" quy định chi tiết cấu hình chạy của Postgres, Redis, RabbitMQ, MongoDB, Silo (S3), Elasticsearch, Kibana. Quy định rõ ràng cổng kết nối (Port), mật khẩu và cách thức lưu trữ dữ liệu bền vững (Volume).
* **`infra/rabbitmq/definitions.json`**:
  * Định nghĩa sẵn các "ngã rẽ phân loại thư" (`domain.events`) và các "hộp thư chờ" (`listing.indexer`, `notification.events`, `rental.payment-events`), kèm theo cả hộp thư hứng lỗi (DLQ - Dead Letter Queue).
* **`infra/compose/postgres/init/01-create-databases.sh` & `mongo/init/01-create-users.sh`**:
  * Các kịch bản tự động chạy khi khởi tạo database lần đầu: Tạo sẵn các database con (`identity_db`, `listing_db`, `rental_db`, `payment_db`), cấp quyền chặt chẽ từng user riêng biệt để đảm bảo không ai đọc trộm dữ liệu của ai.
* **`infra/scripts/check-infra.ps1` (PowerShell) / `check-infra.sh` (Bash)**:
  * Đoạn mã tự động kiểm tra: gõ cửa từng dịch vụ, in ra màn hình `OK` màu xanh nếu dịch vụ sống khỏe, hoặc `FAIL` màu đỏ kèm giải thích nếu gặp sự cố.

