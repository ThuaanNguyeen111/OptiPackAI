import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { changePassword } from '../api/auth.api'
import { FlashlightPasswordField } from '../components/auth/FlashlightPasswordField'
import { LoginScene } from '../components/auth/LoginScene'
import { PasswordStrength } from '../components/auth/PasswordStrength'
import { useAuth } from '../context/use-auth'
import { formatApiError } from '../lib/api'
import { validateNewPassword } from '../lib/password'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
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
      sessionStorage.setItem('optipack-password-changed', '1')
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const night = showCurrent || showNext || showConfirm

  return (
    <LoginScene
      night={night}
      closeTo="/login"
      artTitle="Bảo mật tài khoản"
      artDescription="Đổi mật khẩu tạm trước khi sử dụng hệ thống quản lý công việc."
    >
      <h1 className="login-title">Đổi mật khẩu</h1>
      <p className="login-lead">
        Tài khoản mới hoặc vừa được reset phải đổi mật khẩu trước khi dùng hệ
        thống.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        {error ? <div className="login-alert login-alert-err">{error}</div> : null}

        <div className="login-stack">
          <div>
            <label className="login-label" htmlFor="current_password">
              Mật khẩu hiện tại
            </label>
            <FlashlightPasswordField
              id="current_password"
              name="current_password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              revealed={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          </div>
          <div>
            <label className="login-label" htmlFor="new_password">
              Mật khẩu mới
            </label>
            <FlashlightPasswordField
              id="new_password"
              name="new_password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              revealed={showNext}
              onToggle={() => setShowNext((v) => !v)}
            />
            <PasswordStrength password={next} />
          </div>
          <div>
            <label className="login-label" htmlFor="confirm_password">
              Xác nhận mật khẩu mới
            </label>
            <FlashlightPasswordField
              id="confirm_password"
              name="confirm_password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              revealed={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
          </div>
        </div>

        <button type="submit" className="login-cta" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang lưu…
            </>
          ) : (
            'Đổi mật khẩu'
          )}
        </button>
      </form>
    </LoginScene>
  )
}
