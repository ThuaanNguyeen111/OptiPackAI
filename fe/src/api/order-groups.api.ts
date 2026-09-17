import { apiRequest } from '../lib/api'
import type {
  DecidePartialInput,
  ListOrderGroupsParams,
  OrderGroup,
  SetPriorityInput,
} from '../types/order-groups'

function toQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    qs.set(key, value)
  }
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listOrderGroups(
  params: ListOrderGroupsParams = {},
): Promise<OrderGroup[]> {
  const query = toQuery({
    fulfillment_status: params.fulfillment_status,
    platform: params.platform,
    order_priority: params.order_priority,
  })
  const res = await apiRequest<OrderGroup[]>(`/order-groups${query}`, {
    auth: true,
  })
  return Array.isArray(res) ? res : []
}

export async function getOrderGroupById(id: string): Promise<OrderGroup> {
  return apiRequest<OrderGroup>(`/order-groups/${id}`, { auth: true })
}

export async function setOrderGroupPriority(
  id: string,
  input: SetPriorityInput,
): Promise<OrderGroup> {
  return apiRequest<OrderGroup>(`/order-groups/${id}/priority`, {
    method: 'PATCH',
    body: {
      order_priority: input.order_priority,
      ...(input.deadline_hours !== undefined
        ? { deadline_hours: input.deadline_hours }
        : {}),
    },
    auth: true,
  })
}

export async function decidePartialOrderGroup(
  id: string,
  input: DecidePartialInput,
): Promise<OrderGroup> {
  return apiRequest<OrderGroup>(
    `/order-groups/${id}/fulfillment/decide-partial`,
    {
      method: 'POST',
      body: {
        approve: input.approve,
        expected_version: input.expected_version,
      },
      auth: true,
    },
  )
}

export type StaffSearchItem = {
  staffId: string
  fullName: string
  email: string
  activeWorkload: number
}

export async function searchOrderGroupStaff(
  q: string,
): Promise<StaffSearchItem[]> {
  const query = toQuery({ q: q.trim() || undefined })
  const res = await apiRequest<StaffSearchItem[]>(
    `/order-groups/staff/search${query}`,
    { auth: true },
  )
  return Array.isArray(res) ? res : []
}
