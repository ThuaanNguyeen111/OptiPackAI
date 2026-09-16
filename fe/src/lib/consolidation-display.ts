/**
 * FE-only helpers for omnichannel consolidation display rules
 * (teacher feedback 2026-09): gộp chỉ khi ≥2 nền tảng khác nhau;
 * hủy 1 đơn → gỡ khỏi group, phần còn lại tiếp tục (Hướng B).
 */

const DETACH_STORAGE_KEY = 'optipack.detached-from-group.v1'

export type ConsolidationMember = {
  id: string
  platform: string
  platformOrderId: string
  platformOrderNumber?: string
  status?: string
}

export function distinctPlatforms(
  members: Array<{ platform: string }>,
): string[] {
  return [
    ...new Set(
      members
        .map((m) => m.platform.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

/** Rule nghiệp vụ: chỉ coi là "đơn gộp đa sàn" khi ≥ 2 platform khác nhau. */
export function isMultiPlatformGroup(
  members: Array<{ platform: string }>,
): boolean {
  return distinctPlatforms(members).length >= 2
}

export function displayPlatformOrderId(member: {
  platformOrderId: string
  platformOrderNumber?: string
}): string {
  return member.platformOrderNumber ?? member.platformOrderId
}

/** Chuỗi mã đơn từng sàn, VD: "Lazada #123 · TikTok #456" */
export function formatPlatformOrderIds(
  members: ConsolidationMember[],
  locale: 'vi' | 'en' = 'vi',
): string {
  if (members.length === 0) return locale === 'vi' ? 'Chưa có mã đơn' : 'No order IDs'
  return members
    .map((m) => {
      const platform =
        m.platform.charAt(0).toUpperCase() + m.platform.slice(1).toLowerCase()
      return `${platform} #${displayPlatformOrderId(m)}`
    })
    .join(' · ')
}

function readDetachMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DETACH_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string[]>
  } catch {
    return {}
  }
}

function writeDetachMap(map: Record<string, string[]>): void {
  localStorage.setItem(DETACH_STORAGE_KEY, JSON.stringify(map))
}

export function getDetachedOrderIds(groupKey: string): string[] {
  return readDetachMap()[groupKey] ?? []
}

export function isOrderDetachedFromGroup(
  groupKey: string,
  orderId: string,
): boolean {
  return getDetachedOrderIds(groupKey).includes(orderId)
}

/** Hướng B: gỡ đơn đã hủy khỏi group (FE demo, không gọi BE). */
export function detachOrderFromGroup(
  groupKey: string,
  orderId: string,
): void {
  const map = readDetachMap()
  const current = new Set(map[groupKey] ?? [])
  current.add(orderId)
  map[groupKey] = [...current]
  writeDetachMap(map)
}

export function filterActiveGroupMembers<T extends { id: string }>(
  groupKey: string,
  members: T[],
): T[] {
  const detached = new Set(getDetachedOrderIds(groupKey))
  return members.filter((m) => !detached.has(m.id))
}

export function shortGroupCode(groupId: string): string {
  const tail = groupId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()
  return `GRP-${tail || 'XXXXXX'}`
}

export function consolidationBadgeLabel(
  multiPlatform: boolean,
  orderCount: number,
  locale: 'vi' | 'en' = 'vi',
  compact = false,
  platformCount?: number,
): { label: string; tone: 'primary' | 'default' | 'warning' } {
  if (multiPlatform) {
    const platforms = platformCount ?? orderCount
    return {
      label: compact
        ? locale === 'vi'
          ? `Gộp ${platforms} sàn`
          : `${platforms} channels`
        : locale === 'vi'
          ? `Gộp đa sàn (${orderCount} đơn)`
          : `Multi-platform (${orderCount})`,
      tone: 'primary',
    }
  }
  if (orderCount > 1) {
    return {
      label: compact
        ? locale === 'vi'
          ? 'Cùng ĐC'
          : 'Same addr'
        : locale === 'vi'
          ? 'Cùng địa chỉ (chưa đủ đa sàn)'
          : 'Same address (not multi-platform)',
      tone: 'default',
    }
  }
  return {
    label: locale === 'vi' ? 'Đơn lẻ' : 'Standalone',
    tone: 'default',
  }
}
