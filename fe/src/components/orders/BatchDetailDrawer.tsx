import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Phone,
  Play,
  Printer,
  ScanLine,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import type { BatchChannel, PickingBatch } from '../../data/picking-batches-mock'
import { Button } from '../ui/Button'

interface BatchDetailDrawerProps {
  batch: PickingBatch | null
  onClose: () => void
  onStartPicking?: (batchId: string) => void
  onCompleteBatch?: (batchId: string) => void
  onOpenScanner?: () => void
  locale?: 'vi' | 'en'
}

function formatVnd(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

function renderChannelBadge(channel: BatchChannel) {
  switch (channel) {
    case 'shopee':
      return (
        <span className="inline-flex items-center rounded border border-[#f97316]/50 bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#ea580c] dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-400">
          Shopee
        </span>
      )
    case 'tiktok':
      return (
        <span className="inline-flex items-center rounded border border-slate-900 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          TikTok Shop
        </span>
      )
    case 'lazada':
      return (
        <span className="inline-flex items-center rounded border border-[#4f46e5]/50 bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#4f46e5] dark:border-indigo-500/40 dark:bg-indigo-950/20 dark:text-indigo-400">
          Lazada
        </span>
      )
    case 'facebook':
      return (
        <span className="inline-flex items-center rounded border border-[#2563eb]/50 bg-[#eff6ff] px-2 py-0.5 text-xs font-semibold text-[#2563eb] dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-400">
          Facebook
        </span>
      )
  }
}

export function BatchDetailDrawer({
  batch,
  onClose,
  onStartPicking,
  onCompleteBatch,
  onOpenScanner,
  locale = 'vi',
}: BatchDetailDrawerProps) {
  if (!batch) return null

  const vi = locale === 'vi'
  const progressPercent = Math.round(
    (batch.progress.picked / batch.progress.total) * 100,
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity cursor-pointer"
        aria-label="Đóng"
        onClick={onClose}
      />

      {/* Drawer content */}
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-surface-1">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {batch.id}
                </h2>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    batch.status === 'Picked'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : batch.status === 'Picking'
                        ? 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                        : batch.status === 'Pending'
                          ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                          : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
                  }`}
                >
                  {batch.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {vi ? 'Chi tiết đơn hàng của người đặt tại kho' : 'Customer order details in warehouse'} · {batch.zone}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-xs">
          {/* Quick Stats Banner */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-surface-2/60">
            <div className="flex items-center justify-between font-medium">
              <span className="text-slate-800 dark:text-slate-200">
                {vi ? 'Tiến độ lấy hàng' : 'Picking Progress'}
              </span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {batch.progress.picked}/{batch.progress.total} {vi ? 'sản phẩm' : 'items'} ({progressPercent}%)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-blue-500" />
                {vi ? 'Nhân viên phụ trách:' : 'Assigned:'}{' '}
                <strong className="font-medium text-slate-800 dark:text-slate-200">{batch.picker.name}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-500" />
                {batch.zone}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                {new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Section: Customer Orders Details */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                <h3 className="font-semibold text-slate-900 uppercase tracking-wider dark:text-slate-100">
                  {vi ? 'Thông tin người đặt hàng' : 'Customer Orders'} ({batch.orders.length})
                </h3>
              </div>
              {batch.orders.length > 1 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                  <Sparkles className="h-3 w-3" />
                  {vi ? 'Đơn gộp đa kênh' : 'Consolidated batch'}
                </span>
              ) : null}
            </div>

            <div className="space-y-4">
              {batch.orders.map((ord) => (
                <div
                  key={ord.orderId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1"
                >
                  {/* Order header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                          #{ord.orderId}
                        </span>
                        {renderChannelBadge(ord.channel)}
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{ord.createdAt}</span>
                      </div>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100 text-sm">
                        {ord.customerName}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatVnd(ord.totalAmount)}
                      </p>
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        {ord.paymentMethod}
                      </span>
                    </div>
                  </div>

                  {/* Customer Contact & Address */}
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2 bg-slate-50/70 p-3 rounded-lg dark:bg-surface-2/40">
                    <div className="flex items-start gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-slate-400 block text-[11px]">{vi ? 'Số điện thoại:' : 'Phone:'}</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{ord.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-slate-400 block text-[11px]">{vi ? 'Địa chỉ giao hàng:' : 'Address:'}</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">{ord.address}</span>
                      </div>
                    </div>
                    {ord.notes ? (
                      <div className="sm:col-span-2 flex items-center gap-2 text-amber-700 dark:text-amber-300 text-[11px] bg-amber-50/70 dark:bg-amber-950/20 px-2.5 py-1.5 rounded-md border border-amber-200/50">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span><strong>{vi ? 'Ghi chú:' : 'Note:'}</strong> {ord.notes}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Items in this customer's order */}
                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      {vi ? 'Sản phẩm khách đặt' : 'Ordered items'} ({ord.items.length})
                    </p>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden dark:divide-slate-800 dark:border-slate-800">
                      {ord.items.map((item) => (
                        <div
                          key={item.sku}
                          className="flex items-center justify-between p-2.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                                item.picked
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {item.picked ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3 w-3" />}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-200">{item.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-slate-400 text-[11px]">{item.sku}</span>
                                <span className="text-slate-300">·</span>
                                <span className="font-mono text-slate-600 dark:text-slate-400">{formatVnd(item.price)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="inline-block rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              Kệ: {item.bin}
                            </span>
                            <p className="mt-1 font-mono font-semibold text-slate-800 dark:text-slate-200">
                              SL: ×{item.qty}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI 3D Packaging recommendation */}
          {batch.aiPackaging ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                  <Sparkles className="h-4 w-4" />
                  <span>{vi ? 'Gợi ý đóng gói AI (3D Bin Packing)' : 'AI 3D Packing Suggestion'}</span>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.round(batch.aiPackaging.fillRatio * 100)}% {vi ? 'lấp đầy' : 'utilization'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-surface-1">
                  <span className="text-slate-400">{vi ? 'Mã thùng' : 'Box Code'}</span>
                  <p className="mt-1 font-mono font-bold text-slate-900 dark:text-slate-100">
                    {batch.aiPackaging.boxCode}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-surface-1">
                  <span className="text-slate-400">{vi ? 'Kích thước' : 'Dimensions'}</span>
                  <p className="mt-1 font-mono font-medium text-slate-800 dark:text-slate-200">
                    {batch.aiPackaging.dimensions}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-surface-1">
                  <span className="text-slate-400">{vi ? 'Đóng gói' : 'Packaging'}</span>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-200 truncate">
                    {batch.aiPackaging.cushioning ?? (vi ? 'Chèn xốp bảo vệ' : 'Cushioning')}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface-1">
          {batch.status === 'Pending' && onStartPicking ? (
            <Button
              variant="primary"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              onClick={() => onStartPicking(batch.id)}
            >
              <Play className="mr-1.5 h-4 w-4" />
              {vi ? 'Bắt đầu lấy hàng' : 'Start Picking'}
            </Button>
          ) : batch.status === 'Picking' && onCompleteBatch ? (
            <Button
              variant="primary"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              onClick={() => onCompleteBatch(batch.id)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {vi ? 'Hoàn tất lấy hàng' : 'Complete Batch Picking'}
            </Button>
          ) : null}

          {onOpenScanner ? (
            <Button
              variant="secondary"
              className="border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onOpenScanner}
            >
              <ScanLine className="mr-1.5 h-4 w-4" />
              {vi ? 'Quét Barcode tại kệ' : 'Scan at rack'}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            className="border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Printer className="mr-1.5 h-4 w-4" />
            {vi ? 'In phiếu lấy' : 'Print Pick Sheet'}
          </Button>
        </div>
      </aside>
    </div>
  )
}
