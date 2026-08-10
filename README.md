<div align="center">

<img src="https://img.shields.io/badge/-OptiPackAI-6E56CF?style=for-the-badge" alt="OptiPackAI" height="40"/>

# 📦 OptiPackAI

### AI-Assisted Omnichannel Order Fulfillment & Packaging Optimization System

_Đồng bộ đơn hàng đa kênh — Tối ưu đóng gói bằng AI — Cắt giảm chi phí logistics_

<br/>

[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Flutter](https://img.shields.io/badge/Flutter-Mobile-02569B.svg?style=flat-square&logo=flutter&logoColor=white)](https://flutter.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248.svg?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg?style=flat-square)](#-đóng-góp)

**Project code:** `AOFP` &nbsp;·&nbsp; **Group:** `FA26SE036` &nbsp;·&nbsp; **Duration:** 09/2026 – 03/2027 &nbsp;·&nbsp; **Supervisor:** Thân Thị Ngọc Vân

</div>

<br/>

> [!NOTE]
> Đây là hệ thống quản lý **nội bộ** (internal tool) cho một doanh nghiệp bán hàng đa kênh, không phải sản phẩm SaaS đa khách thuê.

---

## 📋 Mục lục

<table>
<tr>
<td valign="top" width="33%">

**Giới thiệu**

- [Bài toán & Giải pháp](#-bài-toán--giải-pháp)
- [Tính năng chính](#-tính-năng-chính)
- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)

</td>
<td valign="top" width="33%">

**Kỹ thuật**

- [Tech Stack](#-tech-stack)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Bắt đầu](#-bắt-đầu)
- [Scripts](#-scripts)

</td>
<td valign="top" width="33%">

**Vận hành**

- [Môi trường](#-môi-trường)
- [API Docs](#-api-documentation)
- [Git Workflow](#-git-workflow)
- [Team](#-team)

</td>
</tr>
</table>

---

## 🎯 Bài toán & Giải pháp

<table>
<tr>
<th width="50%">❌ Hiện trạng</th>
<th width="50%">✅ OptiPackAI giải quyết</th>
</tr>
<tr>
<td>

Đơn hàng rời rạc trên nhiều sàn (Shopee, TikTok Shop...), nhân viên kho phải tự chuyển đổi qua lại giữa các hệ thống

</td>
<td>

Đồng bộ tự động, gộp đơn trùng lặp về **một dashboard duy nhất**

</td>
</tr>
<tr>
<td>

Đóng gói dựa cảm tính → ~15-20% đơn dùng thùng quá khổ, tốn thêm 10-15% phí ship

</td>
<td>

**AI 3D Bin Packing** gợi ý chính xác kích thước thùng & vật liệu đệm lót

</td>
</tr>
<tr>
<td>

Không có cái nhìn tổng quan về chi phí logistics theo thời gian thực

</td>
<td>

**Dashboard phân tích** chi phí đóng gói, ship, năng suất kho

</td>
</tr>
</table>

---

## ✨ Tính năng chính

|    #    | Tính năng                 | Mô tả                                                                           |
| :-----: | ------------------------- | ------------------------------------------------------------------------------- |
| `FE-01` | 🔄 **Đồng bộ đa kênh**    | Tự động lấy đơn hàng, tồn kho từ Shopee & TikTok Shop                           |
| `FE-02` | 🧩 **Gộp đơn thông minh** | Phát hiện & gộp đơn trùng lặp theo khách hàng/kho                               |
| `FE-03` | 🤖 **AI Packaging**       | 3D Bin Packing — gợi ý thùng & vật liệu, có xác nhận thủ công trước khi in nhãn |
| `FE-04` | 💰 **Ước tính chi phí**   | Tính phí đóng gói + cước vận chuyển trước khi giao                              |
| `FE-05` | 🏷️ **Sinh nhãn tự động**  | QR/Barcode, PDF phiếu đóng gói & tem vận chuyển                                 |
| `FE-06` | 📱 **Mobile App**         | Quét mã cập nhật picking/packing real-time                                      |
| `FE-07` | 📊 **Dashboard**          | Thống kê hiệu suất kho & chi phí logistics                                      |
| `FE-08` | 🔐 **Quản trị**           | User, phân quyền, cấu hình tham số AI                                           |

> **Phạm vi tích hợp:** Shopee + TikTok Shop _(Facebook Marketplace, Lazada nằm ngoài phạm vi đồ án)_

---

## 🏗 Kiến trúc hệ thống

```mermaid
flowchart LR
    subgraph Sources["Nguồn đơn hàng"]
        A[Shopee API]
        B[TikTok Shop API]
    end

    subgraph Core["OptiPackAI Backend · NestJS"]
        C[Order Sync & Consolidation]
        D[AI Packaging Engine]
        E[Shipping & Label Service]
        F[(MongoDB)]
    end

    subgraph Clients["Giao diện"]
        G[Web Dashboard · React]
        H[Mobile App · Flutter]
    end

    A -- webhook --> C
    B -- webhook --> C
    C --> F
    C --> D
    D --> E
    E --> F
    F --> G
    E -- QR/Barcode scan --> H
    H --> C
```

---

## 🛠 Tech Stack

<table>
<tr>
<td valign="top" width="25%">

**Backend**

- NestJS 11
- MongoDB 7 + Mongoose
- JWT + Passport
- Swagger/OpenAPI
- class-validator
- qrcode · bwip-js · pdfkit

</td>
<td valign="top" width="25%">

**Frontend**

- React 18
- Vite
- TypeScript 5

</td>
<td valign="top" width="25%">

**Mobile**

- Flutter
- QR/Barcode scanner
- Push notifications

</td>
<td valign="top" width="25%">

**DevOps**

- Docker + Compose
- Husky + lint-staged
- Commitlint
- Jest

</td>
</tr>
</table>

---

## 📁 Cấu trúc dự án

```
OptiPackAI/
├── 📂 be/                          Backend · NestJS
│   ├── src/
│   │   ├── common/                 Shared utilities, filters, interceptors
│   │   ├── config/                 Configuration files
│   │   └── modules/
│   │       ├── orders/                     🔄 Đồng bộ & gộp đơn hàng          FE-01 FE-02
│   │       ├── packaging/                  🤖 AI packaging recommendation    FE-03
│   │       ├── shipping/                   💰 Ước tính phí, tạo nhãn         FE-04 FE-05
│   │       ├── fulfillment/                📦 Picking/packing tracking      FE-06 FE-07
│   │       ├── marketplace-integration/    🔌 Connector Shopee, TikTok Shop
│   │       └── admin/                      🔐 User, role, AI config          FE-08
│   ├── test/
│   └── Dockerfile
│
├── 📂 fe/                          Frontend · React + Vite
├── 📂 mobile/                      Mobile App · Flutter
├── 📂 docker/
├── 📂 .husky/
├── 🐳 docker-compose.yml
└── 📦 package.json                 npm workspaces: be, fe
```

---

## 🚀 Bắt đầu

### Yêu cầu hệ thống

| Công cụ                 | Phiên bản |
| ----------------------- | --------- |
| Node.js                 | ≥ 20.0.0  |
| npm                     | ≥ 10.0.0  |
| Docker & Docker Compose | mới nhất  |
| Git                     | mới nhất  |

### Cài đặt

```bash
# 1️⃣ Clone repository
git clone https://github.com/ThuaanNguyeen111/OptiPackAI.git
cd OptiPackAI

# 2️⃣ Cài đặt dependencies
npm install
cd be && npm install
cd ../fe && npm install
cd ..

# 3️⃣ Cấu hình môi trường
cp .env.example .env
cp be/.env.example be/.env
cp fe/.env.example fe/.env

# 4️⃣ Khởi động MongoDB (Docker)
npm run docker:dev

# 5️⃣ Chạy development
npm run dev
```

<div align="center">

🟢 Backend: `http://localhost:3000` &nbsp;·&nbsp; 🔵 Frontend: `http://localhost:5173`

</div>

---

## 📜 Scripts

<details>
<summary><b>Root (Monorepo)</b></summary>
<br/>

| Script                | Mô tả                            |
| --------------------- | -------------------------------- |
| `npm run dev`         | Chạy cả Backend và Frontend      |
| `npm run dev:be`      | Chạy riêng Backend               |
| `npm run dev:fe`      | Chạy riêng Frontend              |
| `npm run build`       | Build cả Backend và Frontend     |
| `npm run lint`        | Lint toàn bộ project             |
| `npm run docker:dev`  | Khởi động MongoDB, Mongo Express |
| `npm run docker:down` | Dừng Docker containers           |

</details>

<details>
<summary><b>Backend</b></summary>
<br/>

| Script              | Mô tả                           |
| ------------------- | ------------------------------- |
| `npm run start:dev` | Development mode với hot-reload |
| `npm run build`     | Build production                |
| `npm run test`      | Chạy unit tests                 |
| `npm run test:cov`  | Test coverage                   |

</details>

---

## 🔐 Môi trường

<details>
<summary><b>Xem danh sách biến môi trường</b></summary>
<br/>

| Variable                                   | Mô tả                               |
| ------------------------------------------ | ----------------------------------- |
| `MONGODB_URI`                              | MongoDB connection string           |
| `JWT_SECRET`                               | JWT signing key                     |
| `CORS_ORIGIN`                              | Allowed CORS origins                |
| `SHOPEE_PARTNER_ID` / `SHOPEE_PARTNER_KEY` | Shopee Open API credentials         |
| `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET`     | TikTok Shop Partner API credentials |

</details>

| Service       | URL                         |
| ------------- | --------------------------- |
| MongoDB       | `mongodb://localhost:27017` |
| Mongo Express | `http://localhost:8081`     |

---

## 📚 API Documentation

<div align="center">

📖 Swagger UI: **`http://localhost:3000/api/docs`**

</div>

```http
POST   /api/v1/auth/login              # Đăng nhập
POST   /api/v1/orders/sync             # Đồng bộ đơn hàng từ sàn
GET    /api/v1/orders                  # Danh sách đơn hàng đã gộp
POST   /api/v1/packaging/recommend     # AI gợi ý đóng gói
GET    /api/v1/shipping/estimate       # Ước tính phí ship
POST   /api/v1/fulfillment/scan        # Cập nhật trạng thái picking/packing
```

---

## 🔄 Git Workflow

### Branch strategy

```
main        ← code ổn định, sẵn sàng release
 └─ develop  ← nhánh hội tụ tính năng đang phát triển
     └─ feature/AOFP-XX_ten-tinh-nang  ← nhánh tính năng, tạo từ develop
```

### Commit Message

Conventional Commits + mã ticket Jira đặt trong `scope`:

```bash
type(AOFP-12): mô tả ngắn gọn
```

```bash
✅ feat(AOFP-12): add Shopee webhook configuration
✅ fix(AOFP-15): resolve duplicate order detection bug
✅ docs(AOFP-20): update API documentation for packaging module
```

<sup>Type hợp lệ: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`</sup>

### Pull Request

- 🚫 Không push trực tiếp lên `main`/`develop`
- ✅ Bắt buộc ≥ 1 reviewer approve trước khi merge
- ✅ Phải pass Unit Test trước khi merge

---

## 🤝 Đóng góp

```bash
git checkout -b feature/AOFP-XX_ten-tinh-nang   # 1. Tạo nhánh từ develop
git commit -m "feat(AOFP-XX): mô tả thay đổi"    # 2. Commit theo convention
git push origin feature/AOFP-XX_ten-tinh-nang    # 3. Push
```

4. Tạo Pull Request vào `develop` → chờ ≥ 1 thành viên review & approve

---

## 👥 Team — FA26SE036

<div align="center">

|         Role          | Name                   | Email                       | Mobile     |
| :-------------------: | ---------------------- | --------------------------- | ---------- |
|     🎓 Supervisor     | Thân Thị Ngọc Vân      | vanttn@fpt.edu.vn           | 0912656836 |
|       👑 Leader       | Nguyễn Phương Mỹ Thuận | ThuanNPMSE171113@fpt.edu.vn | 0377168254 |
| ⚙️ Backend Developer  | Lê Đức Trung Thi       | thildtde180553@fpt.edu.vn   | 0905749864 |
| 🎨 Frontend Developer | Huỳnh Quốc Việt        | viethqse182482@fpt.edu.vn   | 0813076315 |
| 🎨 Frontend Developer | Phan Huỳnh Hải Phượng  | haifuong2408@gmail.com      | 0708639363 |

</div>

---

<div align="center">

## 📄 License

**UNLICENSED** — Proprietary software, phát triển trong khuôn khổ Capstone Project FA26SE036

<br/>

Made with 🧠 by **OptiPackAI Team**

</div>
