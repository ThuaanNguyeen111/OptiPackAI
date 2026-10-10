# syntax=docker/dockerfile:1

#!=============================================
# BUILD CONTEXT = THƯ MỤC GỐC REPO (giống be/Dockerfile — npm workspaces):
#
#   docker build -f fe/Dockerfile -t optipackai-fe:local \
#     --build-arg VITE_API_URL=http://localhost:3000 .
#
# LƯU Ý QUAN TRỌNG: Vite nhúng VITE_API_URL vào bundle NGAY LÚC BUILD,
# không đọc lại lúc chạy container. Muốn đổi URL backend thì phải build
# lại image (hoặc build sẵn mỗi môi trường 1 tag riêng).
#!=============================================

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY fe/package.json ./fe/package.json
RUN npm ci --workspace fe --include-workspace-root --ignore-scripts
COPY fe ./fe
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace fe

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY fe/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/fe/dist /usr/share/nginx/html
# Bản nginx-unprivileged đã chạy sẵn bằng user nginx (uid 101, không phải
# root) và lắng nghe cổng 8080 — khớp "listen 8080" trong fe/nginx.conf, khỏi
# phải tự sửa lại nginx.conf gốc (cách đó phụ thuộc đúng khoảng trắng, dễ hụt).
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
