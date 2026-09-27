import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { resetPassword } from '../api/auth.api'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { PasswordStrength } from '../components/auth/PasswordStrength'
import { Button } from '../components/ui/Button'
import { formatApiError } from '../lib/api'
import { validateNewPassword } from '../lib/password'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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

  return (
    <AuthLayout mode="forgot">
      {done ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Đặt lại mật khẩu thành công
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {message || 'Vui lòng đăng nhập lại bằng mật khẩu mới.'}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full"
            onClick={() => navigate('/login')}
          >
            Đăng nhập
          </Button>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Đặt lại mật khẩu
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Mật khẩu mới cần chữ hoa, chữ thường, số và ký tự đặc biệt.
            </p>
          </div>

          {!token ? (
            <p className="mt-6 text-sm text-error">
              Thiếu token trên URL. Mở đúng liên kết trong email.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
              {error ? (
                <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                  {error}
                </div>
              ) : null}
              <div>
                <AuthInput
                  label="Mật khẩu mới"
                  name="new_password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  passwordToggle
                  icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
                />
                <PasswordStrength password={password} />
              </div>
              <AuthInput
                label="Xác nhận mật khẩu"
                name="confirm_password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                passwordToggle
                icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang lưu…
                  </>
                ) : (
                  'Cập nhật mật khẩu'
                )}
              </Button>
            </form>
          )}

          <p className="mt-8 text-center text-sm">
            <Link to="/login" className="font-medium text-primary-hover hover:underline">
              Quay lại đăng nhập
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
