import { Mail } from 'lucide-react'
import { LandingAuthCta } from './LandingAuthCta'

const techStack = [
  'Spring Boot',
  'React',
  'Google OR-Tools',
  'Kafka',
  'PostgreSQL',
  'OpenAI',
]

export function LandingFooter() {
  return (
    <footer id="contact" className="lp-section scroll-mt-20 border-t border-[var(--ls-card-border)] pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="lp-mark">OP</span>
              <span className="text-sm font-semibold">OptiPackAI</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-[var(--ls-muted)]">
              Hệ thống hỗ trợ xử lý đơn hàng đa kênh và tối ưu hóa đóng gói thông
              minh bằng AI (AOFP).
            </p>
            <div className="mt-3 flex flex-col items-start gap-3">
              <a
                href="mailto:contact@optipackai.local"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--ls-muted)] hover:text-[var(--ls-cta)]"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                Liên hệ: contact@optipackai.local
              </a>
              <LandingAuthCta variant="footer" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium tracking-wider text-[var(--ls-muted)] uppercase">
              Công nghệ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border border-[var(--ls-card-border)] bg-[var(--ls-panel)] px-2.5 py-1 font-mono text-[11px] text-[var(--ls-muted)]"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--ls-card-border)] pt-6 text-xs text-[var(--ls-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Đại học FPT · Đồ án tốt nghiệp OptiPackAI · 2026–2027</p>
          <p className="font-mono">FA26SE036 · Nhóm AOFP</p>
        </div>
      </div>
    </footer>
  )
}
