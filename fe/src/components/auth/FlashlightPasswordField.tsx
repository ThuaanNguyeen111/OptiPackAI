import type { ChangeEvent, ReactNode } from 'react'
import { Eye } from 'lucide-react'

type FlashlightPasswordFieldProps = {
  id?: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  error?: string
  /** false = giữ viền lỗi, ẩn chữ dưới ô (dùng khi lỗi đã hiện ở bubble cú) */
  showErrorMessage?: boolean
  /** Gắn aria-describedby khi ẩn chữ lỗi (vd id bubble cú) */
  errorDescribedBy?: string
  revealed: boolean
  onToggle: () => void
  autoComplete?: string
  placeholder?: string
}

function FlashlightIcon(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13.2 7.2h7.2c.6 0 1 .4 1 1v7.6c0 .6-.4 1-1 1h-7.2"
        stroke="#e8c45a"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 7.2 7.6 5.4c-.7-.2-1.4.3-1.4 1v11.2c0 .7.7 1.2 1.4 1l5.6-1.8V7.2Z"
        fill="#f6d56b"
        stroke="#e8c45a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="9.4" cy="12" r="1.2" fill="#fff4c2" />
    </svg>
  )
}

export function FlashlightPasswordField({
  id,
  name,
  value,
  onChange,
  error,
  showErrorMessage = true,
  errorDescribedBy,
  revealed,
  onToggle,
  autoComplete = 'current-password',
  placeholder = '••••••••••••',
}: FlashlightPasswordFieldProps): ReactNode {
  const inputId = id ?? name
  const describedBy = error
    ? showErrorMessage
      ? `${inputId}-error`
      : errorDescribedBy
    : undefined

  return (
    <div>
      <div className={`login-pass${error ? ' is-invalid' : ''}${revealed ? ' is-lit' : ''}`}>
        <div className="login-pass-track" />
        <div className="login-pass-beam" />
        <div className="login-pass-halo" />
        <input
          id={inputId}
          name={name}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="login-pass-input"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="login-pass-toggle"
          onClick={onToggle}
          aria-label={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={revealed}
        >
          {revealed ? <FlashlightIcon /> : <Eye size={18} strokeWidth={1.75} />}
        </button>
      </div>
      {error && showErrorMessage ? (
        <p id={`${inputId}-error`} className="login-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
