import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  getOrderSyncSettings,
  saveOrderSyncSettings,
  type OrderSyncSettings,
  type SyncOption,
} from '../api/order-sync-settings.api'
import { ConsolidationRulesPanel } from '../components/order-sync/ConsolidationRulesPanel'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError, getApiErrorCode } from '../lib/api'
import { UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'

const fieldClass =
  'h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type Draft = {
  platforms: { platform: string; autoSyncEnabled: boolean }[]
  intervalMinutes: string
  firstSyncLookbackDays: string
  syncFailedCooldownMinutes: string
  consolidationEnabled: boolean
  keyFields: string[]
  timeWindowHours: string
  openGroupStatuses: string[]
  consolidatable: string[]
  notPackable: string[]
  note: string
}

function draftFrom(settings: OrderSyncSettings): Draft {
  return {
    platforms: settings.sync.platforms.map((row) => ({ ...row })),
    intervalMinutes: String(settings.sync.intervalMinutes),
    firstSyncLookbackDays: String(settings.sync.firstSyncLookbackDays),
    syncFailedCooldownMinutes: String(settings.sync.syncFailedCooldownMinutes),
    consolidationEnabled: settings.consolidation.enabled,
    keyFields: [...settings.consolidation.keyFields],
    timeWindowHours:
      settings.consolidation.timeWindowHours === null
        ? ''
        : String(settings.consolidation.timeWindowHours),
    openGroupStatuses: [...settings.consolidation.openGroupStatuses],
    consolidatable: [...settings.statuses.consolidatable],
    notPackable: [...settings.statuses.notPackable],
    note: '',
  }
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function optionLabel(options: SyncOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function inRange(raw: string, min: number, max: number): boolean {
  const value = Number(raw)
  return Number.isInteger(value) && value >= min && value <= max
}

function issuesOf(draft: Draft, vi: boolean): string[] {
  const issues: string[] = []
  if (!inRange(draft.intervalMinutes, 5, 1440)) {
    issues.push(vi ? 'Chu kỳ tự kéo đơn phải từ 5 đến 1440 phút.' : 'Sync interval must be 5–1440 minutes.')
  }
  if (!inRange(draft.firstSyncLookbackDays, 1, 90)) {
    issues.push(vi ? 'Lần kéo đầu chỉ lùi từ 1 đến 90 ngày.' : 'First lookback must be 1–90 days.')
  }
  if (!inRange(draft.syncFailedCooldownMinutes, 5, 1440)) {
    issues.push(vi ? 'Khoảng cách báo lỗi phải từ 5 đến 1440 phút.' : 'Failure cooldown must be 5–1440 minutes.')
  }
  if (draft.consolidationEnabled) {
    const hasIdentity = draft.keyFields.includes('phone') || draft.keyFields.includes('address_line1')
    if (!hasIdentity) {
      issues.push(vi ? 'Chọn số điện thoại hoặc địa chỉ.' : 'Select a phone number or an address.')
    }
    if (draft.openGroupStatuses.length === 0) {
      issues.push(vi ? 'Chọn ít nhất một trạng thái nhóm.' : 'Select at least one group status.')
    }
    if (draft.consolidatable.length === 0) {
      issues.push(vi ? 'Chọn ít nhất một trạng thái được gộp.' : 'Select at least one status.')
    }
  }
  const windowHours = draft.timeWindowHours.trim()
  if (windowHours !== '' && !inRange(windowHours, 1, 720)) {
    issues.push(vi ? 'Cửa sổ giờ: để trống hoặc 1–720.' : 'Time window: blank or 1–720.')
  }
  if (!draft.notPackable.includes('canceled')) {
    issues.push(vi ? 'Giữ trạng thái Đã hủy.' : 'Keep Canceled selected.')
  }
  return issues
}

function ChoiceList({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: SyncOption[]
  selected: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const checked = selected.includes(option.value)
        return (
          <label
            key={option.value}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              checked ? 'border-primary/40 bg-primary/5 text-ink' : 'border-hairline bg-canvas text-ink-muted'
            } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(toggle(selected, option.value))}
            />
            <span>{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function NumberField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-ink">{label}</span>
      <Input
        className={fieldClass}
        disabled={disabled}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function OrderSyncSettingsPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const location = useLocation()
  const vi = locale === 'vi'
  const canSave = session?.role === UserRole.ADMIN
  const adminShell = location.pathname.startsWith('/app/admin')

  const [settings, setSettings] = useState<OrderSyncSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const current = await getOrderSyncSettings()
      setSettings(current)
      setDraft(draftFrom(current))
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const issues = draft ? issuesOf(draft, vi) : []

  async function save() {
    if (!settings || !draft || !canSave || issues.length > 0) return
    const windowHours = draft.timeWindowHours.trim()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await saveOrderSyncSettings({
        expected_version: settings.version,
        platforms: draft.platforms.map((row) => ({
          platform: row.platform,
          auto_sync_enabled: row.autoSyncEnabled,
        })),
        interval_minutes: Number(draft.intervalMinutes),
        first_sync_lookback_days: Number(draft.firstSyncLookbackDays),
        sync_failed_cooldown_minutes: Number(draft.syncFailedCooldownMinutes),
        consolidation_enabled: draft.consolidationEnabled,
        consolidation_key_fields: draft.keyFields,
        consolidation_time_window_hours: windowHours === '' ? null : Number(windowHours),
        open_group_statuses: draft.openGroupStatuses,
        consolidatable_statuses: draft.consolidatable,
        not_packable_statuses: draft.notPackable,
        note: draft.note.trim() || undefined,
      })
      setSettings(saved)
      setDraft(draftFrom(saved))
      setNotice(saved.recomputingKeys ? (vi ? 'Đã lưu. Đang tính lại khóa gộp.' : 'Saved. Recomputing merge keys.') : vi ? 'Đã lưu.' : 'Saved.')
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'ORD_SYNC_SETTINGS_CONFLICT') {
        try {
          const current = await getOrderSyncSettings()
          setSettings(current)
          setDraft(draftFrom(current))
        } catch {
          // Giữ lỗi gốc nếu tải lại cũng thất bại.
        }
      }
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PortalTopBar
        variant={adminShell ? 'admin' : 'ops'}
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          ...(adminShell ? [{ label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' }] : []),
          { label: vi ? 'Luật gộp đơn' : 'Sync rules' },
        ]}
      />
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{vi ? 'Luật gộp đơn' : 'Sync rules'}</h1>
              {settings ? (
                <Badge tone={settings.isDefault ? 'default' : 'primary'}>
                  {settings.isDefault
                    ? vi
                      ? 'Mặc định'
                      : 'Default'
                    : vi
                      ? `Lần ${String(settings.version)}`
                      : `v${String(settings.version)}`}
                </Badge>
              ) : null}
              {settings?.updatedAt ? (
                <span className="text-xs text-ink-tertiary">{formatDateTime(settings.updatedAt)}</span>
              ) : null}
              {!canSave && !loading ? <Badge>{vi ? 'Chỉ xem' : 'Read only'}</Badge> : null}
            </div>
            <Button className="h-9 min-h-0 text-xs" variant="secondary" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {vi ? 'Tải lại' : 'Refresh'}
            </Button>
          </div>

          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {loading || !draft || !settings ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {vi ? 'Đang tải…' : 'Loading…'}
            </div>
          ) : (
            <>
              <section className="space-y-3 rounded-xl border border-hairline bg-surface-1 p-4">
                <h2 className="text-sm font-semibold text-ink">{vi ? 'Đồng bộ' : 'Sync'}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.platforms.map((row) => (
                    <label
                      key={row.platform}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        row.autoSyncEnabled ? 'border-primary/40 bg-primary/5 text-ink' : 'border-hairline bg-canvas text-ink-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={row.autoSyncEnabled}
                        disabled={!canSave}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            platforms: draft.platforms.map((item) =>
                              item.platform === row.platform ? { ...item, autoSyncEnabled: !item.autoSyncEnabled } : item,
                            ),
                          })
                        }
                      />
                      {optionLabel(settings.options.platforms, row.platform)}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberField
                    label={vi ? 'Chu kỳ (phút)' : 'Interval (min)'}
                    value={draft.intervalMinutes}
                    disabled={!canSave}
                    onChange={(intervalMinutes) => setDraft({ ...draft, intervalMinutes })}
                  />
                  <NumberField
                    label={vi ? 'Lần đầu (ngày)' : 'First lookback (days)'}
                    value={draft.firstSyncLookbackDays}
                    disabled={!canSave}
                    onChange={(firstSyncLookbackDays) => setDraft({ ...draft, firstSyncLookbackDays })}
                  />
                  <NumberField
                    label={vi ? 'Báo lỗi (phút)' : 'Error gap (min)'}
                    value={draft.syncFailedCooldownMinutes}
                    disabled={!canSave}
                    onChange={(syncFailedCooldownMinutes) => setDraft({ ...draft, syncFailedCooldownMinutes })}
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-hairline bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">{vi ? 'Gộp đơn' : 'Merge'}</h2>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={draft.consolidationEnabled}
                      disabled={!canSave}
                      onChange={() => setDraft({ ...draft, consolidationEnabled: !draft.consolidationEnabled })}
                    />
                    {vi ? 'Bật' : 'On'}
                  </label>
                </div>
                {draft.consolidationEnabled ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-sm text-ink">{vi ? 'Trường khớp' : 'Match fields'}</p>
                      <ChoiceList
                        options={settings.options.keyFields}
                        selected={draft.keyFields}
                        disabled={!canSave}
                        onChange={(keyFields) => setDraft({ ...draft, keyFields })}
                      />
                    </div>
                    <NumberField
                      label={vi ? 'Cửa sổ (giờ)' : 'Window (hours)'}
                      placeholder={vi ? 'Không giới hạn' : 'No limit'}
                      value={draft.timeWindowHours}
                      disabled={!canSave}
                      onChange={(timeWindowHours) => setDraft({ ...draft, timeWindowHours })}
                    />
                    <div className="space-y-1">
                      <p className="text-sm text-ink">{vi ? 'Nhóm còn mở' : 'Open groups'}</p>
                      <ChoiceList
                        options={settings.options.openGroupStatuses}
                        selected={draft.openGroupStatuses}
                        disabled={!canSave}
                        onChange={(openGroupStatuses) => setDraft({ ...draft, openGroupStatuses })}
                      />
                    </div>
                  </>
                ) : null}
              </section>

              <section className="space-y-3 rounded-xl border border-hairline bg-surface-1 p-4">
                <h2 className="text-sm font-semibold text-ink">{vi ? 'Trạng thái' : 'Statuses'}</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-ink">{vi ? 'Được gộp' : 'Mergeable'}</p>
                    <ChoiceList
                      options={settings.options.consolidatableStatuses}
                      selected={draft.consolidatable}
                      disabled={!canSave || !draft.consolidationEnabled}
                      onChange={(consolidatable) => setDraft({ ...draft, consolidatable })}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-ink">{vi ? 'Không đóng gói' : 'Not packable'}</p>
                    <ChoiceList
                      options={settings.options.notPackableStatuses}
                      selected={draft.notPackable}
                      disabled={!canSave}
                      onChange={(notPackable) => setDraft({ ...draft, notPackable })}
                    />
                  </div>
                </div>
              </section>

              <ConsolidationRulesPanel
                vi={vi}
                canEdit={canSave}
                settingsVersion={settings.version}
                onVersionChange={(version) =>
                  setSettings((current) => (current ? { ...current, version } : current))
                }
              />

              {canSave ? (
                <section className="space-y-3 rounded-xl border border-hairline bg-surface-1 p-4">
                  <label className="block space-y-1">
                    <span className="text-sm text-ink">{vi ? 'Ghi chú' : 'Note'}</span>
                    <Input
                      className={fieldClass}
                      maxLength={300}
                      value={draft.note}
                      onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    />
                  </label>
                  {issues.length > 0 ? (
                    <ul className="space-y-1 text-xs text-red-600">
                      {issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex justify-end">
                    <Button className="h-9 min-h-0 text-xs" disabled={busy || issues.length > 0} onClick={() => void save()}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {vi ? 'Lưu' : 'Save'}
                    </Button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
