import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, Boxes, ScanLine, Sparkles } from 'lucide-react'
import { handleLandingHashClick } from '../scroll-landing'
import { LandingAuthCta } from '../LandingAuthCta'

export function EditorialHero(): ReactNode {
  return (
    <section
      id="top"
      className="relative px-4 pb-4 pt-28 sm:px-6 sm:pt-32 lg:px-10"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="grid items-stretch gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          <div className="flex h-full flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.45 }}
              className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Hệ thống đang sẵn sàng · Tích hợp đa sàn
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="ed-kicker"
            >
              Omnichannel fulfillment · AI packaging
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="ed-display m-0 max-w-[14ch] text-[clamp(2.85rem,7.2vw,5.5rem)] text-[var(--ed-ink)]"
            >
              OptiPackAI
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.55 }}
              className="mt-5 max-w-[32rem] text-lg leading-relaxed text-[var(--ed-ink-soft)] sm:text-xl"
            >
              Đơn hàng chỉ chắc khi từng đường nối sàn–kho–đóng gói đều kín.
              Đồng bộ Lazada, gộp đơn, gợi ý thùng AI và lấy hàng theo lộ trình
              kệ — một luồng, một hệ thống.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <LandingAuthCta variant="hero" />
              <a
                href="#process"
                onClick={(e) => handleLandingHashClick(e, '#process')}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--ed-line)] bg-white/70 px-4 text-sm font-medium text-[var(--ed-ink)] transition hover:bg-white"
              >
                Xem quy trình
                <ArrowDownRight className="h-4 w-4" strokeWidth={2} />
              </a>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[1.75rem] border border-[var(--ed-line)] shadow-[0_28px_80px_rgba(21,45,53,0.18)]"
          >
            <div
              className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]"
              style={{
                background:
                  'linear-gradient(155deg, #152d35 0%, #1f4450 42%, #3d6b6a 72%, #d4ecdd 120%)',
              }}
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 20%, rgba(212,236,221,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.12), transparent 35%)',
                }}
              />
              <svg
                className="absolute inset-0 h-full w-full opacity-[0.22]"
                viewBox="0 0 400 500"
                aria-hidden
              >
                <g fill="none" stroke="#d4ecdd" strokeWidth="1.2">
                  <path d="M40 380 L120 300 L200 360 L280 250 L360 320" />
                  <path d="M60 420 L140 340 L220 400 L300 290 L380 360" />
                  <rect x="70" y="90" width="90" height="70" rx="8" />
                  <rect x="200" y="120" width="110" height="80" rx="8" />
                  <rect x="120" y="220" width="140" height="90" rx="10" />
                </g>
              </svg>

              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { icon: Boxes, label: 'Gộp đơn đa sàn', meta: 'Consolidation' },
                    { icon: Sparkles, label: 'AI đóng gói 3D', meta: '≤ 5 giây' },
                    { icon: ScanLine, label: 'Lấy hàng theo kệ', meta: 'Wave pick' },
                  ].map(({ icon: Icon, label, meta }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/15 bg-[color-mix(in_srgb,#152d35_55%,transparent)] px-3 py-2.5 text-[var(--ed-sage)] backdrop-blur-md"
                    >
                      <Icon className="mb-1.5 h-4 w-4 opacity-90" strokeWidth={1.75} />
                      <p className="m-0 text-[12px] font-semibold leading-snug">
                        {label}
                      </p>
                      <p className="m-0 mt-0.5 text-[10px] font-medium tracking-wide text-[color-mix(in_srgb,#d4ecdd_75%,white)] uppercase">
                        {meta}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
