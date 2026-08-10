# 📦 OptiPackAI — AI-Assisted Omnichannel Order Fulfillment & Packaging Optimization System

<div align="center">

**Hệ thống hỗ trợ xử lý đơn hàng đa kênh và tối ưu hóa đóng gói thông minh bằng AI**

[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg)](https://nestjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248.svg)](https://mongodb.com)

Project code: **AOFP** · Group: **FA26SE036** · Duration: 09/2026 – 03/2027

</div>

---

## 📋 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng chính](#-tính-năng-chính)
- [Tech Stack](#-tech-stack)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Bắt đầu](#-bắt-đầu)
- [Scripts](#-scripts)
- [Môi trường](#-môi-trường)
- [API Documentation](#-api-documentation)
- [Git Workflow](#-git-workflow)
- [Đóng góp](#-đóng-góp)
- [Team](#-team)

---

## 🎯 Giới thiệu

Doanh nghiệp bán hàng đa kênh (Shopee, TikTok Shop...) đang gặp khó khăn khi quản lý đơn hàng rời rạc giữa các nền tảng và đóng gói dựa trên cảm tính, gây lãng phí chi phí vận chuyển và vật liệu. **OptiPackAI** giải quyết bài toán này bằng cách:

- 🔄 Đồng bộ đơn hàng tự động từ nhiều sàn TMĐT về một nơi duy nhất
- 🧩 Tự động phát hiện và gộp đơn hàng trùng lặp
- 🤖 Dùng AI (3D Bin Packing) gợi ý kích thước thùng và vật liệu đóng gói tối ưu
- 💰 Ước tính chi phí đóng gói + vận chuyển trước khi giao hàng
- 🏷️ Sinh nhãn vận chuyển, phiếu đóng gói, mã QR/Barcode tự động
- 📊 Dashboard theo dõi hiệu suất kho vận và chi phí logistics

> Đây là hệ thống quản lý nội bộ (internal tool), không phải sản phẩm SaaS đa khách thuê.

---

## ✨ Tính năng chính

| Mã    | Tính năng                                                                 |
| ----- | ------------------------------------------------------------------------- |
| FE-01 | Tích hợp API đồng bộ đơn hàng từ Shopee & TikTok Shop                     |
| FE-02 | Tự động gộp đơn hàng trùng lặp (Order Consolidation)                      |
| FE-03 | AI gợi ý đóng gói 3D Bin Packing — có xác nhận thủ công trước khi in nhãn |
| FE-04 | Ước tính chi phí bao bì & cước vận chuyển                                 |
| FE-05 | Sinh mã QR/Barcode, xuất PDF phiếu đóng gói & tem vận chuyển              |
| FE-06 | Mobile App quét mã QR cập nhật trạng thái picking/packing real-time       |
| FE-07 | Dashboard thống kê hiệu suất & chi phí                                    |
| FE-08 | Quản lý user, phân quyền, cấu hình tham số AI                             |

**Phạm vi tích hợp:** Shopee + TikTok Shop (Facebook Marketplace, Lazada nằm ngoài phạm vi đồ án).

---

## 🛠 Tech Stack

### Backend

- **Framework:** NestJS 11
- **Database:** MongoDB 7 + Mongoose
- **Authentication:** JWT + Passport
- **Documentation:** Swagger/OpenAPI
- **Validation:** class-validator
- **Labeling:** qrcode, bwip-js, pdfkit

### Frontend

- **Framework:** React 18 + Vite
- **Language:** TypeScript 5

### Mobile

- **Framework:** Flutter

### DevOps

- **Container:** Docker + Docker Compose
- **Git Hooks:** Husky + lint-staged + commitlint
- **Testing:** Jest (bắt buộc cho module AI Packaging & Order Consolidation)

---

## 📁 Cấu trúc dự án

```
OptiPackAI/
├── be/                          # Backend (NestJS)
│   ├── src/
│   │   ├── common/              # Shared utilities, filters, interceptors
│   │   ├── config/               # Configuration files
│   │   └── modules/
│   │       ├── orders/                     # Đồng bộ & gộp đơn hàng (FE-01, FE-02)
│   │       ├── packaging/                  # AI packaging recommendation (FE-03)
│   │       ├── shipping/                   # Ước tính phí, tạo nhãn (FE-04, FE-05)
│   │       ├── fulfillment/                # Picking/packing tracking (FE-06, FE-07)
│   │       ├── marketplace-integration/    # Connector Shopee, TikTok Shop
│   │       └── admin/                      # User, role, AI config (FE-08)
│   ├── test/
│   └── Dockerfile
│
├── fe/                          # Frontend (React + Vite)
│   ├── src/
│   └── Dockerfile
│
├── mobile/                      # Mobile App (Flutter)
│
├── docker/
├── .husky/
├── docker-compose.yml
└── package.json                 # Root package (npm workspaces: be, fe)
```

---

## 🚀 Bắt đầu

### Yêu cầu

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Docker** & **Docker Compose**
- **Git**

### Cài đặt

```bash
# 1. Clone repository
git clone https://github.com/ThuaanNguyeen111/OptiPackAI.git
cd OptiPackAI

# 2. Cài đặt dependencies
npm install
cd be && npm install
cd ../fe && npm install
cd ..

# 3. Cấu hình môi trường
cp .env.example .env
cp be/.env.example be/.env
cp fe/.env.example fe/.env

# 4. Khởi động MongoDB (Docker)
npm run docker:dev

# 5. Chạy development
npm run dev
```

Backend: `http://localhost:3000` · Frontend: `http://localhost:5173`

---

## 📜 Scripts

### Root (Monorepo)

| Script                | Mô tả                            |
| --------------------- | -------------------------------- |
| `npm run dev`         | Chạy cả Backend và Frontend      |
| `npm run dev:be`      | Chạy riêng Backend               |
| `npm run dev:fe`      | Chạy riêng Frontend              |
| `npm run build`       | Build cả Backend và Frontend     |
| `npm run lint`        | Lint toàn bộ project             |
| `npm run docker:dev`  | Khởi động MongoDB, Mongo Express |
| `npm run docker:down` | Dừng Docker containers           |

### Backend

| Script              | Mô tả                           |
| ------------------- | ------------------------------- |
| `npm run start:dev` | Development mode với hot-reload |
| `npm run build`     | Build production                |
| `npm run test`      | Chạy unit tests                 |
| `npm run test:cov`  | Test coverage                   |

---

## 🔐 Môi trường

| Variable                                   | Mô tả                               |
| ------------------------------------------ | ----------------------------------- |
| `MONGODB_URI`                              | MongoDB connection string           |
| `JWT_SECRET`                               | JWT signing key                     |
| `CORS_ORIGIN`                              | Allowed CORS origins                |
| `SHOPEE_PARTNER_ID` / `SHOPEE_PARTNER_KEY` | Shopee Open API credentials         |
| `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET`     | TikTok Shop Partner API credentials |

- **MongoDB:** `mongodb://localhost:27017`
- **Mongo Express:** `http://localhost:8081`

---

## 📚 API Documentation

Swagger UI: **http://localhost:3000/api/docs**

```
POST   /api/v1/auth/login              # Đăng nhập
POST   /api/v1/orders/sync             # Đồng bộ đơn hàng từ sàn
GET    /api/v1/orders                  # Danh sách đơn hàng đã gộp
POST   /api/v1/packaging/recommend     # AI gợi ý đóng gói
GET    /api/v1/shipping/estimate       # Ước tính phí ship
POST   /api/v1/fulfillment/scan        # Cập nhật trạng thái picking/packing
```

---

## 🔄 Git Workflow

Theo quy định trong Project Management Plan (Report 2):

### Branch

- `main` — code ổn định, sẵn sàng release
- `develop` — nhánh hội tụ tính năng đang phát triển
- `feature/AOFP-XX_ten-tinh-nang` — nhánh tính năng, tạo từ `develop`

### Commit Message

Kết hợp Conventional Commits + mã ticket Jira (đặt trong `scope`):

```bash
type(AOFP-12): mô tả ngắn gọn
```

Ví dụ:

```bash
feat(AOFP-12): add Shopee webhook configuration
fix(AOFP-15): resolve duplicate order detection bug
docs(AOFP-20): update API documentation for packaging module
```

Các `type` hợp lệ: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

### Pull Request

- Không push trực tiếp lên `main`/`develop`
- Bắt buộc ít nhất 1 reviewer approve trước khi merge
- Phải pass Unit Test trước khi merge

---

## 🤝 Đóng góp

1. Tạo feature branch từ `develop`: `git checkout -b feature/AOFP-XX_ten-tinh-nang`
2. Commit theo format `[AOFP-XX] mô tả thay đổi`
3. Push và tạo Pull Request vào `develop`
4. Chờ ít nhất 1 thành viên review & approve

---

## 👥 Team — FA26SE036

| Role                 | Name                                     |
| -------------------- | ---------------------------------------- |
| **Supervisor**       | Thân Thị Ngọc Vân                        |
| **Leader / Backend** | Thuận                                    |
| **Backend**          | Thi                                      |
| ...                  | _(cập nhật danh sách đầy đủ thành viên)_ |

---

## 📄 License

This project is **UNLICENSED** — Proprietary software, phát triển trong khuôn khổ đồ án Capstone Project FA26SE036.

---

<div align="center">

**OptiPackAI Team**

</div>
