import type { ReactNode } from 'react'
import { LandingAuthCta } from '../LandingAuthCta'

export function EditorialFooter(): ReactNode {
  return (
    <footer className="ed-section border-t border-[var(--ed-line)] pt-12 pb-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <h2 className="ed-title text-[clamp(1.85rem,3.5vw,2.75rem)]">
            Có tài khoản rồi thì đăng nhập để vào việc.
          </h2>
          <p className="ed-lead mb-0">
            Tài khoản do Admin cấp. Quên mật khẩu thì tự đặt lại qua email.
          </p>
        </div>
        <div className="ed-footer-cta flex flex-wrap items-center gap-3">
          <LandingAuthCta variant="footer" />
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-2 border-t border-[var(--ed-line)] pt-5 text-xs text-[var(--ed-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} OptiPackAI · AOFP Capstone</span>
        <span>Đồ án tốt nghiệp FA26SE036</span>
      </div>
    </footer>
  )
}
