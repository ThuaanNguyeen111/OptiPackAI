import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Cho emulator/điện thoại (WebView trong app mobile) mở web dev qua `10.0.2.2` hoặc IP LAN.
    host: true,
    // WebView gọi API cùng origin với web (`<web>/api`) rồi Vite chuyển sang BE → không cần sửa CORS của BE.
    proxy: {
      '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
