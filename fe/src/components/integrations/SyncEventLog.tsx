import type { SyncLogEvent } from '../../types/orders'
import { marketplaceLabels } from '../../types/orders'
import { syncEventTypeLabels } from '../../data/mock-integrations'
import { formatDate } from '../../utils/format'
import { Badge } from '../ui/Badge'

type SyncEventLogProps = {
  events: SyncLogEvent[]
}

export function SyncEventLog({ events }: SyncEventLogProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-1">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-ink-subtle">
            <th className="px-4 py-3 font-medium">Thời gian</th>
            <th className="px-4 py-3 font-medium">Sàn</th>
            <th className="px-4 py-3 font-medium">Loại</th>
            <th className="px-4 py-3 font-medium">Mã sàn</th>
            <th className="px-4 py-3 font-medium">Trạng thái</th>
            <th className="px-4 py-3 font-medium">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              className="border-b border-hairline/70 last:border-b-0 hover:bg-surface-2/40"
            >
              <td className="px-4 py-3 text-ink-subtle">{formatDate(event.at)}</td>
              <td className="px-4 py-3 text-ink-muted">
                {marketplaceLabels[event.marketplace]}
              </td>
              <td className="px-4 py-3 text-ink">
                {syncEventTypeLabels[event.event_type]}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-ink-tertiary">
                {event.external_id}
              </td>
              <td className="px-4 py-3">
                <Badge tone={event.status === 'success' ? 'success' : 'warning'}>
                  {event.status === 'success' ? 'OK' : 'Lỗi'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-ink-subtle">{event.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
