import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

const STEPS = [
  {
    id: '01',
    title: 'Đơn về và được gom',
    meta: 'Store Owner',
    body: 'Khách đặt trên Lazada hoặc AURELLE. Đơn về OptiPack, đơn cùng người nhận vào chung một nhóm và được giao cho một nhân viên kho.',
  },
  {
    id: '02',
    title: 'Lấy hàng theo kệ',
    meta: 'Warehouse Staff',
    body: 'Picking list xếp theo lộ trình đi trong kho, chia sẵn món nào của đơn nào. Nhân viên quét từng món; thiếu thì báo để người khác duyệt.',
  },
  {
    id: '03',
    title: 'Xếp thùng và đóng',
    meta: 'Packaging Staff',
    body: 'Hệ thống tính cách xếp, nhân viên xem hướng dẫn 3D từng bước, quét món vào kiện, cân và niêm phong. Kiện lệch cân bị giữ lại.',
  },
  {
    id: '04',
    title: 'Giao và theo dõi',
    meta: 'Shipping Coordinator',
    body: 'Báo giá GHN theo từng kiện, tạo vận đơn, in nhãn. Khách AURELLE thấy đơn đi tới đâu ngay trên trang đơn hàng.',
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
      className="scroll-mt-28 border-l-2 border-[var(--ed-line)] pl-6"
    >
      <div className="py-2">
        <p className="ed-display m-0 mb-1 text-sm tabular-nums text-[var(--ed-muted)]">{step.id}</p>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="m-0 text-2xl font-semibold tracking-tight text-[var(--ed-ink)]">
            {step.title}
          </h3>
          <span className="text-sm text-[var(--ed-muted)]">
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
      <h2 className="ed-title">Một đơn đi qua bốn người</h2>
      <p className="ed-lead">
        Mỗi bước có một vai trò chịu trách nhiệm và một màn hình riêng.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:gap-10">
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

        <div className="flex flex-col gap-10">
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
