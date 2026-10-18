import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  getOrderSyncSettings,
  listOrderSyncHistory,
  saveOrderSyncSettings,
  type OrderSyncHistoryItem,
  type OrderSyncSettings,
  type SyncOption,
} from '../api/order-sync-settings.api'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'

const fieldClass =
  'h-9 w-full rounded-md border border-hairline bg-surface-1 px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

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

function Checks({
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
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-1.5 text-xs text-ink">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            disabled={disabled}
            onChange={() => onChange(toggle(selected, option.value))}
          />
          {option.label}
        </label>
      ))}
    </div>
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
  const [history, setHistory] = useState<OrderSyncHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [current, rows] = await Promise.all([
        getOrderSyncSettings(),
        listOrderSyncHistory(),
      ])
      setSettings(current)
      setDraft(draftFrom(current))
      setHistory(rows)
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

  async function save() {
    if (!settings || !draft || !canSave) return
    const interval = Number(draft.intervalMinutes)
    const lookback = Number(draft.firstSyncLookbackDays)
    const cooldown = Number(draft.syncFailedCooldownMinutes)
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
        interval_minutes: interval,
        first_sync_lookback_days: lookback,
        sync_failed_cooldown_minutes: cooldown,
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
      setHistory(await listOrderSyncHistory())
      setNotice(
        saved.recomputingKeys
          ? vi
            ? 'Đã lưu. Hệ thống đang tính lại khóa gộp cho đơn chưa xử lý xong.'
            : 'Saved. Consolidation keys for unfinished orders are being recomputed.'
          : vi
            ? 'Đã lưu cấu hình đồng bộ.'
            : 'Sync settings saved.',
      )
    } catch (err: unknown) {
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
          ...(adminShell
            ? [{ label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' }]
            : []),
          { label: vi ? 'Đồng bộ đơn' : 'Order sync' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {canSave
              ? vi
                ? 'Chỉ Admin lưu được. Trường bỏ trống trên form không gửi — form này gửi đủ giá trị đang hiện.'
                : 'Only Admin can save. This form sends the values shown.'
              : vi
                ? 'Store Owner chỉ xem. Admin mới lưu được.'
                : 'Store Owner can read. Only Admin can save.'}
          </p>
          <Button className="h-9 min-h-0 text-xs" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {vi ? 'Tải lại' : 'Refresh'}
          </Button>
        </div>

        {loading || !draft || !settings ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang tải…' : 'Loading…'}
          </div>
        ) : (
          <div className="space-y-5 rounded-xl border border-hairline bg-surface-1 p-4">
            <p className="text-xs text-ink-muted">
              {vi ? 'Phiên bản' : 'Version'} {settings.version ?? (vi ? 'mặc định' : 'default')}
              {settings.updatedAt ? ` · ${formatDateTime(settings.updatedAt)}` : ''}
            </p>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">
                {vi ? 'Sàn tự đồng bộ' : 'Auto sync'}
              </h2>
              {draft.platforms.map((row) => (
                <label key={row.platform} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={row.autoSyncEnabled}
                    disabled={!canSave}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        platforms: draft.platforms.map((item) =>
                          item.platform === row.platform
                            ? { ...item, autoSyncEnabled: !item.autoSyncEnabled }
                            : item,
                        ),
                      })
                    }
                  />
                  {row.platform}
                </label>
              ))}
              <label className="block text-xs text-ink-muted">
                {vi ? 'Chu kỳ (phút, 5–1440)' : 'Interval (minutes, 5–1440)'}
                <Input
                  className={fieldClass}
                  disabled={!canSave}
                  value={draft.intervalMinutes}
                  onChange={(e) => setDraft({ ...draft, intervalMinutes: e.target.value })}
                />
              </label>
              <label className="block text-xs text-ink-muted">
                {vi ? 'Lần đầu lấy lùi (ngày, 1–90)' : 'First lookback (days, 1–90)'}
                <Input
                  className={fieldClass}
                  disabled={!canSave}
                  value={draft.firstSyncLookbackDays}
                  onChange={(e) => setDraft({ ...draft, firstSyncLookbackDays: e.target.value })}
                />
              </label>
              <label className="block text-xs text-ink-muted">
                {vi ? 'Chờ sau lỗi đồng bộ (phút, 5–1440)' : 'Failure cooldown (minutes, 5–1440)'}
                <Input
                  className={fieldClass}
                  disabled={!canSave}
                  value={draft.syncFailedCooldownMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, syncFailedCooldownMinutes: e.target.value })
                  }
                />
              </label>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">{vi ? 'Gộp đơn' : 'Consolidation'}</h2>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.consolidationEnabled}
                  disabled={!canSave}
                  onChange={() =>
                    setDraft({ ...draft, consolidationEnabled: !draft.consolidationEnabled })
                  }
                />
                {vi ? 'Bật gộp đơn' : 'Consolidation on'}
              </label>
              <p className="text-xs text-ink-muted">
                {vi ? 'Trường khóa gộp' : 'Key fields'}
              </p>
              <Checks
                options={settings.options.keyFields}
                selected={draft.keyFields}
                disabled={!canSave}
                onChange={(keyFields) => setDraft({ ...draft, keyFields })}
              />
              <label className="block text-xs text-ink-muted">
                {vi
                  ? 'Cửa sổ giờ (1–720, để trống = không giới hạn)'
                  : 'Time window hours (1–720, blank = unlimited)'}
                <Input
                  className={fieldClass}
                  disabled={!canSave}
                  value={draft.timeWindowHours}
                  onChange={(e) => setDraft({ ...draft, timeWindowHours: e.target.value })}
                />
              </label>
              <p className="text-xs text-ink-muted">
                {vi ? 'Nhóm còn nhận đơn mới' : 'Groups still open'}
              </p>
              <Checks
                options={settings.options.openGroupStatuses}
                selected={draft.openGroupStatuses}
                disabled={!canSave}
                onChange={(openGroupStatuses) => setDraft({ ...draft, openGroupStatuses })}
              />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">
                {vi ? 'Trạng thái đơn' : 'Order statuses'}
              </h2>
              <p className="text-xs text-ink-muted">{vi ? 'Được gộp' : 'Consolidatable'}</p>
              <Checks
                options={settings.options.consolidatableStatuses}
                selected={draft.consolidatable}
                disabled={!canSave}
                onChange={(consolidatable) => setDraft({ ...draft, consolidatable })}
              />
              <p className="text-xs text-ink-muted">{vi ? 'Không đóng gói' : 'Not packable'}</p>
              <Checks
                options={settings.options.notPackableStatuses}
                selected={draft.notPackable}
                disabled={!canSave}
                onChange={(notPackable) => setDraft({ ...draft, notPackable })}
              />
            </section>

            {canSave ? (
              <label className="block text-xs text-ink-muted">
                {vi ? 'Ghi chú lần lưu (tối đa 300 ký tự)' : 'Note for this save (max 300)'}
                <Input
                  className={fieldClass}
                  maxLength={300}
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </label>
            ) : null}

            {canSave ? (
              <div className="flex justify-end">
                <Button className="h-9 min-h-0 text-xs" disabled={busy} onClick={() => void save()}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Lưu cấu hình' : 'Save settings'}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <section className="rounded-xl border border-hairline bg-surface-1 p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">{vi ? 'Lịch sử' : 'History'}</h2>
          {history.length === 0 ? (
            <p className="text-xs text-ink-muted">{vi ? 'Chưa có lần lưu.' : 'No saves yet.'}</p>
          ) : (
            <ul className="divide-y divide-hairline text-xs">
              {history.map((row) => (
                <li key={row.version} className="py-2">
                  <span className="font-medium text-ink">
                    v{row.version}
                    {row.isActive ? (vi ? ' · đang dùng' : ' · active') : ''}
                  </span>
                  <p className="text-ink-muted">
                    {row.createdAt ? formatDateTime(row.createdAt) : ''}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </div>
    </div>
  )
}
