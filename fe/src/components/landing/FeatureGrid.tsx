import {
  BarChart3,
  Boxes,
  PackageCheck,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'

const features: {
  id: string
  title: string
  description: string
  icon: LucideIcon
  accent: string
}[] = [
  {
    id: 'integrations',
    title: 'Đồng bộ đa kênh',
    description:
      'Tự động đồng bộ đơn hàng, thông tin khách, thanh toán và trạng thái từ Shopee, TikTok Shop, Lazada và Facebook theo thời gian thực.',
    icon: RefreshCw,
    accent: 'text-shopee',
  },
  {
    id: 'ai',
    title: 'AI 3D Bin Packing',
    description:
      'Gợi ý kích thước carton tối ưu, tính trọng lượng thể tích và bảo vệ hàng dễ vỡ — giảm tối đa khoảng trống thừa.',
    icon: Boxes,
    accent: 'text-primary-hover',
  },
  {
    id: 'fulfillment',
    title: 'Fulfillment kho',
    description:
      'Sinh picking list theo lô, quét QR/Barcode trên mobile và in nhãn vận chuyển hàng loạt.',
    icon: PackageCheck,
    accent: 'text-tiktok',
  },
  {
    id: 'analytics',
    title: 'Phân tích chi phí & vận hành',
    description:
      'Theo dõi vật liệu đóng gói, phí ship và năng suất kho; xuất báo cáo Excel/PDF.',
    icon: BarChart3,
    accent: 'text-success',
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-medium tracking-wider text-primary-hover uppercase">
            Tính năng
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Đầy đủ cho fulfillment đa kênh
          </h2>
          <p className="mt-3 text-sm text-ink-muted sm:text-base">
            Từ đồng bộ sàn đến AI đóng gói và vận hành kho — một hệ thống nội bộ
            cho chủ cửa hàng và đội kho.
          </p>
        </div>

        <div
          id="integrations"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature) => {
            const Icon = feature.icon
            const sectionId =
              feature.id === 'analytics' ? 'analytics' : undefined
            return (
              <article
                key={feature.title}
                id={sectionId}
                className="scroll-mt-20 rounded-xl border border-hairline bg-surface-1 p-5 transition-colors hover:border-primary/35"
              >
                <div
                  className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-canvas ${feature.accent}`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {feature.description}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
