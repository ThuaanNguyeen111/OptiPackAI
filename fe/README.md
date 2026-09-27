# OptiPackAI Frontend

Giao diện web OptiPackAI (AOFP) — React + Vite + Tailwind CSS.

## Design system

UI tuân theo **[DESIGN.md](./DESIGN.md)** (Linear style từ [getdesign.md](https://getdesign.md/)).

- **Dark** (mặc định): **Twitter Dim** — canvas `#15202B`, cards `#192734` / `#22303C`, border `#38444D`, ink `#F7F9F9` · accent Linear lavender `#5e6ad2`
- **Light**: inverse tokens (`inverse-canvas`, `inverse-surface-*`, `inverse-ink`)
- Toggle theme trên Header (Sun/Moon) · lưu `localStorage` key `optipack-theme`

Khi dùng AI coding agent, luôn nhắc:

> Follow `fe/DESIGN.md` for all UI work.

## Routes

| Path | Màn hình |
|------|----------|
| `/` | Landing page (GetDesign / Linear style) |
| `/login` | Đăng nhập |
| `/register` | Đăng ký tài khoản + chọn role |
| `/app` | User Portal — Tổng quan KPI + charts |
| `/app/orders` | Đơn đa kênh + AI Packing Inspector |
| `/app/packing` | AI 3D Packing Engine |
| `/app/shipping` | Vận chuyển & in nhãn |
| `/app/settings` | Marketplace OAuth + quy tắc đóng gói |
| `/app/integrations` | _(đã gộp vào Settings)_ |

## Flow 1 — Omnichannel sync & order consolidation

Dữ liệu hiện tại là **mock** (`src/data/`). Khi BE sẵn sàng, thay bằng API.

## Chạy dev

```bash
npm run dev
```

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Dev server Vite |
| `npm run build` | Build production |
| `npm run lint` | ESLint |

## Cấu trúc

```
src/
  components/
    auth/           # Login/Register layout + inputs
    landing/        # Landing page sections
    integrations/   # Platform card, sync log
    orders/         # Table, badges, consolidation, timeline
    layout/         # Sidebar, Header
    ui/             # Button, Badge
  pages/            # Landing, Auth, Flow 1 pages
  data/             # Mock data
  types/            # Order, consolidation types
  utils/            # formatCurrency, formatDate
DESIGN.md
```
