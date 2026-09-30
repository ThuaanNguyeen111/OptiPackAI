import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

const STEPS = [
  {
    id: '01',
    title: 'Đồng bộ & gộp',
    meta: 'Cron · OAuth · Mongo',
    body: 'Shop kết nối Lazada. Hệ thống kéo đơn, chuẩn hóa, gộp nhóm theo consolidation key — không Kafka giả.',
    image:
      'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: '02',
    title: 'Gợi ý đóng gói',
    meta: 'AI · Fallback · Duyệt',
    body: 'Packaging Staff nhận recommendation, cân thật, duyệt/adjust/reject. Transaction ghi đồng thời recommendation + trạng thái nhóm.',
    image:
      'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: '03',
    title: 'Lấy & đóng',
    meta: 'Scan · Tồn · Wave',
    body: 'Warehouse quét kệ/SKU, trừ tồn atomic. Packaging đóng kiện — có thể ưu tiên thùng tái sử dụng nếu còn hạng A.',
    image:
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: '04',
    title: 'Giao & theo dõi',
    meta: 'Shipment · Events',
    body: 'Coordinator gán chuyến. Shipper cập nhật giao/thất bại. Hai lần thất bại → tự hoàn về kho kiểm QC.',
    image:
      'https://images.unsplash.com/photo-1578574577315-3fbeb0cecdc2?auto=format&fit=crop&w=1200&q=80',
  },
] as const

function StepCard({
  step,
  index,
  setActive,
}: {
  step: (typeof STEPS)[number]
  index: number
  setActive: (index: number) => void
}): ReactNode {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })

  useEffect(() => {
    if (inView) setActive(index)
  }, [inView, index, setActive])

  return (
    <article
      ref={ref}
      id={`process-${step.id}`}
      className="scroll-mt-28 overflow-hidden rounded-[2rem] border border-[var(--ed-line)] bg-white shadow-[0_16px_48px_rgba(21,45,53,0.06)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={step.image}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ed-ink)]/55 to-transparent" />
        <span className="ed-display absolute bottom-4 left-5 text-4xl text-white/90">
          {step.id}
        </span>
      </div>
      <div className="p-6 sm:p-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-2xl font-semibold tracking-tight text-[var(--ed-ink)]">
            {step.title}
          </h3>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--ed-sage)_55%,white)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--ed-ink)] uppercase">
            {step.meta}
          </span>
        </div>
        <p className="m-0 text-[15px] leading-relaxed text-[var(--ed-ink-soft)]">
          {step.body}
        </p>
      </div>
    </article>
  )
}

export function EditorialProcess(): ReactNode {
  const [active, setActive] = useState(0)

  return (
    <section id="process" className="ed-section">
      <p className="ed-kicker">Quy trình</p>
      <h2 className="ed-title">Bốn nhịp từ đơn tới cửa khách</h2>
      <p className="ed-lead">
        Bên trái sticky theo bước đang trong viewport — bên phải cuộn từng card.
      </p>

      <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <ol className="m-0 flex list-none flex-row gap-2 p-0 lg:flex-col lg:gap-1">
            {STEPS.map((step, i) => {
              const on = i === active
              return (
                <li key={step.id}>
                  <a
                    href={`#process-${step.id}`}
                    className={[
                      'flex items-center gap-3 rounded-2xl px-3 py-3 no-underline transition-colors',
                      on
                        ? 'bg-[var(--ed-ink)] text-white'
                        : 'text-[var(--ed-muted)] hover:bg-black/[0.03] hover:text-[var(--ed-ink)]',
                    ].join(' ')}
                    onClick={() => setActive(i)}
                  >
                    <span
                      className={[
                        'ed-display text-lg tabular-nums',
                        on ? 'text-[var(--ed-sage)]' : '',
                      ].join(' ')}
                    >
                      {step.id}
                    </span>
                    <span className="hidden text-sm font-medium sm:inline">
                      {step.title}
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </aside>

        <div className="flex flex-col gap-8">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8%' }}
              transition={{ duration: 0.45 }}
            >
              <StepCard step={step} index={i} setActive={setActive} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
