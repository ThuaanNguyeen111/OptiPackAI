import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { changePassword } from '../api/auth.api'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { PasswordStrength } from '../components/auth/PasswordStrength'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/use-auth'
import { formatApiError } from '../lib/api'
import { validateNewPassword } from '../lib/password'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!current) {
      setError('Vui lòng nhập mật khẩu hiện tại.')
      return
    }
    const policy = validateNewPassword(next)
    if (policy) {
      setError(policy)
      return
    }
    if (confirm !== next) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    setError(undefined)
    setLoading(true)
    try {
      await changePassword(current, next)
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="forgot">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Đổi mật khẩu bắt buộc
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tài khoản mới hoặc vừa được reset phải đổi mật khẩu trước khi dùng hệ
          thống. Sau khi đổi, mọi phiên khác sẽ bị đăng xuất.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        {error ? (
          <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </div>
        ) : null}

        <AuthInput
          label="Mật khẩu hiện tại"
          name="current_password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          passwordToggle
          icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
        />
        <div>
          <AuthInput
            label="Mật khẩu mới"
            name="new_password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            passwordToggle
            icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
          />
          <PasswordStrength password={next} />
        </div>
        <AuthInput
          label="Xác nhận mật khẩu mới"
          name="confirm_password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          passwordToggle
          icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
        />

        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang lưu…
            </>
          ) : (
            'Đổi mật khẩu'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
