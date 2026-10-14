import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'

const WORKS = [
  {
    title: 'Wave pick khu KA',
    category: 'Warehouse',
    location: 'Kho demo · HCM',
    image:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1100&q=80',
  },
  {
    title: 'Gộp 3 đơn Lazada',
    category: 'Consolidation',
    location: 'Shop i7Yix2IJ',
    image:
      'https://images.unsplash.com/photo-1566576721346-d77f49fa5db9?auto=format&fit=crop&w=1100&q=80',
  },
  {
    title: 'Thùng tái sử dụng hạng A',
    category: 'Packaging',
    location: 'QC hoàn · R1',
    image:
      'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=1100&q=80',
  },
  {
    title: 'Chuyến giao 3 điểm',
    category: 'Own fleet',
    location: 'SOF · Bản đồ demo',
    image:
      'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?auto=format&fit=crop&w=1100&q=80',
  },
] as const

export function EditorialWorks(): ReactNode {
  return (
    <section id="works" className="ed-section">
      <p className="ed-kicker">Works</p>
      <h2 className="ed-title">Cảnh vận hành đã chạy thật</h2>
      <p className="ed-lead">
        Không portfolio agency — đây là các mặt cắt của hệ thống OptiPackAI trên dữ liệu demo.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {WORKS.map((work, i) => (
          <motion.article
            key={work.title}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-6%' }}
            transition={{ delay: i * 0.06, duration: 0.45 }}
            className="group overflow-hidden rounded-[1.75rem] border border-[var(--ed-line)] bg-white shadow-[0_12px_40px_rgba(21,45,53,0.05)] transition-transform duration-300 hover:scale-[1.015]"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={work.image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <span className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--ed-ink)] backdrop-blur-sm">
                {work.category}
              </span>
            </div>
            <div className="flex items-end justify-between gap-3 p-5">
              <h3 className="m-0 text-lg font-semibold tracking-tight text-[var(--ed-ink)]">
                {work.title}
              </h3>
              <p className="m-0 flex shrink-0 items-center gap-1 text-xs text-[var(--ed-muted)]">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                {work.location}
              </p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
