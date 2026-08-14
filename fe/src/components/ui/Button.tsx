import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary-focus/50',
  secondary:
    'bg-surface-1 text-ink border border-hairline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary-focus/50',
  tertiary:
    'bg-canvas text-ink hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-primary-focus/50',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
