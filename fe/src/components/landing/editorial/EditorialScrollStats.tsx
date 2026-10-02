import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  motion,
  useInView,
  useMotionValueEvent,
  useSpring,
} from 'framer-motion'
import { ArrowRight, Check, Package, Store, Warehouse } from 'lucide-react'

const STORY_POINTS = [
  'Đồng bộ, gộp đơn & lấy hàng tối ưu theo kệ',
  'Mỗi bước có người xác nhận & ghi nhận dấu vết',
  'Vận hành đi đúng đường, giảm thiểu sai sót',
] as const

const FLOW_STEPS = [
  {
    key: 'marketplace',
    label: 'Sàn TMĐT',
    hint: 'Lazada · TikTok · Tiki',
    icon: Store,
  },
  {
    key: 'system',
    label: 'Hệ thống OptiPackAI',
    hint: 'Gộp · Phân công · Theo dõi',
    icon: Package,
  },
  {
    key: 'warehouse',
    label: 'Kho & Đóng gói',
    hint: 'Lấy hàng · Kiểm chứng',
    icon: Warehouse,
  },
] as const

const STATS = [
  {
    value: 1400,
    suffix: '+',
    pad: 0,
    unit: '',
    label: 'Đơn đã xử lý qua hệ thống',
  },
  {
    value: 5,
    suffix: 's',
    pad: 2,
    unit: '',
    label: 'Mục tiêu gợi ý đóng gói',
  },
  {
    value: 3,
    suffix: '',
    pad: 2,
    unit: 'Sàn',
    label: 'Trong lộ trình tích hợp',
  },
  {
    value: 19,
    suffix: '',
    pad: 2,
    unit: 'Status',
    label: 'Trạng thái Lazada đã map',
  },
] as const

function formatStatValue(value: number, pad: number): string {
  if (pad <= 0) return String(value)
  return String(value).padStart(pad, '0')
}

function AnimatedNumber({
  value,
  suffix,
  pad,
  unit,
}: {
  value: number
  suffix: string
  pad: number
  unit: string
}): ReactNode {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const spring = useSpring(0, { stiffness: 70, damping: 22 })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (inView) spring.set(value)
  }, [inView, spring, value])

  useMotionValueEvent(spring, 'change', (latest) => {
    setDisplay(Math.round(latest))
  })

  return (
    <span
      ref={ref}
      className="inline-flex min-h-[1.15em] items-baseline gap-1.5 tabular-nums"
    >
      <span>
        {formatStatValue(display, pad)}
        {suffix}
      </span>
      {unit ? (
        <span className="text-[0.42em] font-semibold tracking-wide text-[var(--ed-muted)] uppercase">
          {unit}
        </span>
      ) : null}
    </span>
  )
}

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
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 3.4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: index * 0.45,
                    }}
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
                  </motion.div>
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
          <p className="ed-kicker">Câu chuyện vận hành</p>
          <h2 className="ed-title m-0 max-w-xl text-[clamp(1.55rem,3vw,2.35rem)] text-[var(--ed-ink)]">
            OptiPackAI biến đơn rời thành luồng kho thống nhất.
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

      {/* Stats — full width below */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-8%' }}
            transition={{ duration: 0.45 }}
            className="flex h-full min-h-[9.5rem] flex-col justify-between rounded-3xl border border-[var(--ed-line)] bg-white/70 px-5 py-6 text-left shadow-[0_8px_30px_rgba(21,45,53,0.04)]"
          >
            <p className="m-0 text-left text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-normal text-[var(--ed-ink)]">
              <AnimatedNumber
                value={stat.value}
                suffix={stat.suffix}
                pad={stat.pad}
                unit={stat.unit}
              />
            </p>
            <p className="m-0 mt-3 text-left text-sm leading-snug text-[var(--ed-ink-soft)]">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
