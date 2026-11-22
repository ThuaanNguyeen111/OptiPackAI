import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { login } from '../../api/auth.api'
import { useAuth } from '../../context/use-auth'
import { formatApiError } from '../../lib/api'
import { getDeviceToken } from '../../lib/auth-storage'
import {
  AUTH_EXPIRED_EVENT,
  AUTH_RENEWED_EVENT,
  expiredSessionEmail,
  finishReLogin,
} from '../../lib/session-expiry'
import { Button } from '../ui/Button'

/**
 * AOFP-334 — phiên hết hạn giữa chừng: đăng nhập lại ngay trên trang (form đang điền giữ nguyên),
 * xong thì các thao tác dở được gửi lại. "Đăng xuất" mới về trang đăng nhập.
 */
export function SessionExpiredDialog(): ReactElement | null {
  const { applyLoginSuccess, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfa, setMfa] = useState('')
  const [needMfa, setNeedMfa] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onExpired = () => {
      setEmail(expiredSessionEmail() ?? '')
      setPassword('')
      setMfa('')
      setNeedMfa(false)
      setError(null)
      setOpen(true)
    }
    const onRenewed = () => setOpen(false)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    window.addEventListener(AUTH_RENEWED_EVENT, onRenewed)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
      window.removeEventListener(AUTH_RENEWED_EVENT, onRenewed)
    }
  }, [])

  if (!open) return null

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await login({
        email: email.trim(),
        password,
        mfa_token: needMfa ? mfa.trim() : undefined,
        device_token: getDeviceToken() ?? undefined,
      })
      if ('mfa_required' in result) {
        setNeedMfa(true)
        return
      }
      applyLoginSuccess(result)
      finishReLogin(true)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    finishReLogin(false)
    await logout()
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && (!needMfa || mfa.trim().length > 0)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        onSubmit={(event) => void submit(event)}
        className="relative z-10 w-full max-w-sm space-y-3 rounded-t-xl border border-hairline bg-surface-1 p-4 sm:rounded-xl"
      >
        <h2 id="session-expired-title" className="text-sm font-semibold text-ink">
          Phiên đăng nhập đã hết hạn
        </h2>
        <p className="text-sm text-ink-muted">
          Đăng nhập lại để tiếp tục. Dữ liệu đang nhập trên trang vẫn giữ nguyên và thao tác dở sẽ được gửi lại.
        </p>
        {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
        <label className="block text-xs text-ink-muted">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs text-ink-muted">
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm text-ink"
          />
        </label>
        {needMfa ? (
          <label className="block text-xs text-ink-muted">
            Mã xác thực 2 lớp
            <input
              value={mfa}
              onChange={(event) => setMfa(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1 block h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-sm text-ink"
            />
          </label>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => void signOut()}>
            Đăng xuất
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={busy || !canSubmit}>
            Đăng nhập lại
          </Button>
        </div>
      </form>
    </div>
  )
}
