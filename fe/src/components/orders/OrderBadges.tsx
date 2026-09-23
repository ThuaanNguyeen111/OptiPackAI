import { Badge } from '../ui/Badge'
import type {
  ConsolidationType,
  OrderStatus,
  SyncPipelineStatus,
} from '../../types/orders'
import {
  consolidationTypeLabels,
  pipelineLabels,
  statusLabels,
} from '../../types/orders'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === 'shipped'
      ? 'success'
      : status === 'packing'
        ? 'warning'
        : status === 'consolidated'
          ? 'primary'
          : 'default'

  return <Badge tone={tone}>{statusLabels[status]}</Badge>
}

export function PipelineBadge({ status }: { status: SyncPipelineStatus }) {
  const tone =
    status === 'saved'
      ? 'success'
      : status === 'sync_error'
        ? 'warning'
        : status === 'normalized' || status === 'consolidated'
          ? 'primary'
          : 'default'

  return <Badge tone={tone}>{pipelineLabels[status]}</Badge>
}

export function ConsolidationTypeBadge({
  type,
}: {
  type: ConsolidationType
}) {
  const tone =
    type === 'consolidated'
      ? 'primary'
      : type === 'pending_merge'
        ? 'warning'
        : 'default'

  return <Badge tone={tone}>{consolidationTypeLabels[type]}</Badge>
}
