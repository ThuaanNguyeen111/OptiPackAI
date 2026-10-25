import {
  BOX_SOURCE_REASONS,
  BOX_SOURCE_REASON_LABELS,
  boxSourceNeedsReason,
  type BoxSourceChoice,
  type BoxSourceInput,
  type BoxSourceReason,
  type PackingBoxSourceParcel,
} from '@/types/packing-plan'

type Props = {
  vi: boolean
  info: PackingBoxSourceParcel | undefined
  value: BoxSourceInput
  onChange: (next: BoxSourceInput) => void
}

const FORCED_NEW_LABELS: Record<string, { vi: string; en: string }> = {
  FRAGILE: { vi: 'hàng dễ vỡ chỉ dùng thùng mới', en: 'fragile items need a new box' },
  NOT_REUSABLE: { vi: 'loại thùng này không tái sử dụng', en: 'this box type is not reusable' },
  NO_REUSED_STOCK: { vi: 'hết thùng tái sử dụng', en: 'no reused boxes in stock' },
}

function sourceLabel(source: 'new' | 'reused' | null | undefined, vi: boolean): string {
  if (source === 'new') return vi ? 'thùng mới' : 'new box'
  if (source === 'reused') return vi ? 'thùng tái sử dụng' : 'reused box'
  return '—'
}

/** Kiểm tra lựa chọn nguồn thùng trước khi gửi; trả câu báo lỗi hoặc null. */
export function boxSourceError(
  value: BoxSourceInput,
  info: PackingBoxSourceParcel | undefined,
  vi: boolean,
): string | null {
  if (!boxSourceNeedsReason(value.source, info?.planned)) return null
  if (!value.reason) return vi ? 'Chọn lý do vì sao dùng thùng khác gợi ý.' : 'Pick a reason for choosing a different box source.'
  if (value.reason === 'OTHER' && !value.note?.trim()) {
    return vi ? 'Lý do "Khác" cần ghi chú.' : 'Reason "Other" needs a note.'
  }
  return null
}

export function BoxSourceFields({ vi, info, value, onChange }: Props) {
  const needsReason = boxSourceNeedsReason(value.source, info?.planned)
  const reusedBlocked = info != null && !info.reusedAllowed

  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-600">{vi ? 'Nguồn thùng' : 'Box source'}</span>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1"
          value={value.source}
          onChange={(e) => onChange({ source: e.target.value as BoxSourceChoice })}
        >
          <option value="auto">
            {vi ? 'Theo gợi ý' : 'Suggested'} ({sourceLabel(info?.planned, vi)})
          </option>
          <option value="new">{vi ? 'Thùng mới' : 'New box'}</option>
          <option value="reused" disabled={reusedBlocked}>
            {vi ? 'Thùng tái sử dụng' : 'Reused box'}
          </option>
        </select>
        {info?.forcedNewReason ? (
          <span className="text-slate-500">
            ({FORCED_NEW_LABELS[info.forcedNewReason]?.[vi ? 'vi' : 'en'] ?? info.forcedNewReason})
          </span>
        ) : null}
        {info?.outOfStock ? (
          <span className="font-semibold text-rose-600">{vi ? 'Thùng gợi ý đã hết' : 'Suggested box out of stock'}</span>
        ) : null}
      </div>
      {needsReason ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 px-2 py-1"
            value={value.reason ?? ''}
            onChange={(e) =>
              onChange({ ...value, reason: (e.target.value || undefined) as BoxSourceReason | undefined })
            }
          >
            <option value="">{vi ? '— Lý do —' : '— Reason —'}</option>
            {BOX_SOURCE_REASONS.map((r) => (
              <option key={r} value={r}>
                {BOX_SOURCE_REASON_LABELS[r][vi ? 'vi' : 'en']}
              </option>
            ))}
          </select>
          {value.reason === 'OTHER' ? (
            <input
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-2 py-1"
              maxLength={300}
              placeholder={vi ? 'Ghi chú (bắt buộc)' : 'Note (required)'}
              value={value.note ?? ''}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
