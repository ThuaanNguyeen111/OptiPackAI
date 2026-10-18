import { apiRequest } from '../lib/api'

export type SyncOption = { value: string; label: string }

export type OrderSyncSettings = {
  version: number | null
  isDefault: boolean
  updatedBy: string | null
  updatedAt: string | null
  sync: {
    platforms: { platform: string; autoSyncEnabled: boolean }[]
    intervalMinutes: number
    firstSyncLookbackDays: number
    syncFailedCooldownMinutes: number
  }
  consolidation: {
    enabled: boolean
    keyFields: string[]
    timeWindowHours: number | null
    openGroupStatuses: string[]
  }
  statuses: {
    consolidatable: string[]
    notPackable: string[]
  }
  options: {
    platforms: SyncOption[]
    keyFields: SyncOption[]
    openGroupStatuses: SyncOption[]
    consolidatableStatuses: SyncOption[]
    notPackableStatuses: SyncOption[]
  }
}

export type OrderSyncSettingsSaveResult = OrderSyncSettings & {
  recomputingKeys: boolean
}

export type OrderSyncHistoryItem = {
  version: number
  isActive: boolean
  updatedBy: string | null
  createdAt: string | null
  note: string | null
}

export type SaveOrderSyncSettingsInput = {
  expected_version: number | null
  platforms?: { platform: string; auto_sync_enabled: boolean }[]
  interval_minutes?: number
  first_sync_lookback_days?: number
  sync_failed_cooldown_minutes?: number
  consolidation_enabled?: boolean
  consolidation_key_fields?: string[]
  consolidation_time_window_hours?: number | null
  open_group_statuses?: string[]
  consolidatable_statuses?: string[]
  not_packable_statuses?: string[]
  note?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function options(value: unknown): SyncOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    if (!row || typeof row.value !== 'string') return []
    return [{ value: row.value, label: typeof row.label === 'string' ? row.label : row.value }]
  })
}

function mapSettings(raw: unknown): OrderSyncSettings {
  const row = asRecord(raw)
  if (!row) throw new Error('Cấu hình đồng bộ không đúng định dạng.')
  const sync = asRecord(row.sync) ?? {}
  const consolidation = asRecord(row.consolidation) ?? {}
  const statuses = asRecord(row.statuses) ?? {}
  const optionBlock = asRecord(row.options) ?? {}
  const platforms = Array.isArray(sync.platforms) ? sync.platforms : []
  return {
    version: typeof row.version === 'number' ? row.version : null,
    isDefault: row.isDefault === true,
    updatedBy: text(row.updatedBy),
    updatedAt: text(row.updatedAt),
    sync: {
      platforms: platforms.flatMap((item) => {
        const platform = asRecord(item)
        if (!platform || typeof platform.platform !== 'string') return []
        return [
          {
            platform: platform.platform,
            autoSyncEnabled: platform.autoSyncEnabled !== false,
          },
        ]
      }),
      intervalMinutes: num(sync.intervalMinutes, 10),
      firstSyncLookbackDays: num(sync.firstSyncLookbackDays, 30),
      syncFailedCooldownMinutes: num(sync.syncFailedCooldownMinutes, 20),
    },
    consolidation: {
      enabled: consolidation.enabled !== false,
      keyFields: strings(consolidation.keyFields),
      timeWindowHours:
        typeof consolidation.timeWindowHours === 'number' ? consolidation.timeWindowHours : null,
      openGroupStatuses: strings(consolidation.openGroupStatuses),
    },
    statuses: {
      consolidatable: strings(statuses.consolidatable),
      notPackable: strings(statuses.notPackable),
    },
    options: {
      platforms: options(optionBlock.platforms),
      keyFields: options(optionBlock.keyFields),
      openGroupStatuses: options(optionBlock.openGroupStatuses),
      consolidatableStatuses: options(optionBlock.consolidatableStatuses),
      notPackableStatuses: options(optionBlock.notPackableStatuses),
    },
  }
}

export async function getOrderSyncSettings(): Promise<OrderSyncSettings> {
  return mapSettings(await apiRequest<unknown>('/order-sync-settings', { auth: true }))
}

export async function saveOrderSyncSettings(
  input: SaveOrderSyncSettingsInput,
): Promise<OrderSyncSettingsSaveResult> {
  const raw = await apiRequest<unknown>('/order-sync-settings', {
    method: 'PUT',
    auth: true,
    body: input,
  })
  const saved = mapSettings(raw)
  const row = asRecord(raw)
  return { ...saved, recomputingKeys: row?.recomputingKeys === true }
}

export async function listOrderSyncHistory(limit = 20): Promise<OrderSyncHistoryItem[]> {
  const res = await apiRequest<unknown>(`/order-sync-settings/history?limit=${String(limit)}`, {
    auth: true,
  })
  if (!Array.isArray(res)) return []
  return res.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    return [
      {
        version: num(row.version, 0),
        isActive: row.isActive === true,
        updatedBy: text(row.updatedBy),
        createdAt: text(row.createdAt),
        note: text(row.note),
      },
    ]
  })
}
