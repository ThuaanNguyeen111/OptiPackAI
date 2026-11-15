import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShippingSettings, updateShippingSettings } from '../api/shipping.api'
import { PackingSettingsForm } from '../components/packing/PackingSettingsReports'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { useAuth } from '../context/use-auth'
import { usePortal } from '../context/use-portal'
import { formatApiError } from '../lib/api'
import { UserRole } from '../types/auth'

/**
 * Cấu hình đóng gói (ngưỡng lệch cân, túi niêm phong…) + người gửi trên nhãn.
 * Danh mục thùng/vật tư nằm ở `/app/admin/packaging-materials` — không lặp bảng thùng ở đây.
 */
export function PackagingRulesPage() {
  const { locale } = usePortal()
  const { session } = useAuth()
  const vi = locale === 'vi'
  const canEditSender =
    session?.role === UserRole.STORE_OWNER || session?.role === UserRole.ADMIN
  const materialsHref =
    session?.role === UserRole.ADMIN
      ? '/app/admin/packaging-materials'
      : '/app/packaging-materials'
  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [senderAddress, setSenderAddress] = useState('')
  const [senderBusy, setSenderBusy] = useState(false)
  const [senderError, setSenderError] = useState<string | null>(null)
  const [senderSaved, setSenderSaved] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getShippingSettings()
        .then((settings) => {
          setSenderName(settings.sender.name)
          setSenderPhone(settings.sender.phone)
          setSenderAddress(settings.sender.address)
        })
        .catch((err: unknown) => setSenderError(formatApiError(err)))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quy tắc bao bì' : 'Packaging Rules' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Quy tắc bao bì' : 'Packaging rules'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? 'Tham số đóng gói và thông tin người gửi in trên nhãn. Thùng, túi, vật tư nằm ở màn Vật liệu đóng gói.'
                : 'Packing parameters and sender printed on labels. Boxes, bags and materials live on the packaging materials screen.'}
            </p>
            <Link
              to={materialsHref}
              className="mt-2 inline-block text-sm font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
            >
              {vi ? 'Mở Vật liệu đóng gói →' : 'Open packaging materials →'}
            </Link>
          </div>

          <PackingSettingsForm vi={vi} canEdit />

          {canEditSender ? (
            <section className="rounded-xl border border-hairline bg-surface-1 p-4">
              <h2 className="text-sm font-medium text-ink">
                {vi ? 'Người gửi trên nhãn' : 'Sender on label'}
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                {vi
                  ? 'Tên, số điện thoại và địa chỉ shop in trên nhãn vận đơn. Chỉ chủ shop hoặc Admin được lưu.'
                  : 'Shop name, phone and address printed on shipping labels. Only Store Owner or Admin can save.'}
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  maxLength={120}
                  placeholder={vi ? 'Tên người gửi' : 'Sender name'}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <input
                  value={senderPhone}
                  onChange={(event) => setSenderPhone(event.target.value)}
                  placeholder={vi ? 'SĐT người gửi' : 'Sender phone'}
                  className="h-9 w-full rounded-lg border border-hairline bg-surface px-2 text-sm"
                />
                <textarea
                  value={senderAddress}
                  onChange={(event) => setSenderAddress(event.target.value)}
                  placeholder={vi ? 'Địa chỉ người gửi' : 'Sender address'}
                  rows={2}
                  className="w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-sm"
                />
                {senderError ? (
                  <p className="text-xs text-rose-600">{senderError}</p>
                ) : null}
                {senderSaved ? (
                  <p className="text-xs text-emerald-700">
                    {vi ? 'Đã lưu người gửi.' : 'Sender saved.'}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={senderBusy}
                  onClick={() => {
                    setSenderBusy(true)
                    setSenderError(null)
                    setSenderSaved(false)
                    void updateShippingSettings({
                      sender_name: senderName,
                      sender_phone: senderPhone,
                      sender_address: senderAddress,
                    })
                      .then((next) => {
                        setSenderName(next.sender.name)
                        setSenderPhone(next.sender.phone)
                        setSenderAddress(next.sender.address)
                        setSenderSaved(true)
                      })
                      .catch((err: unknown) => setSenderError(formatApiError(err)))
                      .finally(() => setSenderBusy(false))
                  }}
                  className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {vi ? 'Lưu người gửi' : 'Save sender'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </>
  )
}
