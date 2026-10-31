import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Package, Store, Warehouse } from 'lucide-react'

const STORY_POINTS = [
  'Đơn của cùng một người nhận được lấy chung một lượt, kể cả khi đặt ở hai sàn khác nhau.',
  'Kho quét từng món; thiếu hàng thì dừng lại cho người duyệt thay vì đóng thiếu.',
  'Mỗi lần đổi trạng thái đều ghi lại ai làm, lúc nào — xem lại được ở trang Lịch sử.',
] as const

const FLOW_STEPS = [
  {
    key: 'marketplace',
    label: 'Sàn TMĐT',
    hint: 'Lazada · AURELLE',
    icon: Store,
  },
  {
    key: 'system',
    label: 'Hệ thống OptiPackAI',
    hint: 'Gom đơn cùng người nhận · giao việc',
    icon: Package,
  },
  {
    key: 'warehouse',
    label: 'Kho & Đóng gói',
    hint: 'Quét kệ · xếp thùng · vận đơn GHN',
    icon: Warehouse,
  },
] as const

function WorkflowMockup(): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full overflow-hidden rounded-2xl border border-[var(--ed-line)] bg-neutral-100/90 p-5 shadow-[0_12px_40px_rgba(21,45,53,0.06)] sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_0%,color-mix(in_srgb,var(--ed-sage)_55%,transparent),transparent_60%)]"
      />
      <div className="relative">
        <p className="m-0 text-[11px] font-semibold tracking-[0.14em] text-[var(--ed-muted)] uppercase">
          Luồng vận hành
        </p>
        <p className="ed-display m-0 mt-2 text-lg text-[var(--ed-ink)] sm:text-xl">
          Từ sàn đến kiện hàng
        </p>

        <ul className="mt-6 flex list-none flex-col gap-0 p-0">
          {FLOW_STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.key} className="flex flex-col">
                <motion.div
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-8% 0px' }}
                  transition={{
                    duration: 0.4,
                    delay: 0.12 + index * 0.12,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-[var(--ed-line)] bg-white/85 px-3.5 py-3 shadow-[0_4px_16px_rgba(21,45,53,0.04)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--ed-sage)_70%,white)] text-[var(--ed-ink)]">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-sm font-semibold text-[var(--ed-ink)]">
                        {step.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--ed-muted)]">
                        {step.hint}
                      </span>
                    </span>
                  </div>
                </motion.div>
                {index < FLOW_STEPS.length - 1 ? (
                  <div
                    className="flex items-center justify-center py-1.5 text-[var(--ed-muted)]"
                    aria-hidden
                  >
                    <ArrowRight className="h-3.5 w-3.5 rotate-90 opacity-70" />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </motion.div>
  )
}

export function EditorialScrollStats(): ReactNode {
  return (
    <section id="story" className="ed-section">
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
        {/* Left — story copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0"
        >
          <h2 className="ed-title m-0 max-w-xl text-[clamp(1.55rem,3vw,2.35rem)] text-[var(--ed-ink)]">
            Một luồng thay cho ba bảng tính và hai trang quản lý sàn.
          </h2>

          <ul className="mt-8 flex list-none flex-col gap-3.5 p-0">
            {STORY_POINTS.map((point, i) => (
              <motion.li
                key={point}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-8% 0px' }}
                transition={{
                  duration: 0.4,
                  delay: 0.08 + i * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ed-sage)_85%,white)] text-[var(--ed-ink)] ring-1 ring-[color-mix(in_srgb,var(--ed-sage-deep)_55%,transparent)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </span>
                <span className="pt-0.5 text-[0.95rem] leading-snug text-[var(--ed-ink-soft)] sm:text-base">
                  {point}
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* Right — workflow mockup */}
        <div className="min-w-0 lg:sticky lg:top-28">
          <motion.div
            whileInView={{ y: [8, 0] }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <WorkflowMockup />
          </motion.div>
        </div>
      </div>

    </section>
  )
}
