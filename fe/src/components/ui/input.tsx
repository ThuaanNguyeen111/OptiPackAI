import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Input({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-lg border border-slate-200/60 bg-slate-50/50 px-3 py-1 text-xs text-slate-800 shadow-none transition-colors',
        'placeholder:text-slate-400',
        'focus-visible:border-indigo-500 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-indigo-500/30 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-200 dark:focus-visible:bg-zinc-900',
        className,
      )}
      {...props}
    />
  )
}
