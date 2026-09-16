import { Check, GitMerge, Split, X } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  channelColors,
  channelLabels,
  type PortalOrder,
} from '../../data/portal-mock'

type ConsolidationActionDrawerProps = {
  order: PortalOrder
  locale: 'vi' | 'en'
  mode: 'consolidate' | 'inspect'
  onClose: () => void
  onConfirmConsolidate: () => void
  onUnmerge: () => void
}

export function ConsolidationActionDrawer({
  order,
  locale,
  mode,
  onClose,
  onConfirmConsolidate,
  onUnmerge,
}: ConsolidationActionDrawerProps) {
  const vi = locale === 'vi'
  const isPending = order.classification === 'pending_merge'
  const isConsolidated = order.classification === 'consolidated'
  const proposedId =
    order.proposed_package_id ?? order.package_id

  return (
    <aside className="flex w-full flex-col border-l border-hairline bg-surface-1 lg:w-[400px]">
      <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
          <h2 className="text-sm font-medium text-ink">
            {mode === 'consolidate' || isPending
              ? vi
                ? 'Xem trước gộp đơn'
                : 'Consolidation Preview'
              : vi
                ? 'Kiện đã gộp'
                : 'Consolidated Package'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {order.matching_badge ? (
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary-hover">
            {order.matching_badge}
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            {vi ? 'Source Orders' : 'Source Orders'}
          </p>
          <ul className="space-y-2">
            {order.source_orders.map((src) => (
              <li
                key={src.external_id}
                className="flex items-center justify-between rounded-lg border border-hairline bg-canvas px-3 py-2"
              >
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${channelColors[src.channel]}`}
                >
                  {channelLabels[src.channel]}
                </span>
                <span className="font-mono text-sm text-ink">{src.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-hairline bg-canvas p-4">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            {vi ? 'Matched Info' : 'Matched Info'}
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-ink-subtle">
                {vi ? 'Khách hàng' : 'Customer Name'}
              </dt>
              <dd className="text-ink">{order.customer_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">
                {vi ? 'Số điện thoại' : 'Phone Number'}
              </dt>
              <dd className="font-mono text-ink">
                {order.match_criteria?.phone_display ?? order.customer_phone}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">
                {vi ? 'Địa chỉ giao' : 'Shipping Address'}
              </dt>
              <dd className="text-ink">
                {order.match_criteria?.address_display ?? order.customer_address}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Address (full)</dt>
              <dd className="text-xs text-ink-muted">{order.customer_address}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
          <p className="text-[10px] font-medium tracking-wide text-primary-hover uppercase">
            {isPending
              ? vi
                ? 'Proposed Consolidated Package'
                : 'Proposed Consolidated Package ID'
              : vi
                ? 'AOFP Package'
                : 'AOFP Package ID'}
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-ink">
            {isPending ? proposedId : order.package_id}
          </p>
          <p className="mt-1 font-mono text-[11px] text-ink-subtle">
            {order.source_orders.map((s) => s.label).join(' + ')} →{' '}
            {isPending ? proposedId : order.package_id}
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t border-hairline p-4">
        {isPending ? (
          <Button
            variant="primary"
            className="w-full shadow-[0_0_20px_rgba(99,102,241,0.25)]"
            onClick={onConfirmConsolidate}
          >
            <Check className="mr-1.5 h-4 w-4" />
            {vi ? 'Xác nhận Gộp đơn' : 'Confirm Consolidation'}
          </Button>
        ) : null}

        {isConsolidated ? (
          <Button variant="ghost" className="w-full" onClick={onUnmerge}>
            <Split className="mr-1.5 h-4 w-4" />
            {vi ? 'Tách đơn / Unmerge' : 'Unmerge / Tách đơn'}
          </Button>
        ) : null}

        <Button variant="secondary" className="w-full" onClick={onClose}>
          {vi ? 'Đóng' : 'Close'}
        </Button>
      </div>
    </aside>
  )
}
