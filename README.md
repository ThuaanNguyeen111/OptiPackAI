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

Đơn hàng rời rạc trên nhiều sàn thương mại điện tử, nhân viên kho phải tự chuyển đổi qua lại giữa các hệ thống

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

Không biết chính xác hàng nằm ở đâu trong kho, nhân viên mất thời gian tìm kiếm

</td>
<td>

**Hệ thống vị trí kho (WMS)** — mỗi SKU gắn đúng 1 kệ, Picking List tự sắp xếp theo lộ trình di chuyển tối ưu

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

|    #    | Tính năng                 | Mô tả                                                                                           |                     Trạng thái                     |
| :-----: | ------------------------- | ----------------------------------------------------------------------------------------------- | :------------------------------------------------: |
| `FE-01` | 🔄 **Đồng bộ đa kênh**    | Tự động lấy đơn hàng từ marketplace, cron polling định kỳ                                       |                   🟢 Lazada xong                   |
| `FE-02` | 🧩 **Gộp đơn thông minh** | Phát hiện & gộp đơn trùng lặp theo khách hàng/địa chỉ, quản lý fulfillment theo nhóm            |                      🟢 Xong                       |
| `FE-03` | 🤖 **AI Packaging**       | 3D Bin Packing — gợi ý thùng & vật liệu, Packaging Staff xác nhận/điều chỉnh trước khi đóng gói | 🟡 Fallback đơn giản xong, AI thật đang phát triển |
| `FE-04` | 💰 **Ước tính chi phí**   | Tính phí đóng gói + cước vận chuyển trước khi giao                                              |                 🟡 Đang phát triển                 |
| `FE-05` | 🏷️ **Sinh nhãn tự động**  | QR/Barcode, PDF phiếu đóng gói & tem vận chuyển                                                 |                  ⬜ Chưa bắt đầu                   |
| `FE-06` | 📦 **Quản lý kho (WMS)**  | Vị trí kệ theo khu/dãy/tầng, theo dõi tồn kho, Picking List tối ưu lộ trình                     |                      🟢 Xong                       |
| `FE-07` | 📱 **Mobile App**         | Quét mã cập nhật picking/packing real-time, hỗ trợ nhập tay khi không quét được                 |    🟡 API sẵn sàng, Mobile App đang phát triển     |
| `FE-08` | 📊 **Dashboard**          | Thống kê hiệu suất kho & chi phí logistics                                                      |                  ⬜ Chưa bắt đầu                   |
| `FE-09` | 🔔 **Thông báo**          | Cảnh báo thiếu hàng, đơn bất thường, đơn trễ hạn qua nhiều kênh                                 |                  ⬜ Chưa bắt đầu                   |
| `FE-10` | 🔐 **Quản trị**           | User, phân quyền theo 5 vai trò, phân công nhân viên tự động                                    |                      🟢 Xong                       |

---

## 🏗 Kiến trúc hệ thống

```mermaid
flowchart LR
    subgraph Sources["Nguồn đơn hàng"]
        A[Marketplace API]
    end

    subgraph Core["OptiPackAI Backend · NestJS (modular monolith)"]
        C[Order Sync & Consolidation]
        D[AI Packaging Engine]
        W[Warehouse & Picking]
        E[Shipping & Label Service]
        F[(MongoDB)]
    end

    subgraph Clients["Giao diện"]
        G[Web Dashboard · React]
        H[Mobile App · Flutter]
    end

    A -- polling --> C
    C --> F
    C --> D
    D --> W
    W --> E
    E --> F
    F --> G
    W -- QR/Barcode scan --> H
    H --> W
```

> Backend là **1 NestJS app duy nhất** (modular monolith) — mỗi nghiệp vụ là 1 module riêng biệt bên trong cùng app, không tách microservice.

---

## 🛠 Tech Stack

<table>
<tr>
<td valign="top" width="25%">

**Backend**

- NestJS 11
- MongoDB (Atlas) + Mongoose 9
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
│   │       ├── auth/                       🔐 Đăng nhập, MFA, phân quyền
│   │       ├── users/                       👤 Quản lý người dùng
│   │       ├── marketplace-integration/    🔌 Connector marketplace (OAuth, adapter)
│   │       ├── orders/                     🔄 Đồng bộ đơn hàng                    FE-01
│   │       ├── product-master/             📦 Cache kích thước/cân nặng sản phẩm
│   │       ├── order-groups/               🧩 Gộp đơn, fulfillment, phân công NV FE-02 FE-10
│   │       ├── packaging/                  🤖 AI packaging recommendation        FE-03
│   │       └── warehouse/                  📦 Vị trí kho, picking list           FE-06
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

> **Test luồng OAuth marketplace cục bộ**: cần tunnel HTTPS public cho OAuth callback (marketplace không nhận `localhost`). Dùng `ngrok http --url=<domain-cố-định-của-bạn> 3000`, và cần Redis chạy sẵn (Docker, hoặc Memurai trên Windows nếu không tiện dùng Docker/WSL). MongoDB dùng Atlas (cloud) cho cả dev lẫn production, không cần cài MongoDB local.

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

| Variable                               | Mô tả                                                           |
| -------------------------------------- | --------------------------------------------------------------- |
| `MONGODB_URI`                          | MongoDB Atlas connection string                                 |
| `JWT_SECRET`                           | JWT signing key                                                 |
| `CORS_ORIGIN`                          | Allowed CORS origins (mặc định `http://localhost:5173`)         |
| `CLIENT_REDIRECT_CALLBACK`             | URL public (ngrok) FE dùng để nhận callback OAuth khi dev local |
| `LAZADA_APP_KEY` / `LAZADA_APP_SECRET` | Lazada Open Platform credentials (ISV Console)                  |
| `REDIS_URL`                            | Redis / Redis-compatible (vd Memurai) connection string         |

</details>

| Service       | URL                       |
| ------------- | ------------------------- |
| MongoDB       | Atlas (cloud, xem `.env`) |
| Mongo Express | `http://localhost:8081`   |

---

## 📚 API Documentation

<div align="center">

📖 Swagger UI: **`http://localhost:3000/api/docs`**

</div>

> ⚠️ **Không có tiền tố `/api/v1`** — route thật gọn hơn phiếu đề xuất ban đầu, ví dụ `/auth/login` chứ không phải `/api/v1/auth/login`.

Chi tiết đầy đủ cho FE tích hợp, kèm ví dụ request/response, bảng mã lỗi, và checklist test bắt buộc:

| Tài liệu                           | Phạm vi                              |
| ---------------------------------- | ------------------------------------ |
| `INTEGRATION_GUIDE.md`             | Auth / Users                         |
| `INTEGRATION_GUIDE_ORDERS.md`      | Orders / Marketplace Integration     |
| `INTEGRATION_GUIDE_FULFILLMENT.md` | Order Groups / Packaging / Warehouse |

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
type(AOFP-XX): mô tả ngắn gọn
```

```bash
✅ feat(AOFP-12): add Lazada order sync module
✅ fix(AOFP-15): resolve duplicate order detection bug
✅ docs(AOFP-20): update API documentation for orders module
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

|         Role          | Name                   | Email                       |
| :-------------------: | ---------------------- | --------------------------- |
|     🎓 Supervisor     | Thân Thị Ngọc Vân      | vanttn@fpt.edu.vn           |
|       👑 Leader       | Nguyễn Phương Mỹ Thuận | ThuanNPMSE171113@fpt.edu.vn |
| ⚙️ Backend Developer  | Lê Đức Trung Thi       | thildtde180553@fpt.edu.vn   |
| 🎨 Frontend Developer | Huỳnh Quốc Việt        | viethqse182482@fpt.edu.vn   |
| 🎨 Frontend Developer | Phan Huỳnh Hải Phượng  | haifuong2408@gmail.com      |

</div>

---

<div align="center">

## 📄 License

**UNLICENSED** — Proprietary software, phát triển trong khuôn khổ Capstone Project FA26SE036

<br/>

Made with 🧠 by **OptiPackAI Team**

</div>
