/**
 * FE-only helpers for consolidation display.
 *
 * ĐÃ ĐỔI (2026-09-16, khớp BE sync từ main): `consolidation_key` BE
 * gồm `platform` → live chỉ gộp cùng sàn. Tab/badge "đa sàn" chỉ còn
 * cho dữ liệu DEMO FE; nhóm live `isConsolidated` = "Đơn gộp".
 * Hướng B detach (localStorage) giữ nguyên — không gọi BE.
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

/** True khi nhóm có ≥2 sàn — hiện chỉ xuất hiện ở DEMO FE, không phải live BE. */
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
  // Demo FE only — live BE không tạo nhóm đa sàn.
  if (multiPlatform) {
    const platforms = platformCount ?? orderCount
    return {
      label: compact
        ? locale === 'vi'
          ? `Demo ${platforms} sàn`
          : `Demo ${platforms}ch`
        : locale === 'vi'
          ? `Demo đa sàn (${orderCount} đơn)`
          : `Demo multi-platform (${orderCount})`,
      tone: 'warning',
    }
  }
  // Live BE: cùng sàn + cùng khách/địa chỉ → Đơn gộp
  if (orderCount > 1) {
    return {
      label: compact
        ? locale === 'vi'
          ? 'Đơn gộp'
          : 'Grouped'
        : locale === 'vi'
          ? `Đơn gộp (${orderCount} đơn · cùng sàn)`
          : `Grouped (${orderCount} · same platform)`,
      tone: 'primary',
    }
  }
  return {
    label: locale === 'vi' ? 'Đơn lẻ' : 'Standalone',
    tone: 'default',
  }
}
