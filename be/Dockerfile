# syntax=docker/dockerfile:1

#!=============================================
# FIX #36: Build multi-stage - image cuối cùng KHÔNG chứa devDependencies,
# source TypeScript gốc, hay công cụ build (tsc, eslint...) - chỉ có đúng
# code JS đã compile + node_modules production. Giảm kích thước image đáng
# kể (thường 3-5 lần), giảm luôn bề mặt tấn công (ít thứ hơn để khai thác
# nếu container bị chiếm quyền).
#!=============================================

# ---- Stage 1: cài dependencies (kể cả dev, cần cho bước build) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Stage 2: build TypeScript -> JavaScript ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: cài LẠI dependencies, lần này CHỈ bản production ----
FROM node:22-alpine AS production-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 4: image thật sự chạy production ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

#!=============================================
# FIX #36: KHÔNG chạy container bằng user root - tạo user riêng quyền hạn
# chế, đúng khuyến nghị bảo mật chuẩn cho container production.
#!=============================================
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

USER nestjs

EXPOSE 3000

# healthcheck co ban - tra ve khac 0 neu process khong con song
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/src/main.js"]
