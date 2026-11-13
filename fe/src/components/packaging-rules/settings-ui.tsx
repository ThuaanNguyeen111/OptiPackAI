import type { ReactNode } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

/** Ô nhập theo token của app (không dùng màu slate/zinc cứng như ui/input). */
export const fieldClass =
  'h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink tabular-nums placeholder:text-ink-subtle transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60'

export const textareaClass =
  'w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-subtle transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60'

/** Một khối cài đặt: tiêu đề + nội dung, các nhóm bên trong ngăn bằng đường kẻ mảnh. */
export function SettingsCard({
  title,
  description,
  aside,
  children,
  footer,
}: {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface-1">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink text-balance">{title}</h2>
          {description ? <p className="mt-1 max-w-[65ch] text-sm text-ink-muted">{description}</p> : null}
        </div>
        {aside}
      </header>
      <div className="divide-y divide-hairline px-5">{children}</div>
      {footer}
    </section>
  )
}

/** Hàng cài đặt: nhãn + giải thích bên trái, ô nhập bên phải (xếp chồng trên điện thoại). */
export function SettingsRow({
  title,
  hint,
  children,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-3 py-5 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  )
}

export function FieldLabel({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  )
}

export function Toggle({
  id,
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label htmlFor={id} className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30',
          checked ? 'border-primary bg-primary' : 'border-hairline-strong bg-surface-3',
          disabled && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  )
}

/** Chọn 1 trong ít lựa chọn — hiện hết, không giấu trong dropdown. */
export function Segmented<T extends string>({
  name,
  value,
  options,
  disabled,
  onChange,
  labelledBy,
}: {
  name: string
  labelledBy?: string
  value: T
  options: readonly { value: T; label: string }[]
  disabled?: boolean
  onChange: (next: T) => void
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="inline-flex flex-wrap gap-1 rounded-lg border border-hairline bg-canvas p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <label
            key={opt.value}
            className={cn(
              'relative rounded-md px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30',
              active ? 'bg-surface-1 font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-muted hover:text-ink',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved'

/** Chân card: trạng thái bên trái, nút lưu bên phải. Nút chỉ bật khi có thay đổi. */
export function SaveBar({
  state,
  error,
  label,
  onSave,
  readOnlyNote,
  vi,
  extra,
}: {
  state: SaveState
  error: string | null
  label: string
  onSave: () => void
  readOnlyNote?: string | null
  vi: boolean
  extra?: ReactNode
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
      <p role="status" aria-live="polite" className="min-h-5 text-xs">
        {readOnlyNote ? (
          <span className="text-ink-subtle">{readOnlyNote}</span>
        ) : error ? (
          <span className="text-rose-600 dark:text-rose-400">{error}</span>
        ) : state === 'dirty' ? (
          <span className="text-amber-700 dark:text-amber-400">{vi ? 'Có thay đổi chưa lưu' : 'Unsaved changes'}</span>
        ) : state === 'saved' ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden />
            {vi ? 'Đã lưu' : 'Saved'}
          </span>
        ) : null}
      </p>
      {readOnlyNote ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <button
            type="button"
            onClick={onSave}
            disabled={state !== 'dirty'}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {label}
          </button>
        </div>
      )}
    </footer>
  )
}
