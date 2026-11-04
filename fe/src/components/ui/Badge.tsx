import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { StatusTone } from '../../lib/stage-colors'

type BadgeProps = {
  children: ReactNode
  tone?: StatusTone
  className?: string
}

export function Badge({ children, tone = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        `tone-${tone}`,
        className,
      )}
    >
      {children}
    </span>
  )
}
