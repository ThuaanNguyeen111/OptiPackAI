import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, Lock, Mail, Shield } from 'lucide-react'
import { googleAuthUrl, login } from '../api/auth.api'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/use-auth'
import { formatApiError } from '../lib/api'
import { homePath } from '../lib/rbac'
import {
  getDeviceToken,
  getRememberedEmail,
  setRememberedEmail,
} from '../lib/auth-storage'
import {
  ACCOUNT_LOCKED_DEADLINE,
  isMfaRequired,
  type LoginSuccess,
} from '../types/auth'

type LoginErrors = {
  email?: string
  password?: string
  mfa?: string
  form?: string
}

type MfaMode = 'totp' | 'backup'

export function LoginPage() {
  const navigate = useNavigate()
  const { applyLoginSuccess } = useAuth()
  const [email, setEmail] = useState(getRememberedEmail)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => Boolean(getRememberedEmail()))
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaMode, setMfaMode] = useState<MfaMode>('totp')
  const [mfaToken, setMfaToken] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [locked, setLocked] = useState(false)

  function validateCredentials() {
    const next: LoginErrors = {}
    if (!email.trim()) next.email = 'Vui lòng nhập email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Email không hợp lệ.'
    }
    if (!password) next.password = 'Vui lòng nhập mật khẩu.'
    else if (password.length < 6) next.password = 'Mật khẩu tối thiểu 6 ký tự.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function finishLogin(mustChange: boolean, role: LoginSuccess['role']) {
    if (remember) setRememberedEmail(email.trim())
    else setRememberedEmail(null)
    navigate(mustChange ? '/change-password' : homePath(role), { replace: true })
  }

  async function submitLogin(extra?: {
    mfa_token?: string
    backup_code?: string
  }) {
    setLoading(true)
    setErrors({})
    setLocked(false)
    try {
      const deviceToken = getDeviceToken()
      const res = await login({
        email: email.trim(),
        password,
        device_token: deviceToken ?? undefined,
        ...extra,
      })

      if (isMfaRequired(res)) {
        setMfaStep(true)
        return
      }

      applyLoginSuccess(res)
      finishLogin(res.must_change_password, res.role)
    } catch (err) {
      const message = formatApiError(err)
      if (message.includes('72 giờ')) {
        setLocked(true)
        setErrors({ form: ACCOUNT_LOCKED_DEADLINE })
      } else {
        setErrors({ form: message, mfa: mfaStep ? message : undefined })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mfaStep) {
      if (mfaMode === 'totp') {
        if (!/^\d{6}$/.test(mfaToken.trim())) {
          setErrors({ mfa: 'Nhập mã xác thực 6 số.' })
          return
        }
        await submitLogin({ mfa_token: mfaToken.trim() })
      } else {
        if (!backupCode.trim()) {
          setErrors({ mfa: 'Nhập mã dự phòng.' })
          return
        }
        await submitLogin({ backup_code: backupCode.trim() })
      }
      return
    }

    if (!validateCredentials()) return
    await submitLogin()
  }

  if (locked) {
    return (
      <AuthLayout mode="login">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Tài khoản đã bị khóa
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {ACCOUNT_LOCKED_DEADLINE}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full"
            onClick={() => {
              setLocked(false)
              setErrors({})
            }}
          >
            Quay lại đăng nhập
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout mode="login">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {mfaStep ? 'Xác thực 2 lớp' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {mfaStep
            ? 'Nhập mã từ ứng dụng Authenticator hoặc mã dự phòng.'
            : 'Sign in to manage omnichannel orders and AI packaging.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        {errors.form && !mfaStep ? (
          <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {errors.form}
          </div>
        ) : null}

        {!mfaStep ? (
          <>
            <AuthInput
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@store.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
            />

            <AuthInput
              label="Password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              passwordToggle
              icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
            />

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="inline-flex items-center gap-2 text-ink-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-hairline bg-surface-2 text-primary accent-primary"
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                className="text-primary-hover hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1 rounded-md border border-hairline bg-surface-1 p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMfaMode('totp')
                  setErrors({})
                }}
                className={`flex-1 rounded px-2 py-1.5 ${
                  mfaMode === 'totp'
                    ? 'bg-primary/15 text-primary-hover'
                    : 'text-ink-subtle hover:text-ink'
                }`}
              >
                Mã 6 số
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaMode('backup')
                  setErrors({})
                }}
                className={`flex-1 rounded px-2 py-1.5 ${
                  mfaMode === 'backup'
                    ? 'bg-primary/15 text-primary-hover'
                    : 'text-ink-subtle hover:text-ink'
                }`}
              >
                Mã dự phòng
              </button>
            </div>

            {mfaMode === 'totp' ? (
              <AuthInput
                label="Mã xác thực"
                name="mfa_token"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="482913"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                error={errors.mfa}
                icon={<Shield className="h-4 w-4" strokeWidth={1.75} />}
              />
            ) : (
              <AuthInput
                label="Mã dự phòng"
                name="backup_code"
                placeholder="48213096"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                error={errors.mfa}
                icon={<KeyRound className="h-4 w-4" strokeWidth={1.75} />}
              />
            )}

            <button
              type="button"
              className="text-xs text-ink-subtle hover:text-ink"
              onClick={() => {
                setMfaStep(false)
                setMfaToken('')
                setBackupCode('')
                setErrors({})
              }}
            >
              ← Quay lại đăng nhập
            </button>
          </>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mfaStep ? 'Đang xác thực…' : 'Signing in…'}
            </>
          ) : mfaStep ? (
            'Xác nhận MFA'
          ) : (
            'Sign In to Dashboard'
          )}
        </Button>

        {!mfaStep ? (
          <>
            <div className="relative py-2 text-center text-xs text-ink-tertiary">
              <span className="absolute inset-x-0 top-1/2 border-t border-[#27272A]" />
              <span className="relative bg-canvas px-3">or</span>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                window.location.href = googleAuthUrl()
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.8 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.6 8.6-8.8 0-.6-.1-1-.2-1.5H12z"
                />
              </svg>
              Continue with Google
            </Button>
          </>
        ) : null}
      </form>

      <p className="mt-8 text-center text-sm text-ink-subtle">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-medium text-primary-hover hover:underline">
          Liên hệ Admin
        </Link>
      </p>
    </AuthLayout>
  )
}
