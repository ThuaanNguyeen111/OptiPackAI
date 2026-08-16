import { useState } from 'react'
import {
  Boxes,
  ClipboardList,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react'

type Actor = {
  id: string
  label: string
  icon: LucideIcon
  headline: string
  points: string[]
}

const actors: Actor[] = [
  {
    id: 'owner',
    label: 'Chủ cửa hàng',
    icon: Store,
    headline: 'Theo dõi mọi kênh bán trong một nơi',
    points: [
      'Kết nối webhook Shopee & TikTok Shop',
      'Xem đơn đã gộp và dashboard vận hành',
      'Cấu hình quy tắc đóng gói & ưu tiên ship',
      'Phân tích báo cáo theo thời gian thực',
    ],
  },
  {
    id: 'warehouse',
    label: 'Nhân viên kho',
    icon: ClipboardList,
    headline: 'Pick & pack không cần chuyển app',
    points: [
      'Nhận picking list theo lô',
      'Xác nhận hoàn tất đóng gói tại kho',
      'In packing slip & nhãn vận chuyển',
      'Cập nhật trạng thái fulfillment trực tiếp',
    ],
  },
  {
    id: 'shipping',
    label: 'Điều phối vận chuyển',
    icon: Truck,
    headline: 'Chọn đơn vị vận chuyển phù hợp mỗi kiện',
    points: [
      'Ước tính phí ship & trọng lượng thể tích',
      'Sinh nhãn vận chuyển hàng loạt',
      'Lên lịch lấy hàng và theo dõi shipment',
      'So sánh lựa chọn carrier theo từng kiện',
    ],
  },
  {
    id: 'packaging',
    label: 'Chuyên viên đóng gói',
    icon: Boxes,
    headline: 'Tin AI, rồi xác nhận bằng kiểm tra thực tế',
    points: [
      'Xem gợi ý carton & vật liệu chèn lót',
      'Xác nhận kích thước & trọng lượng kiện',
      'Duyệt kế hoạch đóng gói trước khi ship',
      'Giảm khoảng trống thừa và lãng phí vật liệu',
    ],
  },
]

export function ActorsSection() {
  const [active, setActive] = useState(actors[0].id)
  const current = actors.find((a) => a.id === active) ?? actors[0]
  const Icon = current.icon

  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium tracking-wider text-primary-hover uppercase">
            Dành cho mọi vai trò
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Actors & giá trị sử dụng
          </h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
          <div className="flex flex-wrap gap-1 border-b border-hairline p-2">
            {actors.map((actor) => (
              <button
                key={actor.id}
                type="button"
                onClick={() => setActive(actor.id)}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  active === actor.id
                    ? 'bg-primary/15 text-primary-hover'
                    : 'text-ink-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                {actor.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-[200px_1fr] md:items-start">
            <div className="flex flex-col items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-canvas text-primary-hover">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-ink">{current.label}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-ink">
                {current.headline}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {current.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-sm text-ink-muted"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
