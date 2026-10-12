# syntax=docker/dockerfile:1

#!=============================================
# BUILD CONTEXT = THƯ MỤC GỐC REPO, KHÔNG PHẢI be/
#
#   docker build -f be/Dockerfile -t optipackai-be:local .
#
# Lý do: repo là npm workspaces (fe + be + storefront dùng CHUNG 1
# package-lock.json ở gốc) — KHÔNG hề tồn tại be/package-lock.json.
# Bản Dockerfile cũ chạy `COPY package*.json ./` rồi `npm ci` từ trong
# be/ nên luôn fail ("npm ci can only install with an existing
# package-lock.json"). Đây là lỗi thật, không phải chỉnh cho đẹp.
#
# Multi-stage: image cuối chỉ có JS đã compile + node_modules production,
# không có TypeScript gốc/tsc/eslint/jest → nhẹ hơn nhiều và ít bề mặt
# tấn công hơn.
#!=============================================

ARG NODE_VERSION=22-alpine

# ---- Stage 1: deps đầy đủ (gồm devDependencies) để build ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
# HUSKY=0 + --ignore-scripts: script "prepare": "husky" ở root package.json
# sẽ fail trong image vì husky là devDependency của môi trường dev, không
# cần (và không nên) chạy khi build container.
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY be/package.json ./be/package.json
RUN npm ci --workspace be --include-workspace-root --ignore-scripts

# ---- Stage 2: compile TypeScript -> JavaScript ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo
ENV HUSKY=0
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY be ./be
RUN npm run build --workspace be

# ---- Stage 3: cài lại node_modules, lần này CHỈ production ----
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /repo
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY be/package.json ./be/package.json
RUN npm ci --omit=dev --workspace be --include-workspace-root --ignore-scripts

# ---- Stage 4: image chạy thật ----
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
# npm workspaces hoist toàn bộ package lên /repo/node_modules (đã kiểm tra:
# không sinh be/node_modules riêng) — nên app phải chạy từ /repo/be để Node
# đi ngược lên /repo/node_modules đúng chuẩn resolve.
WORKDIR /repo/be

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/package.json /repo/package.json
COPY --from=builder /repo/be/dist ./dist
COPY --from=builder /repo/be/assets ./assets
COPY be/package.json ./package.json

USER nestjs

EXPOSE 3000

# Nest build ra dist/src/main.js (không phải dist/main.js) vì tsconfig gồm
# cả scripts/ ngoài src/ — khớp đúng script "start:prod" trong package.json.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/src/main.js"]
