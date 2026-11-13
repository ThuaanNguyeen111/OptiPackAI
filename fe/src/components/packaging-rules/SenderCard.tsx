import { useEffect, useMemo, useState } from 'react'
import { getShippingSettings, updateShippingSettings } from '../../api/shipping.api'
import { formatApiError } from '../../lib/api'
import { FieldLabel, fieldClass, type SaveState, SaveBar, SettingsCard, textareaClass } from './settings-ui'

type Sender = { name: string; phone: string; address: string }

export function SenderCard({ vi }: { vi: boolean }) {
  const [saved, setSaved] = useState<Sender | null>(null)
  const [draft, setDraft] = useState<Sender>({ name: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getShippingSettings()
      .then((s) => {
        if (!alive) return
        setSaved(s.sender)
        setDraft(s.sender)
      })
      .catch((err: unknown) => alive && setError(formatApiError(err)))
    return () => {
      alive = false
    }
  }, [])

  const dirty = useMemo(() => saved !== null && JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  const state: SaveState = saving ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'idle'

  function patch(next: Partial<Sender>) {
    setJustSaved(false)
    setDraft((d) => ({ ...d, ...next }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = await updateShippingSettings({
        sender_name: draft.name,
        sender_phone: draft.phone,
        sender_address: draft.address,
      })
      setSaved(next.sender)
      setDraft(next.sender)
      setJustSaved(true)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      title={vi ? 'Người gửi trên nhãn' : 'Sender on labels'}
      description={vi ? 'In trên mọi nhãn vận đơn.' : 'Printed on every shipping label.'}
      footer={
        <SaveBar
          vi={vi}
          state={state}
          error={error}
          label={vi ? 'Lưu người gửi' : 'Save sender'}
          onSave={() => void save()}
        />
      }
    >
      <div className="grid gap-3 py-5 sm:grid-cols-2">
        <FieldLabel label={vi ? 'Tên shop' : 'Shop name'} htmlFor="sender-name">
          <input
            id="sender-name"
            placeholder="AURELLE Store"
            autoComplete="organization"
            maxLength={120}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={fieldClass}
          />
        </FieldLabel>
        <FieldLabel label={vi ? 'Số điện thoại' : 'Phone'} htmlFor="sender-phone">
          <input
            id="sender-phone"
            placeholder="0901 234 567"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            className={fieldClass}
          />
        </FieldLabel>
        <div className="sm:col-span-2">
          <FieldLabel label={vi ? 'Địa chỉ lấy hàng' : 'Pickup address'} htmlFor="sender-address">
            <textarea
              id="sender-address"
              placeholder={vi ? '12 Nguyễn Huệ, P. Bến Nghé, Q.1, TP. Hồ Chí Minh' : '12 Nguyen Hue, Ben Nghe, District 1, HCMC'}
              rows={2}
              autoComplete="street-address"
              value={draft.address}
              onChange={(e) => patch({ address: e.target.value })}
              className={textareaClass}
            />
          </FieldLabel>
        </div>
      </div>
    </SettingsCard>
  )
}
