# syntax=docker/dockerfile:1

#!=============================================
# BUILD CONTEXT = THƯ MỤC GỐC REPO (npm workspaces):
#
#   docker build -f storefront/Dockerfile -t optipackai-storefront:local \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 .
#
# NEXT_PUBLIC_* cũng được nhúng lúc build (giống VITE_*), đổi URL backend
# phải build lại image.
#!=============================================

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY storefront/package.json ./storefront/package.json
RUN npm ci --workspace storefront --include-workspace-root --ignore-scripts
COPY storefront ./storefront
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace storefront

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# output: 'standalone' + outputFileTracingRoot = gốc repo -> cây kết quả là
# .next/standalone/{node_modules,storefront/server.js}
COPY --from=builder --chown=nextjs:nodejs /repo/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/storefront/.next/static ./storefront/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/storefront/public ./storefront/public

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3001) + '/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "storefront/server.js"]
