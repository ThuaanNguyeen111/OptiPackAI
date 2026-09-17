import { useMemo, useState } from 'react'
import { Header } from '../components/layout/Header'
import {
  ConsolidationGroupCard,
  ConsolidationPreview,
} from '../components/orders/ConsolidationGroupCard'
import { mockConsolidationGroups } from '../data/mock-consolidation'
import { mockOrders } from '../data/mock-orders'
import type { ConsolidationGroup } from '../types/orders'

export function ConsolidationPage() {
  const [groups, setGroups] = useState(mockConsolidationGroups)
  const [selectedId, setSelectedId] = useState(
    mockConsolidationGroups.find((g) => g.status === 'pending_review')?.id ??
      mockConsolidationGroups[0]?.id,
  )

  const selectedGroup = groups.find((g) => g.id === selectedId)

  const ordersForGroup = useMemo(() => {
    if (!selectedGroup) return []
    return mockOrders.filter((o) => selectedGroup.order_ids.includes(o.id))
  }, [selectedGroup])

  const pendingCount = groups.filter((g) => g.status === 'pending_review').length

  function handleMerge(groupId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              id: 'PKG-002',
              status: 'merged' as const,
              match_reason: 'Đã gộp thủ công · cùng khách hàng',
            }
          : g,
      ),
    )
    setSelectedId('PKG-002')
  }

  function handleKeepSeparate(groupId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              status: 'split' as ConsolidationGroup['status'],
              match_reason: 'Giữ riêng từng đơn · không gộp kiện',
            }
          : g,
      ),
    )
  }

  return (
    <>
      <Header
        title="Gộp đơn"
        description="Khớp khách hàng · Consolidate hoặc tạo đơn lẻ"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-sm text-ink-subtle">
            {pendingCount} nhóm chờ duyệt · Matching customer information?
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              {groups.map((group) => {
                const orders = mockOrders.filter((o) =>
                  group.order_ids.includes(o.id),
                )
                return (
                  <ConsolidationGroupCard
                    key={group.id}
                    group={group}
                    orders={orders}
                    selected={group.id === selectedId}
                    onSelect={() => setSelectedId(group.id)}
                    onMerge={
                      group.status === 'pending_review'
                        ? () => handleMerge(group.id)
                        : undefined
                    }
                    onKeepSeparate={
                      group.status === 'pending_review'
                        ? () => handleKeepSeparate(group.id)
                        : undefined
                    }
                  />
                )
              })}
            </div>

            {selectedGroup ? (
              <ConsolidationPreview
                group={selectedGroup}
                orders={ordersForGroup}
              />
            ) : null}
          </div>
        </div>
      </main>
    </>
  )
}
