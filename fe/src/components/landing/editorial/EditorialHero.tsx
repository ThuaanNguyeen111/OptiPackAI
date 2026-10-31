import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight } from 'lucide-react'
import { handleLandingHashClick } from '../scroll-landing'
import { LandingAuthCta } from '../LandingAuthCta'
import { PackedCartonIllustration } from './PackedCartonIllustration'

export function EditorialHero(): ReactNode {
  return (
    <section id="top" className="relative px-4 pb-4 pt-28 sm:px-6 sm:pt-32 lg:px-10">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="ed-display m-0 max-w-[18ch] text-[clamp(2.2rem,4.4vw,3.5rem)] text-[var(--ed-ink)]"
            >
              Đơn từ mọi sàn, đóng đúng thùng, giao đúng người.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
              className="mt-6 max-w-[34rem] text-lg leading-relaxed text-[var(--ed-ink-soft)]"
            >
              OptiPackAI kéo đơn Lazada và AURELLE về một chỗ, gom đơn cùng người nhận,
              chỉ đường lấy hàng theo kệ, tính cách xếp vào thùng nhỏ nhất rồi tạo vận đơn
              GHN cho từng kiện.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.45 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <LandingAuthCta variant="hero" />
              <a
                href="#process"
                onClick={(e) => handleLandingHashClick(e, '#process')}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-[var(--ed-ink)] underline-offset-4 hover:underline"
              >
                Xem một đơn đi qua hệ thống
                <ArrowDownRight className="h-4 w-4" strokeWidth={2} />
              </a>
            </motion.div>

            <dl className="mt-10 grid max-w-[34rem] grid-cols-3 gap-6 border-t border-[var(--ed-line)] pt-6">
              {[
                ['2', 'sàn đang kết nối'],
                ['5', 'vai trò trong kho'],
                ['1 kiện', '= 1 vận đơn GHN'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="ed-display text-2xl text-[var(--ed-ink)]">{value}</dt>
                  <dd className="m-0 mt-1 text-sm text-[var(--ed-muted)]">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <motion.figure
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="m-0"
          >
            <PackedCartonIllustration />
          </motion.figure>
        </div>
      </div>
    </section>
  )
}
