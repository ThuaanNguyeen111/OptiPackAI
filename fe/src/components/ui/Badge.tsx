import type { ReactNode } from 'react'

type BadgeTone = 'default' | 'success' | 'warning' | 'primary'

type BadgeProps = {
  children: ReactNode
  tone?: BadgeTone
}

const toneClasses: Record<BadgeTone, string> = {
  default: 'bg-surface-2 text-ink-muted',
  success: 'bg-success/15 text-success',
  warning: 'bg-amber-500/15 text-amber-300',
  primary: 'bg-primary/15 text-primary-hover',
}

export function Badge({ children, tone = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}
