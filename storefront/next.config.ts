import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Cần cho Dockerfile: gói sẵn server + đúng node_modules tối thiểu vào
  // .next/standalone, không phải copy cả node_modules khổng lồ vào image.
  output: 'standalone',
  // Repo là npm workspaces (node_modules hoist lên gốc) nên phải chỉ rõ
  // gốc để Next trace đúng file, nếu không standalone sẽ thiếu package.
  outputFileTracingRoot: path.join(rootDir, '..'),
}

export default nextConfig
