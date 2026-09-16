import { useState } from 'react'
import { Copy, KeyRound, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { usePortal } from '../../../context/use-portal'

type Props = {
  email: string
  temporaryPassword: string
  reason: 'create' | 'reset'
  onClose: () => void
}

export function TempPasswordDialog({
  email,
  temporaryPassword,
  reason,
  onClose,
}: Props) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(temporaryPassword)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={vi ? 'Đóng' : 'Close'}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-hairline bg-surface-1 sm:rounded-2xl">
        <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <KeyRound className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
            {reason === 'create'
              ? vi
                ? 'Tài khoản đã tạo'
                : 'Account created'
              : vi
                ? 'Đã reset mật khẩu'
                : 'Password reset'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg border border-hairline bg-canvas px-3 py-2">
            <p className="text-[11px] text-ink-subtle">Email</p>
            <p className="font-mono text-sm text-ink">{email}</p>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
            <p className="text-[11px] text-ink-subtle">
              {vi ? 'Mật khẩu tạm' : 'Temporary password'}
            </p>
            <p className="mt-0.5 font-mono text-sm font-medium text-ink">
              {temporaryPassword}
            </p>
          </div>
        </div>
        <div className="flex gap-2 border-t border-hairline p-4">
          <Button variant="ghost" className="flex-1" onClick={() => void copy()}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copied ? (vi ? 'Đã copy' : 'Copied') : vi ? 'Copy' : 'Copy'}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            {vi ? 'Đã lưu mật khẩu' : 'I saved it'}
          </Button>
        </div>
      </div>
    </div>
  )
}
