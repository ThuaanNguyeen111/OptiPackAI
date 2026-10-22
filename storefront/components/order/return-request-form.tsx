'use client'

import { useEffect, useState } from 'react'
import { createReturn, getExchangeOptions } from '@/lib/api-client'
import { RETURN_REASON_OPTIONS, RETURN_TYPE_LABELS } from '@/lib/order-labels'
import type { ExchangeOption, StorefrontOrderItem, StorefrontReturn, StorefrontReturnType } from '@/types/storefront'

type Props = {
  orderId: string
  items: StorefrontOrderItem[]
  onCreated: (created: StorefrontReturn) => void
  onCancel: () => void
}

/** Gộp các dòng cùng SKU trong đơn để chọn số lượng trả (mỗi dòng đơn có thể là 1 đơn vị). */
function groupBySku(items: StorefrontOrderItem[]) {
  const map = new Map<string, { sku: string; name: string; variant: string; quantity: number }>()
  for (const item of items) {
    const current = map.get(item.sku_snapshot)
    if (current) current.quantity += item.quantity
    else map.set(item.sku_snapshot, { sku: item.sku_snapshot, name: item.product_name_snapshot, variant: item.variant_snapshot, quantity: item.quantity })
  }
  return [...map.values()]
}

export function ReturnRequestForm({ orderId, items, onCreated, onCancel }: Props) {
  const lines = groupBySku(items)
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [type, setType] = useState<StorefrontReturnType>('return_refund')
  const [reason, setReason] = useState<string>(RETURN_REASON_OPTIONS[0].value)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Đổi hàng: mỗi món trả chọn 1 biến thể đổi sang (cùng sản phẩm).
  const [exchangeOptions, setExchangeOptions] = useState<ExchangeOption[]>([])
  const [exchangeTo, setExchangeTo] = useState<Record<string, string>>({})

  useEffect(() => {
    if (type !== 'exchange' || exchangeOptions.length > 0) return
    getExchangeOptions(orderId).then(setExchangeOptions).catch(() => setExchangeOptions([]))
  }, [type, orderId, exchangeOptions.length])

  const chosen = lines.filter((line) => (selected[line.sku] ?? 0) > 0)
  const optionsFor = (sku: string) => exchangeOptions.find((option) => option.sku === sku)?.options ?? []

  function toggle(sku: string, checked: boolean) {
    setSelected((current) => ({ ...current, [sku]: checked ? 1 : 0 }))
  }

  async function submit() {
    if (!chosen.length) { setError('Vui lòng chọn ít nhất một sản phẩm để trả.'); return }
    if (type === 'exchange' && chosen.some((line) => !exchangeTo[line.sku])) { setError('Vui lòng chọn size / màu muốn đổi sang cho từng sản phẩm.'); return }
    setSubmitting(true)
    setError('')
    try {
      const created = await createReturn(orderId, {
        type,
        items: chosen.map((line) => ({ sku: line.sku, quantity: selected[line.sku] ?? 1, reason_code: reason })),
        exchangeItems: chosen.map((line) => ({ sku: exchangeTo[line.sku] ?? '', quantity: selected[line.sku] ?? 1 })),
        customerNote: note,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu trả hàng')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="return-form" aria-labelledby="return-form-title">
    <span className="eyebrow">Trả hàng</span>
    <h2 id="return-form-title">Yêu cầu trả / đổi hàng</h2>
    <p className="return-form-hint">Chọn sản phẩm muốn trả hoặc đổi. Yêu cầu được gửi tới cửa hàng và chỉ áp dụng trong 15 ngày kể từ khi bạn nhận hàng.</p>

    <div className="return-form-lines">
      {lines.map((line) => <label className="return-form-line" key={line.sku}>
        <input type="checkbox" checked={(selected[line.sku] ?? 0) > 0} onChange={(event) => toggle(line.sku, event.target.checked)} />
        <span className="return-form-line-copy"><strong>{line.name}</strong><small>{line.variant} · {line.sku}</small></span>
        {(selected[line.sku] ?? 0) > 0 && <select aria-label={`Số lượng trả của ${line.name}`} value={selected[line.sku]} onChange={(event) => setSelected((current) => ({ ...current, [line.sku]: Number(event.target.value) }))}>
          {Array.from({ length: line.quantity }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>}
      </label>)}
    </div>

    {type === 'exchange' && chosen.length > 0 && <div className="return-form-lines">
      {chosen.map((line) => <div className="form-field" key={`ex-${line.sku}`}>
        <label htmlFor={`exchange-${line.sku}`}>Đổi {line.name} ({line.variant}) sang</label>
        <select id={`exchange-${line.sku}`} value={exchangeTo[line.sku] ?? ''} onChange={(event) => setExchangeTo((current) => ({ ...current, [line.sku]: event.target.value }))}>
          <option value="">Chọn size / màu</option>
          {optionsFor(line.sku).map((option) => <option disabled={option.available < (selected[line.sku] ?? 1)} key={option.sku} value={option.sku}>
            {option.variantName}{option.available < (selected[line.sku] ?? 1) ? ' — hết hàng' : ''}
          </option>)}
        </select>
      </div>)}
    </div>}

    <div className="form-field">
      <label htmlFor="return-type">Hình thức</label>
      <select id="return-type" value={type} onChange={(event) => setType(event.target.value as StorefrontReturnType)}>
        {Object.entries(RETURN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="form-field">
      <label htmlFor="return-reason">Lý do</label>
      <select id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
        {RETURN_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
    <div className="form-field">
      <label htmlFor="return-note">Ghi chú thêm (không bắt buộc)</label>
      <textarea id="return-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
    </div>

    {error && <p className="error" role="alert">{error}</p>}
    <div className="return-form-actions">
      <button className="button" disabled={submitting} onClick={() => void submit()} type="button">{submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
      <button className="button light" disabled={submitting} onClick={onCancel} type="button">Đóng</button>
    </div>
  </section>
}
