import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { resetPassword } from '../api/auth.api'
import { FlashlightPasswordField } from '../components/auth/FlashlightPasswordField'
import { LoginScene } from '../components/auth/LoginScene'
import { PasswordStrength } from '../components/auth/PasswordStrength'
import { formatApiError } from '../lib/api'
import { validateNewPassword } from '../lib/password'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.')
      return
    }
    const policy = validateNewPassword(password)
    if (policy) {
      setError(policy)
      return
    }
    if (confirm !== password) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    setError(undefined)
    setLoading(true)
    try {
      const res = await resetPassword(token, password)
      setMessage(res.message)
      setDone(true)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const night = !done && (showPassword || showConfirm)

  return (
    <LoginScene
      night={night}
      closeTo="/login"
      artTitle="Mật khẩu mới"
      artDescription="Tạo mật khẩu mạnh để tiếp tục quản lý công việc cùng đội ngũ."
    >
      {done ? (
        <>
          <h1 className="login-title">Đặt lại thành công</h1>
          <p className="login-lead">
            {message || 'Vui lòng đăng nhập lại bằng mật khẩu mới.'}
          </p>
          <button
            type="button"
            className="login-cta"
            onClick={() => navigate('/login')}
          >
            Đăng nhập
          </button>
        </>
      ) : (
        <>
          <h1 className="login-title">Đặt lại mật khẩu</h1>
          <p className="login-lead">
            Mật khẩu mới cần chữ hoa, chữ thường, số và ký tự đặc biệt.
          </p>

          {!token ? (
            <p className="login-error">
              Thiếu token trên URL. Mở đúng liên kết trong email.
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error ? (
                <div className="login-alert login-alert-err">{error}</div>
              ) : null}

              <div className="login-stack">
                <div>
                  <label className="login-label" htmlFor="new_password">
                    Mật khẩu mới
                  </label>
                  <FlashlightPasswordField
                    id="new_password"
                    name="new_password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    revealed={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                  <PasswordStrength password={password} />
                </div>
                <div>
                  <label className="login-label" htmlFor="confirm_password">
                    Xác nhận mật khẩu
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
                  'Cập nhật mật khẩu'
                )}
              </button>
            </form>
          )}

          <p className="login-foot">
            <Link to="/login">← Quay lại đăng nhập</Link>
          </p>
        </>
      )}
    </LoginScene>
  )
}
