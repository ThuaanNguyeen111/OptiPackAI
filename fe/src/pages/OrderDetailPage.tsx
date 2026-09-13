import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { OrderDetailDrawer } from '../components/orders/OrderDetailDrawer'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'

/**
 * Deep-link /app/orders/:id — mở danh sách + drawer chi tiết (UI gần bản cũ).
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [selectedId, setSelectedId] = useState<string | null>(id ?? null)

  useEffect(() => {
    setSelectedId(id ?? null)
  }, [id])

  if (!id) {
    return (
      <>
        <PortalTopBar
          breadcrumbs={[
            { label: 'OptiPackAI', to: '/app' },
            { label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders', to: '/app/orders' },
          ]}
        />
        <main className="flex flex-1 items-center justify-center bg-[#F9FAFB] p-6 dark:bg-[#0B0E14]">
          <Link to="/app/orders" className="text-sm text-[#2563eb] hover:underline">
            {vi ? '← Quay lại danh sách' : '← Back to list'}
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          {
            label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders',
            to: '/app/orders',
          },
          { label: id },
        ]}
      />
      <main className="relative flex flex-1 flex-col bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
          <Link
            to="/app/orders"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {vi ? 'Danh sách đơn đa kênh' : 'Omnichannel order list'}
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi
              ? 'Đang mở chi tiết đơn hàng…'
              : 'Opening order detail…'}
          </div>
        </div>
        <OrderDetailDrawer
          orderId={selectedId}
          locale={locale}
          onClose={() => navigate('/app/orders')}
          onOpenOrder={(nextId) => {
            setSelectedId(nextId)
            navigate(`/app/orders/${nextId}`, { replace: true })
          }}
          onFilterGroup={(groupId) =>
            navigate(`/app/orders?group=${encodeURIComponent(groupId)}`)
          }
        />
      </main>
    </>
  )
}
