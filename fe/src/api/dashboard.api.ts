import { apiRequest } from '../lib/api'

export type DashboardPlatform = 'lazada' | 'aurelle'

export type SalesTotals = {
  ordersReceived: number
  ordersCanceled: number
  revenuePlacedVnd: number
  ordersDelivered: number
  revenueDeliveredVnd: number
  avgOrderValueVnd: number | null
  cancelRate: number | null
}

export type DashboardActionQueue = {
  expressDueSoon: number
  expressOverdue: number
  awaitingPick: number
  picking: number
  partialNeedsReview: number
  stockShortageGroups: number
  plansAwaitingApproval: number
  plansAwaitingPacking: number
  plansWithHeldParcels: number
  readyToShip: number
  shipmentsInFlight: number
  deliveryFailed: number
  returningToWarehouse: number
  carrierBookingErrors: number
  ordersAwaitingCancelConfirm: number
  returnsToReview: number
  returnsToReceive: number
  returnsToInspect: number
  marketplaceWritebackFailed: number
}

export type DashboardSummary = {
  range: {
    from: string
    to: string
    previousFrom: string
    previousTo: string
    platform: string | null
    generatedAt: string
  }
  actionQueue: DashboardActionQueue
  sales: {
    current: SalesTotals
    previous: SalesTotals
    change: {
      ordersReceived: number | null
      revenuePlacedVnd: number | null
      revenueDeliveredVnd: number | null
      avgOrderValueVnd: number | null
    }
    byPlatform: {
      platform: string
      ordersReceived: number
      ordersCanceled: number
      revenuePlacedVnd: number
      ordersDelivered: number
      revenueDeliveredVnd: number
    }[]
    daily: {
      date: string
      ordersReceived: number
      revenuePlacedVnd: number
      ordersDelivered: number
      revenueDeliveredVnd: number
    }[]
  }
  delivery: {
    shipmentsCreated: number
    shipmentsDelivered: number
    firstAttemptSuccessRate: number | null
    avgDeliveryHours: number | null
    returnedToWarehouse: number
  }
  costs: {
    shippingCostVnd: number
    ordersShipped: number
    shippingCostPerOrderVnd: number | null
    packagingCostVnd: number
    ordersPacked: number
    packagingCostPerOrderVnd: number | null
    fulfillmentCostRate: number | null
  }
  returns: {
    customerRequests: number
    byType: { type: string; count: number }[]
    returnRate: number | null
  }
  express: {
    total: number
    onTime: number
    late: number
    pending: number
    onTimeRate: number | null
  }
  warehouse: {
    shortageSkus: { sku: string; shortage: number; groups: number }[]
    shortageSkuCount: number
    outOfStockSkus: string[]
    outOfStockSkuCount: number
    materialsBelowReorder: {
      code: string
      name: string
      kind: string
      usable: number
      reorderLevel: number
    }[]
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return ''
}

function salesTotals(value: unknown): SalesTotals {
  const row = asRecord(value) ?? {}
  return {
    ordersReceived: num(row.ordersReceived ?? row.orders_received),
    ordersCanceled: num(row.ordersCanceled ?? row.orders_canceled),
    revenuePlacedVnd: num(row.revenuePlacedVnd ?? row.revenue_placed_vnd),
    ordersDelivered: num(row.ordersDelivered ?? row.orders_delivered),
    revenueDeliveredVnd: num(row.revenueDeliveredVnd ?? row.revenue_delivered_vnd),
    avgOrderValueVnd: numOrNull(row.avgOrderValueVnd ?? row.avg_order_value_vnd),
    cancelRate: numOrNull(row.cancelRate ?? row.cancel_rate),
  }
}

function actionQueue(value: unknown): DashboardActionQueue {
  const row = asRecord(value) ?? {}
  const pick = (camel: keyof DashboardActionQueue, snake: string): number =>
    num(row[camel] ?? row[snake])
  return {
    expressDueSoon: pick('expressDueSoon', 'express_due_soon'),
    expressOverdue: pick('expressOverdue', 'express_overdue'),
    awaitingPick: pick('awaitingPick', 'awaiting_pick'),
    picking: pick('picking', 'picking'),
    partialNeedsReview: pick('partialNeedsReview', 'partial_needs_review'),
    stockShortageGroups: pick('stockShortageGroups', 'stock_shortage_groups'),
    plansAwaitingApproval: pick('plansAwaitingApproval', 'plans_awaiting_approval'),
    plansAwaitingPacking: pick('plansAwaitingPacking', 'plans_awaiting_packing'),
    plansWithHeldParcels: pick('plansWithHeldParcels', 'plans_with_held_parcels'),
    readyToShip: pick('readyToShip', 'ready_to_ship'),
    shipmentsInFlight: pick('shipmentsInFlight', 'shipments_in_flight'),
    deliveryFailed: pick('deliveryFailed', 'delivery_failed'),
    returningToWarehouse: pick('returningToWarehouse', 'returning_to_warehouse'),
    carrierBookingErrors: pick('carrierBookingErrors', 'carrier_booking_errors'),
    ordersAwaitingCancelConfirm: pick('ordersAwaitingCancelConfirm', 'orders_awaiting_cancel_confirm'),
    returnsToReview: pick('returnsToReview', 'returns_to_review'),
    returnsToReceive: pick('returnsToReceive', 'returns_to_receive'),
    returnsToInspect: pick('returnsToInspect', 'returns_to_inspect'),
    marketplaceWritebackFailed: pick('marketplaceWritebackFailed', 'marketplace_writeback_failed'),
  }
}

function mapSummary(value: unknown): DashboardSummary {
  const row = asRecord(value) ?? {}
  const range = asRecord(row.range) ?? {}
  const sales = asRecord(row.sales) ?? {}
  const change = asRecord(sales.change) ?? {}
  const delivery = asRecord(row.delivery) ?? {}
  const costs = asRecord(row.costs) ?? {}
  const returns = asRecord(row.returns) ?? {}
  const express = asRecord(row.express) ?? {}
  const warehouse = asRecord(row.warehouse) ?? {}
  const byPlatform = Array.isArray(sales.byPlatform)
    ? sales.byPlatform
    : Array.isArray(sales.by_platform)
      ? sales.by_platform
      : []
  const daily = Array.isArray(sales.daily) ? sales.daily : []
  const byType = Array.isArray(returns.byType)
    ? returns.byType
    : Array.isArray(returns.by_type)
      ? returns.by_type
      : []
  const shortage = Array.isArray(warehouse.shortageSkus)
    ? warehouse.shortageSkus
    : Array.isArray(warehouse.shortage_skus)
      ? warehouse.shortage_skus
      : []
  const outOfStock = Array.isArray(warehouse.outOfStockSkus)
    ? warehouse.outOfStockSkus
    : Array.isArray(warehouse.out_of_stock_skus)
      ? warehouse.out_of_stock_skus
      : []
  const materials = Array.isArray(warehouse.materialsBelowReorder)
    ? warehouse.materialsBelowReorder
    : Array.isArray(warehouse.materials_below_reorder)
      ? warehouse.materials_below_reorder
      : []

  return {
    range: {
      from: text(range.from),
      to: text(range.to),
      previousFrom: text(range.previousFrom ?? range.previous_from),
      previousTo: text(range.previousTo ?? range.previous_to),
      platform: typeof range.platform === 'string' ? range.platform : null,
      generatedAt: text(range.generatedAt ?? range.generated_at),
    },
    actionQueue: actionQueue(row.actionQueue ?? row.action_queue),
    sales: {
      current: salesTotals(sales.current),
      previous: salesTotals(sales.previous),
      change: {
        ordersReceived: numOrNull(change.ordersReceived ?? change.orders_received),
        revenuePlacedVnd: numOrNull(change.revenuePlacedVnd ?? change.revenue_placed_vnd),
        revenueDeliveredVnd: numOrNull(change.revenueDeliveredVnd ?? change.revenue_delivered_vnd),
        avgOrderValueVnd: numOrNull(change.avgOrderValueVnd ?? change.avg_order_value_vnd),
      },
      byPlatform: byPlatform.map((item) => {
        const line = asRecord(item) ?? {}
        return {
          platform: text(line.platform),
          ordersReceived: num(line.ordersReceived ?? line.orders_received),
          ordersCanceled: num(line.ordersCanceled ?? line.orders_canceled),
          revenuePlacedVnd: num(line.revenuePlacedVnd ?? line.revenue_placed_vnd),
          ordersDelivered: num(line.ordersDelivered ?? line.orders_delivered),
          revenueDeliveredVnd: num(line.revenueDeliveredVnd ?? line.revenue_delivered_vnd),
        }
      }),
      daily: daily.map((item) => {
        const line = asRecord(item) ?? {}
        return {
          date: text(line.date),
          ordersReceived: num(line.ordersReceived ?? line.orders_received),
          revenuePlacedVnd: num(line.revenuePlacedVnd ?? line.revenue_placed_vnd),
          ordersDelivered: num(line.ordersDelivered ?? line.orders_delivered),
          revenueDeliveredVnd: num(line.revenueDeliveredVnd ?? line.revenue_delivered_vnd),
        }
      }),
    },
    delivery: {
      shipmentsCreated: num(delivery.shipmentsCreated ?? delivery.shipments_created),
      shipmentsDelivered: num(delivery.shipmentsDelivered ?? delivery.shipments_delivered),
      firstAttemptSuccessRate: numOrNull(
        delivery.firstAttemptSuccessRate ?? delivery.first_attempt_success_rate,
      ),
      avgDeliveryHours: numOrNull(delivery.avgDeliveryHours ?? delivery.avg_delivery_hours),
      returnedToWarehouse: num(delivery.returnedToWarehouse ?? delivery.returned_to_warehouse),
    },
    costs: {
      shippingCostVnd: num(costs.shippingCostVnd ?? costs.shipping_cost_vnd),
      ordersShipped: num(costs.ordersShipped ?? costs.orders_shipped),
      shippingCostPerOrderVnd: numOrNull(
        costs.shippingCostPerOrderVnd ?? costs.shipping_cost_per_order_vnd,
      ),
      packagingCostVnd: num(costs.packagingCostVnd ?? costs.packaging_cost_vnd),
      ordersPacked: num(costs.ordersPacked ?? costs.orders_packed),
      packagingCostPerOrderVnd: numOrNull(
        costs.packagingCostPerOrderVnd ?? costs.packaging_cost_per_order_vnd,
      ),
      fulfillmentCostRate: numOrNull(costs.fulfillmentCostRate ?? costs.fulfillment_cost_rate),
    },
    returns: {
      customerRequests: num(returns.customerRequests ?? returns.customer_requests),
      byType: byType.map((item) => {
        const line = asRecord(item) ?? {}
        return { type: text(line.type), count: num(line.count) }
      }),
      returnRate: numOrNull(returns.returnRate ?? returns.return_rate),
    },
    express: {
      total: num(express.total),
      onTime: num(express.onTime ?? express.on_time),
      late: num(express.late),
      pending: num(express.pending),
      onTimeRate: numOrNull(express.onTimeRate ?? express.on_time_rate),
    },
    warehouse: {
      shortageSkus: shortage.map((item) => {
        const line = asRecord(item) ?? {}
        return {
          sku: text(line.sku),
          shortage: num(line.shortage),
          groups: num(line.groups),
        }
      }),
      shortageSkuCount: num(warehouse.shortageSkuCount ?? warehouse.shortage_sku_count),
      outOfStockSkus: outOfStock.filter((item): item is string => typeof item === 'string'),
      outOfStockSkuCount: num(warehouse.outOfStockSkuCount ?? warehouse.out_of_stock_sku_count),
      materialsBelowReorder: materials.map((item) => {
        const line = asRecord(item) ?? {}
        return {
          code: text(line.code),
          name: text(line.name),
          kind: text(line.kind),
          usable: num(line.usable),
          reorderLevel: num(line.reorderLevel ?? line.reorder_level),
        }
      }),
    },
  }
}

export async function getDashboardSummary(params: {
  from: string
  to: string
  platform?: DashboardPlatform | ''
}): Promise<DashboardSummary> {
  const qs = new URLSearchParams({ from: params.from, to: params.to })
  if (params.platform) qs.set('platform', params.platform)
  const res = await apiRequest<{ summary?: unknown }>(`/dashboard/summary?${qs.toString()}`, {
    auth: true,
  })
  return mapSummary(res.summary)
}
