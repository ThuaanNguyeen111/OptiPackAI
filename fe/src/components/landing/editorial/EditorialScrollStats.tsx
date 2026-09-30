import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  motion,
  useInView,
  useMotionValueEvent,
  useSpring,
} from 'framer-motion'

const STORY_LINES = [
  'OptiPackAI biến đơn rời từ sàn thành một luồng kho thống nhất',
  // Em-dash glued to following word (NBSP) — never orphans at a line end
  '—\u00A0từ đồng bộ, gộp đơn, lấy hàng theo kệ đến đóng gói có kiểm chứng.',
  'Mỗi bước có người xác nhận, mỗi số liệu có dấu vết,',
  'để đội vận hành đi đúng đường thay vì đuổi theo thông báo.',
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

function StoryLineReveal(): ReactNode {
  return (
    <div className="max-w-4xl text-[clamp(1.35rem,2.8vw,2.15rem)] font-medium leading-[1.55] tracking-normal text-neutral-900">
      {STORY_LINES.map((line, i) => (
        <motion.p
          key={line}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{
            duration: 0.5,
            delay: i * 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="m-0 text-neutral-900"
        >
          {line}
        </motion.p>
      ))}
    </div>
  )
}

export function EditorialScrollStats(): ReactNode {
  return (
    <section id="story" className="ed-section">
      <p className="ed-kicker">Câu chuyện vận hành</p>
      <StoryLineReveal />

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
