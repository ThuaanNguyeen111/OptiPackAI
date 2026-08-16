import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'

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
    <footer id="contact" className="scroll-mt-20 border-t border-hairline px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary-hover text-[10px] font-bold text-on-primary">
                OP
              </span>
              <span className="text-sm font-semibold text-ink">OptiPackAI</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-ink-subtle">
              Hệ thống hỗ trợ xử lý đơn hàng đa kênh và tối ưu hóa đóng gói thông
              minh bằng AI (AOFP).
            </p>
            <a
              href="mailto:contact@optipackai.local"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary-hover"
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              Liên hệ: contact@optipackai.local
            </a>
            <Link
              to="/login"
              className="mt-4 inline-flex text-sm text-primary-hover hover:underline"
            >
              Mở Dashboard →
            </Link>
          </div>

          <div>
            <p className="text-xs font-medium tracking-wider text-ink-subtle uppercase">
              Công nghệ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1 font-mono text-[11px] text-ink-muted"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>Đại học FPT · Đồ án tốt nghiệp OptiPackAI · 2026–2027</p>
          <p className="font-mono">FA26SE036 · Nhóm AOFP</p>
        </div>
      </div>
    </footer>
  )
}
