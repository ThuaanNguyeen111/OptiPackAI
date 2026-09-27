import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon?: ReactNode
  error?: string
  passwordToggle?: boolean
  compact?: boolean
}

export function AuthInput({
  label,
  icon,
  error,
  passwordToggle,
  compact = false,
  type = 'text',
  className = '',
  id,
  ...props
}: AuthInputProps) {
  const [show, setShow] = useState(false)
  const inputId = id ?? props.name
  const resolvedType = passwordToggle ? (show ? 'text' : 'password') : type

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={`block font-medium text-ink ${compact ? 'mb-1 text-xs' : 'mb-1.5 text-sm'}`}
      >
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          type={resolvedType}
          className={`w-full rounded-md border border-[#27272A] bg-surface-2 text-sm text-ink placeholder:text-ink-tertiary transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40 ${
            compact ? 'h-9' : 'h-11'
          } ${icon ? 'pl-10' : 'pl-3'} ${passwordToggle ? 'pr-10' : 'pr-3'} ${
            error ? 'border-error focus:border-error focus:ring-error/30' : ''
          }`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {passwordToggle ? (
          <button
            type="button"
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {show ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
