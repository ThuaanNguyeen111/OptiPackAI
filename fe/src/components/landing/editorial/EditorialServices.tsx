import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Layers3,
  PackageCheck,
  Route,
  Shuffle,
  Truck,
  Warehouse,
} from 'lucide-react'

const SERVICES = [
  {
    icon: Shuffle,
    tag: 'Sync',
    title: 'Đồng bộ đơn sàn',
    body: 'Kéo đơn Lazada thật về MongoDB, chuẩn hóa trạng thái và sẵn sàng mở rộng TikTok/Tiki.',
  },
  {
    icon: Layers3,
    tag: 'Consolidate',
    title: 'Gộp đơn trùng',
    body: 'Nhận diện cùng khách–địa chỉ, tạo nhóm đơn để lấy và đóng một lần thay vì rời rạc.',
  },
  {
    icon: PackageCheck,
    tag: 'AI Pack',
    title: 'Gợi ý đóng gói',
    body: 'Fallback First Fit Decreasing + lưới an toàn; AI thật cắm vào đúng một điểm gọi hàm.',
  },
  {
    icon: Warehouse,
    tag: 'WMS',
    title: 'Vị trí kho & tồn',
    body: 'Kệ 5 phần, picking list theo lộ trình, trừ tồn atomic khi quét từng SKU.',
  },
  {
    icon: Route,
    tag: 'Pick',
    title: 'Lấy hàng có kiểm soát',
    body: 'Report thiếu hàng, duyệt partial, giữ chỗ chống bán lố giữa các sàn.',
  },
  {
    icon: Truck,
    tag: 'Ship',
    title: 'Giao hàng tự thân',
    body: 'Vận đơn, sự kiện tracking, giao lại có khoảng cách — giả lập an toàn cho demo.',
  },
] as const

export function EditorialServices(): ReactNode {
  return (
    <section id="services" className="ed-section">
      <p className="ed-kicker">Dịch vụ lõi</p>
      <h2 className="ed-title">Sáu lớp vận hành, một hợp đồng dữ liệu</h2>
      <p className="ed-lead">
        Mỗi khối dưới đây map thẳng vào module đang chạy — không slide lý thuyết.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((item, i) => (
          <motion.article
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-6%' }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="group rounded-3xl border border-[var(--ed-line)] bg-white/75 p-6 shadow-[0_8px_28px_rgba(21,45,53,0.04)] transition-transform duration-300 hover:scale-[1.02]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ed-sage)_70%,white)] text-[var(--ed-ink)]">
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="rounded-full border border-[var(--ed-line)] px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--ed-muted)] uppercase">
                {item.tag}
              </span>
            </div>
            <h3 className="m-0 text-lg font-semibold tracking-tight text-[var(--ed-ink)]">
              {item.title}
            </h3>
            <p className="m-0 mt-2 text-sm leading-relaxed text-[var(--ed-ink-soft)]">
              {item.body}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
