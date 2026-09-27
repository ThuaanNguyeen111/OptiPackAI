import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Hero3DCanvas } from '../marketing/Hero3DCanvas'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, color-mix(in srgb, var(--app-primary) 28%, transparent), transparent)',
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary-hover shadow-[0_0_24px_rgba(99,102,241,0.2)]">
            <span aria-hidden>🚀</span>
            Logistics đa kênh hỗ trợ bởi AI
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl md:text-6xl md:leading-[1.08]">
            Xử lý đơn hàng thông minh &{' '}
            <span className="bg-gradient-to-r from-primary via-primary-hover to-tiktok bg-clip-text text-transparent">
              tối ưu đóng gói
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-muted sm:text-lg lg:mx-0">
            Gộp đơn đa kênh từ Shopee, TikTok Shop và Facebook. Loại bỏ khoảng
            trống thừa trong kiện hàng nhờ thuật toán AI 3D Bin Packing.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link
              to="/login"
              className="inline-flex h-11 items-center rounded-md bg-gradient-to-r from-primary to-primary-hover px-5 text-sm font-semibold text-on-primary shadow-[0_0_28px_rgba(99,102,241,0.35)] transition-opacity hover:opacity-95"
            >
              Đăng nhập hệ thống
            </Link>
            <a
              href="#ai-engine"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-hairline bg-transparent px-5 text-sm font-medium text-ink transition-colors hover:border-hairline-strong hover:bg-surface-1"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              Xem demo đóng gói 3D
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-ink-subtle lg:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-shopee" />
              Shopee
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-tiktok" />
              TikTok Shop
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#1877F2]" />
              Facebook
            </span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-lg lg:max-w-none">
          <Hero3DCanvas />
        </div>
      </div>
    </section>
  )
}
