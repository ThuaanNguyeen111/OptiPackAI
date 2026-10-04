<div align="center">

# OptiPackAI

**Nền tảng vận hành đơn hàng đa kênh và tối ưu đóng gói cho doanh nghiệp bán hàng trực tuyến**

Đồng bộ đơn từ sàn thương mại điện tử · Gộp đơn theo người nhận · Quản lý kho theo vị trí · Đề xuất đóng gói tối ưu · Giao hàng và đổi trả khép kín

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey?style=flat-square)](#giấy-phép)

**Mã dự án:** `AOFP` · **Nhóm:** `FA26SE036` · **Thời gian:** 09/2026 – 03/2027 · **Giảng viên hướng dẫn:** Thân Thị Ngọc Vân

</div>

---

## Giới thiệu

OptiPackAI là hệ thống quản lý nội bộ dành cho doanh nghiệp bán hàng trên nhiều kênh thương mại điện tử. Hệ thống tập trung đơn hàng từ các sàn về một nơi, tự động gộp các đơn của cùng một người nhận để đóng chung một kiện, điều phối toàn bộ quy trình kho từ lấy hàng, đóng gói đến giao hàng, và đồng bộ trạng thái xử lý ngược lại sàn.

Trọng tâm của dự án là **giảm chi phí đóng gói và vận chuyển**: chọn đúng kích thước thùng và vật liệu đệm cho từng kiện, tái sử dụng vật liệu thu hồi, và rút ngắn quãng đường lấy hàng trong kho.

### Điểm nổi bật

- **Đồng bộ đơn hàng tự động** từ Lazada qua Lazada Open Platform (OAuth 2.0, tự làm mới token, đồng bộ định kỳ), kiến trúc adapter sẵn sàng mở rộng thêm sàn.
- **Gộp đơn theo người nhận** — các đơn cùng sàn, cùng người nhận và địa chỉ được xử lý thành một nhóm đơn, một kiện hàng.
- **Quản lý kho theo vị trí** — mã vị trí 5 cấp, một SKU có thể nằm ở nhiều ô, Picking List sắp theo lộ trình di chuyển, sổ cái biến động tồn bất biến.
- **Giữ chỗ tồn kho theo SKU nội bộ** — gộp tồn của cùng một sản phẩm đăng trên nhiều sàn, phát hiện thiếu hàng ngay khi đơn về.
- **Đề xuất đóng gói** — gợi ý kích thước thùng và vật liệu đệm theo kích thước, khối lượng và độ dễ vỡ của hàng; nhân viên duyệt, điều chỉnh hoặc từ chối.
- **Quản lý vật liệu đóng gói** — tồn vật liệu mới và tái sử dụng, tự trừ khi đóng gói, thu hồi khi hàng hoàn, thống kê chi phí tiết kiệm.
- **Giao hàng, đổi trả khép kín** — vận đơn tự giao, giới hạn số lần giao, cảnh báo quá hạn; phiếu trả hàng có kiểm định, hàng cách ly và đơn đổi hàng.
- **Báo trạng thái đóng gói về sàn** — xác nhận "đã đóng gói" trên OptiPack được gửi lên Lazada qua Fulfillment API.

---

## Mục lục

- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Quy trình nghiệp vụ](#quy-trình-nghiệp-vụ)
- [Chức năng theo phân hệ](#chức-năng-theo-phân-hệ)
- [Vai trò người dùng](#vai-trò-người-dùng)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Bắt đầu](#bắt-đầu)
- [Tài liệu](#tài-liệu)
- [Quy trình phát triển](#quy-trình-phát-triển)
- [Định hướng phát triển](#định-hướng-phát-triển)
- [Nhóm phát triển](#nhóm-phát-triển)
- [Giấy phép](#giấy-phép)

---

## Kiến trúc hệ thống

Backend được xây dựng theo mô hình **modular monolith**: một ứng dụng NestJS duy nhất, mỗi nghiệp vụ là một module độc lập với ranh giới rõ ràng. Kết nối sàn thương mại điện tử đi qua lớp **adapter** chuẩn hóa, nên dữ liệu bên trong hệ thống không phụ thuộc vào định dạng riêng của từng sàn.

```mermaid
flowchart LR
    subgraph Channels["Kênh bán hàng"]
        LZ[Lazada Open Platform]
        AU[AURELLE · Open API<br/>app key + webhook]
    end

    subgraph Backend["OptiPackAI Backend · NestJS"]
        MI[Marketplace Integration<br/>OAuth · Adapter]
        OR[Orders<br/>Đồng bộ đơn]
        OG[Order Groups<br/>Gộp đơn · Fulfillment]
        WH[Warehouse<br/>Vị trí · Tồn kho · Picking]
        PK[Packing<br/>Kế hoạch đóng gói 3D]
        PM[Packaging Materials<br/>Kho thùng + vật tư · Tái sử dụng]
        SH[Shipments · Shipping<br/>Giao hàng · Hãng/cước · Đổi trả]
        DOC[Documents<br/>Phiếu · Nhãn · Bảng kê PDF]
        NT[Notifications]
    end

    subgraph Data["Lưu trữ"]
        DB[(MongoDB Atlas)]
        RD[(Redis)]
    end

    subgraph Clients["Giao diện"]
        WEB[Web Dashboard · React]
        APP[Mobile App · Flutter]
    end

    LZ <-->|đồng bộ đơn · báo đóng gói| MI
    AU <-->|đồng bộ đơn · webhook| MI
    PK -.->|CP-SAT chứng minh| PKR[packer · Python OR-Tools]
    MI --> OR --> OG
    OG --> WH
    OG --> PK --> PM
    OG --> SH --> DOC
    OG --> NT
    Backend --> DB
    Backend --> RD
    WEB --> Backend
    APP --> Backend
```

---

## Quy trình nghiệp vụ

```mermaid
flowchart LR
    A[Đơn mới từ sàn] --> B[Gộp theo người nhận]
    B --> C[Giữ chỗ tồn kho]
    C --> D[Lấy hàng theo Picking List]
    D --> E[Tự tính kế hoạch đóng gói 3D<br/>BRKGA + CP-SAT]
    E --> F[Duyệt / đổi thùng / chuyển món]
    F --> G[Đóng gói · trừ vật liệu<br/>báo trạng thái về sàn]
    G --> H[Giao hàng · chọn hãng, cước<br/>giao chung chuyến]
    H --> I[Giao thành công]
    H --> J[Hoàn hàng · đổi trả<br/>kiểm định · nhập lại kho]
```

Mọi bước chuyển trạng thái của nhóm đơn đều được kiểm soát bằng bảng chuyển trạng thái hợp lệ và khóa phiên bản (optimistic concurrency), bảo đảm nhiều nhân viên thao tác đồng thời không ghi đè lên nhau.

---

## Chức năng theo phân hệ

| Phân hệ                    | Chức năng chính                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Xác thực & người dùng**  | Đăng nhập JWT với xoay vòng refresh token, xác thực hai lớp (TOTP, mã dự phòng), thiết bị tin cậy, đăng nhập Google, bắt buộc đổi mật khẩu lần đầu, nhật ký đăng nhập, giới hạn tần suất truy cập |
| **Kết nối sàn**            | Ủy quyền OAuth 2.0, mã hóa token khi lưu, tự làm mới token sắp hết hạn, adapter riêng cho từng sàn. Lazada + AURELLE (Open API tương thích Lazada, kết nối bằng app key, webhook có chữ ký) |
| **Đơn hàng**               | Đồng bộ định kỳ và đồng bộ theo yêu cầu, chuẩn hóa trạng thái đơn, theo dõi yêu cầu hủy từ người mua                                                                                              |
| **Nhóm đơn & fulfillment** | Gộp đơn theo người nhận, phân công nhân viên tự động, đơn hỏa tốc với hạn xử lý theo giờ làm việc, báo thiếu hàng, xác nhận đóng gói và đồng bộ trạng thái lên sàn                                |
| **Kho hàng**               | Nhiều kho, khu, kệ, ô với mã vị trí 5 cấp; quy định danh mục, cỡ, màu cho từng ô; gợi ý ô cất hàng; nhập hàng, kiểm kê, chuyển ô; sổ cái biến động tồn; Picking List theo lộ trình                |
| **SKU & tồn kho**          | SKU nội bộ liên kết SKU trên các sàn, danh mục và bảng màu chuẩn, giữ chỗ tồn kho theo nhóm đơn, cảnh báo thiếu hàng                                                                              |
| **Đóng gói**               | Tự tính kế hoạch đóng gói 3D cho cả nhóm đơn (nhiều kiện/đơn) bằng BRKGA, chứng minh tối ưu bằng CP-SAT cho đơn nhỏ; chỉ dùng số đo SKU do kho xác nhận; màn làm việc 3D, đổi thùng, chuyển món, hướng dẫn đóng gói từng bước bằng AI, cân từng kiện |
| **Vật liệu đóng gói**      | Danh mục vật liệu có đơn giá, tồn mới / tái sử dụng / nội bộ, tự trừ khi đóng gói, thu hồi khi kiểm hàng hoàn, thống kê chi phí tiết kiệm                                                         |
| **Giao hàng & đổi trả**    | Vận đơn tự giao, tối đa hai lần giao, cảnh báo quá hạn; chọn hãng + báo cước theo kiện thật (bảng cước mẫu), giao chung chuyến cho cùng người nhận, lịch lấy hàng; phiếu đóng gói, nhãn từng kiện, bảng kê chuyến (PDF); phiếu trả hàng có kiểm định, tự tạo đơn đổi hàng |
| **Thông báo**              | Thông báo trong ứng dụng cho các sự kiện giao thất bại, quá hạn giao, yêu cầu trả hàng, thiếu hàng                                                                                                |

---

## Vai trò người dùng

| Vai trò                  | Phạm vi công việc                                                    |
| ------------------------ | -------------------------------------------------------------------- |
| **Admin**                | Quản trị người dùng, cấu hình kho, kết nối sàn, toàn quyền hệ thống  |
| **Store Owner**          | Theo dõi vận hành, duyệt trả hàng, ưu tiên đơn, xem thống kê chi phí |
| **Warehouse Staff**      | Lấy hàng, nhập hàng, kiểm kê, chuyển ô, nhận và kiểm hàng hoàn       |
| **Packaging Staff**      | Duyệt / chỉnh kế hoạch đóng gói, đóng gói, cân và xác nhận hoàn tất  |
| **Shipping Coordinator** | Tạo vận đơn, cập nhật kết quả giao hàng                              |

---

## Công nghệ sử dụng

| Lớp               | Công nghệ                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**       | NestJS 11, TypeScript 5, Mongoose 9, Passport JWT, class-validator, `@nestjs/schedule`, `@nestjs/throttler`, Swagger / OpenAPI, Helmet, Nodemailer, otplib |
| **Cơ sở dữ liệu** | MongoDB Atlas (replica set, hỗ trợ transaction), Redis (bộ nhớ đệm và trạng thái tạm)                                                                      |
| **Frontend**      | React 18, Vite, TypeScript                                                                                                                                 |
| **Mobile**        | Flutter                                                                                                                                                    |
| **Tích hợp**      | Lazada Open Platform (Order API, Fulfillment API), Google OAuth 2.0, SMTP                                                                                  |
| **Chất lượng mã** | Jest, ESLint, Prettier, Husky, Commitlint                                                                                                                  |
| **Hạ tầng**       | Docker, Docker Compose, npm workspaces                                                                                                                     |

---

## Cấu trúc mã nguồn

```
OptiPackAI/
├── be/                              Backend · NestJS
│   ├── src/
│   │   ├── common/                  Bộ lọc lỗi, guard, interceptor, tiện ích dùng chung, Redis
│   │   ├── config/                  Cấu hình theo namespace (database, jwt, mail, marketplace…)
│   │   └── modules/
│   │       ├── auth/                Đăng nhập, MFA, Google OAuth, phân quyền
│   │       ├── users/               Quản lý người dùng
│   │       ├── marketplace-integration/  OAuth sàn, adapter Lazada
│   │       ├── orders/              Đồng bộ và chuẩn hóa đơn hàng
│   │       ├── order-groups/        Gộp đơn, fulfillment, phân công, giữ chỗ tồn, báo đóng gói về sàn
│   │       ├── warehouse/           Kho, khu, kệ, ô, tồn theo vị trí, Picking List
│   │       ├── master-skus/         SKU nội bộ và liên kết SKU sàn
│   │       ├── categories/          Danh mục sản phẩm, bảng màu
│   │       ├── product-master/      Thông số kích thước, khối lượng sản phẩm
│   │       ├── packing/             Kế hoạch đóng gói 3D (BRKGA, CP-SAT, packing_plans)
│   │       ├── packaging/           Engine hình học, danh mục thùng/túi zip/vật tư, hướng dẫn AI
│   │       ├── packaging-materials/ Vật liệu đóng gói, tái sử dụng
│   │       ├── shipments/           Vận đơn, giao hàng, giao chung chuyến, trả hàng, đổi hàng
│   │       ├── shipping/            Hãng vận chuyển, bảng cước, báo giá
│   │       ├── documents/           Phiếu đóng gói, nhãn, bảng kê (PDF)
│   │       ├── marketplace-webhooks/ Nhận webhook sàn (AURELLE)
│   │       ├── storefront/          Website bán hàng AURELLE
│   │       ├── notifications/       Thông báo trong ứng dụng
│   │       └── mail/                Gửi email
│   ├── scripts/                     Khởi tạo tài khoản quản trị, script chuyển đổi dữ liệu
│   └── test/                        Kiểm thử end-to-end
├── fe/                              Frontend · React + Vite
├── storefront/                      Website AURELLE + cổng nhà phát triển · Next.js
├── packer/                          Microservice CP-SAT · Python OR-Tools
├── mobile/                          Mobile App · Flutter
├── GUIDE_DOC/                       Tài liệu tích hợp API và kịch bản trình diễn
├── docker-compose.yml
└── package.json                     npm workspaces (be, fe)
```

---

## Bắt đầu

### Yêu cầu

| Công cụ                 | Phiên bản                                           |
| ----------------------- | --------------------------------------------------- |
| Node.js                 | ≥ 20                                                |
| npm                     | ≥ 10                                                |
| Git                     | mới nhất                                            |
| Docker & Docker Compose | mới nhất (tùy chọn, cho dịch vụ cục bộ)             |
| Redis                   | Redis hoặc tương thích (Memurai trên Windows)       |
| MongoDB                 | Cụm MongoDB Atlas (cần replica set cho transaction) |

### Cài đặt

```bash
# 1. Lấy mã nguồn
git clone https://github.com/ThuaanNguyeen111/OptiPackAI.git
cd OptiPackAI

# 2. Cài đặt thư viện cho toàn bộ workspace (chỉ chạy ở thư mục gốc)
npm install

# 3. Tạo file cấu hình môi trường
cp be/.env.example be/.env
cp fe/.env.example fe/.env

# 4. Khởi tạo tài khoản quản trị đầu tiên
cd be && npm run seed:admin && cd ..

# 5. Chạy môi trường phát triển (Backend + Frontend)
npm run dev
```

| Dịch vụ     | Địa chỉ                          |
| ----------- | -------------------------------- |
| Backend API | `http://localhost:3000`          |
| Swagger UI  | `http://localhost:3000/api/docs` |
| Frontend    | `http://localhost:5173`          |

### Biến môi trường chính (`be/.env`)

| Nhóm                 | Biến                                                                                  | Mô tả                                                         |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ứng dụng             | `PORT`, `CORS_ORIGIN`, `FRONTEND_URL`                                                 | Cổng chạy, nguồn được phép gọi API, địa chỉ giao diện         |
| Cơ sở dữ liệu        | `MONGODB_URI`                                                                         | Chuỗi kết nối MongoDB Atlas                                   |
| Redis                | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`                                          | Kết nối Redis                                                 |
| Xác thực             | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Khóa ký và thời hạn token                                     |
| Google OAuth         | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`                     | Đăng nhập bằng Google                                         |
| Email                | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`           | Máy chủ SMTP                                                  |
| Bảo mật              | `TOKEN_ENCRYPTION_KEY`                                                                | Khóa mã hóa token sàn khi lưu                                 |
| Lazada               | `LAZADA_APP_KEY`, `LAZADA_APP_SECRET`, `LAZADA_REDIRECT_URI`, `LAZADA_API_BASE_URL`   | Thông tin ứng dụng trên Lazada Open Platform                  |
| Lazada (ghi lên sàn) | `LAZADA_WRITE_APIS_ENABLED`, `LAZADA_SHIPPING_ALLOCATE_TYPE`                          | Bật/tắt các thao tác ghi lên shop; tham số phân bổ vận chuyển |

Danh sách đầy đủ kèm giá trị mẫu có trong `be/.env.example`.

> [!TIP]
> Lazada yêu cầu địa chỉ callback OAuth dạng HTTPS công khai. Khi phát triển cục bộ, dùng một đường hầm HTTPS (ví dụ `ngrok http --url=<domain-cố-định> 3000`) và khai báo địa chỉ đó cho `LAZADA_REDIRECT_URI`.

### Lệnh thường dùng

| Lệnh (thư mục gốc)                           | Mô tả                                |
| -------------------------------------------- | ------------------------------------ |
| `npm run dev`                                | Chạy Backend và Frontend             |
| `npm run dev:be` / `npm run dev:fe`          | Chạy riêng từng phần                 |
| `npm run build`                              | Build toàn bộ                        |
| `npm run lint`                               | Kiểm tra mã nguồn                    |
| `npm run test`                               | Chạy kiểm thử Backend                |
| `npm run docker:dev` / `npm run docker:down` | Bật / tắt dịch vụ cục bộ bằng Docker |

| Lệnh (thư mục `be/`)                | Mô tả                                |
| ----------------------------------- | ------------------------------------ |
| `npm run start:dev`                 | Chạy Backend với hot-reload          |
| `npm run test` / `npm run test:cov` | Kiểm thử đơn vị / báo cáo độ bao phủ |
| `npm run test:e2e`                  | Kiểm thử end-to-end                  |
| `npm run seed:admin`                | Tạo tài khoản quản trị               |

---

## Tài liệu

Swagger UI (`/api/docs`) là nguồn tham chiếu chính thức cho request và response của từng endpoint. Các route không dùng tiền tố phiên bản, ví dụ `POST /auth/login`.

Tài liệu tích hợp chi tiết nằm trong `GUIDE_DOC/`, mỗi tài liệu gồm luồng nghiệp vụ, ví dụ request/response, bảng mã lỗi và hướng dẫn kiểm thử:

| Tài liệu                                                                                           | Phạm vi                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`API_LIST.md`](GUIDE_DOC/API_LIST.md)                                                             | Danh sách toàn bộ endpoint kèm vai trò được phép        |
| [`INTEGRATION_GUIDE.md`](GUIDE_DOC/INTEGRATION_GUIDE.md)                                           | Xác thực và người dùng                                  |
| [`INTEGRATION_GUIDE_ORDERS.md`](GUIDE_DOC/INTEGRATION_GUIDE_ORDERS.md)                             | Kết nối sàn và đơn hàng                                 |
| [`INTEGRATION_GUIDE_FULFILLMENT.md`](GUIDE_DOC/INTEGRATION_GUIDE_FULFILLMENT.md)                   | Nhóm đơn, lấy hàng, đóng gói, báo trạng thái về sàn     |
| [`INTEGRATION_GUIDE_WAREHOUSE.md`](GUIDE_DOC/INTEGRATION_GUIDE_WAREHOUSE.md)                       | Kho, vị trí, tồn kho, Picking List                      |
| [`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`](GUIDE_DOC/INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md)           | SKU nội bộ và giữ chỗ tồn kho                           |
| [`INTEGRATION_GUIDE_SHIPPING.md`](GUIDE_DOC/INTEGRATION_GUIDE_SHIPPING.md)                         | Giao hàng và trả hàng                                   |
| [`INTEGRATION_GUIDE_PACKAGING_MATERIALS.md`](GUIDE_DOC/INTEGRATION_GUIDE_PACKAGING_MATERIALS.md)   | Vật liệu đóng gói và tái sử dụng                        |
| [`INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md`](GUIDE_DOC/INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md) | Tiện ích vận hành: quá hạn giao, hàng cách ly, đổi hàng |
| [`DEMO_PLAYBOOK.md`](GUIDE_DOC/DEMO_PLAYBOOK.md)                                                   | Kịch bản trình diễn toàn hệ thống                       |

---

## Quy trình phát triển

### Nhánh

```
main                        Mã nguồn ổn định
 └─ feature/<tên>           Nhánh tính năng, tạo từ main, hợp nhất qua Pull Request
```

### Quy ước commit

Theo [Conventional Commits](https://www.conventionalcommits.org), phạm vi (scope) là mã ticket Jira. Quy ước được kiểm tra tự động bởi Commitlint.

```
<type>(AOFP-<số>): <mô tả ngắn, viết thường>
```

```
feat(AOFP-48): pool stock by master sku with fallback and add stock reservation
fix(AOFP-15): resolve duplicate order detection
docs(AOFP-49): add operations utilities guide and end-to-end demo playbook
```

Type hợp lệ: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`.

### Kiểm tra trước khi hợp nhất

- Husky chạy kiểm thử tự động trước mỗi lần commit.
- Pull Request cần ít nhất một thành viên duyệt.
- Mã nguồn phải vượt qua `tsc`, ESLint và toàn bộ kiểm thử trước khi hợp nhất.

---

## Định hướng phát triển

- **Mở rộng kênh bán hàng** — kết nối thêm sàn thông qua lớp adapter hiện có, bao gồm sàn thương mại điện tử AURELLE do nhóm xây dựng.
- **Gộp kiện liên sàn** — các đơn trên nhiều sàn của cùng một người nhận được lấy hàng cùng lúc và giao trong một chuyến.
- **Đồng bộ tồn kho hai chiều** — cập nhật tồn khả dụng từ kho OptiPack lên các sàn khi có nhập hàng, kiểm kê hoặc đổi trả.
- **Mô hình AI xếp hàng 3D** — nâng cấp đề xuất đóng gói bằng thuật toán xếp hàng ba chiều cho đơn nhiều sản phẩm.
- **Ước tính chi phí vận chuyển** — tính trước phí đóng gói và cước giao hàng cho từng kiện.
- **Ứng dụng di động cho nhân viên kho** — quét mã QR/Barcode khi lấy hàng, cất hàng và đóng gói.
- **Dashboard phân tích** — năng suất kho, tỷ lệ tái sử dụng vật liệu, chi phí logistics theo thời gian.
- **Vòng đời đơn đầy đủ trên sàn** — đồng bộ các trạng thái sẵn sàng giao, đã giao và hoàn hàng về sàn.

---

## Nhóm phát triển

| Vai trò               | Thành viên             | Liên hệ                     |
| --------------------- | ---------------------- | --------------------------- |
| Giảng viên hướng dẫn  | Thân Thị Ngọc Vân      | vanttn@fpt.edu.vn           |
| Trưởng nhóm · Backend | Nguyễn Phương Mỹ Thuận | ThuanNPMSE171113@fpt.edu.vn |
| Backend Developer     | Lê Đức Trung Thi       | thildtde180553@fpt.edu.vn   |
| Frontend Developer    | Huỳnh Quốc Việt        | viethqse182482@fpt.edu.vn   |
| Frontend Developer    | Phan Huỳnh Hải Phượng  | haifuong2408@gmail.com      |

---

## Giấy phép

**UNLICENSED** — Phần mềm độc quyền, phát triển trong khuôn khổ Đồ án tốt nghiệp FA26SE036, Trường Đại học FPT. Không được sao chép, phân phối hoặc sử dụng khi chưa có sự cho phép của nhóm phát triển.
