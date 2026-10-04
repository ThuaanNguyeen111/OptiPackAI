import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { googleAuthUrl, login } from '../api/auth.api'
import { FlashlightPasswordField } from '../components/auth/FlashlightPasswordField'
import {
  LoginOwl,
  LoginOwlBubble,
  type LoginOwlMood,
} from '../components/auth/LoginOwl'
import { LoginScene } from '../components/auth/LoginScene'
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
  const [params] = useSearchParams()
  const [passwordChanged] = useState(() => {
    if (params.get('password_changed') === '1') return true
    const flag = sessionStorage.getItem('optipack-password-changed')
    if (flag === '1') {
      sessionStorage.removeItem('optipack-password-changed')
      return true
    }
    return false
  })
  const { applyLoginSuccess } = useAuth()
  const [email, setEmail] = useState(getRememberedEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(() => Boolean(getRememberedEmail()))
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaMode, setMfaMode] = useState<MfaMode>('totp')
  const [mfaToken, setMfaToken] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [locked, setLocked] = useState(false)
  const [owlMood, setOwlMood] = useState<LoginOwlMood>('greet')
  const [owlMessage, setOwlMessage] = useState(
    'Xin chào! Mình là cú OptiPack — nhập email để bắt đầu nhé.',
  )
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [greetDone, setGreetDone] = useState(false)
  const [welcomeBack, setWelcomeBack] = useState<LoginSuccess | null>(null)

  useEffect(() => {
    if (mfaStep || locked || welcomeBack) return
    setGreetDone(false)
    setOwlMood('greet')
    setOwlMessage('Xin chào! Mình là cú OptiPack — nhập email để bắt đầu nhé.')
    const timer = window.setTimeout(() => setGreetDone(true), 3200)
    return () => window.clearTimeout(timer)
  }, [mfaStep, locked, welcomeBack])

  useEffect(() => {
    if (!welcomeBack) return
    setOwlMood('welcome')
    setOwlMessage(
      welcomeBack.must_change_password
        ? 'Chào mừng trở lại! Bấm bên dưới để đổi mật khẩu nhé.'
        : 'Chào mừng trở lại! Bấm bên dưới để vào trang làm việc.',
    )
  }, [welcomeBack])

  useEffect(() => {
    if (mfaStep || locked || welcomeBack) return
    // Lỗi validate luôn hiện ngay, kể cả lúc đang chào
    if (errors.form) {
      setOwlMood('error')
      setOwlMessage(errors.form)
      return
    }
    if (errors.email) {
      setOwlMood('error')
      setOwlMessage(errors.email)
      return
    }
    if (errors.password) {
      setOwlMood('error')
      setOwlMessage(errors.password)
      return
    }
    if (!greetDone) return
    if (passwordFocused) {
      setOwlMood('shy')
      setOwlMessage('Mình che mắt để bạn gõ mật khẩu nhé.')
      return
    }
    if (emailFocused) {
      setOwlMood('watch')
      setOwlMessage('Email công việc của bạn…')
      return
    }
    const trimmed = email.trim()
    if (
      trimmed &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) &&
      password.length >= 6
    ) {
      setOwlMood('ok')
      setOwlMessage('Ổn rồi — bấm Đăng nhập khi sẵn sàng!')
      return
    }
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setOwlMood('ok')
      setOwlMessage('Email hợp lệ rồi. Tiếp tục với mật khẩu\u00A0nhé.')
      return
    }
    setOwlMood('idle')
    setOwlMessage('Nhập email và mật khẩu để vào hệ thống.')
  }, [
    errors.form,
    errors.email,
    errors.password,
    emailFocused,
    passwordFocused,
    email,
    password,
    mfaStep,
    locked,
    greetDone,
    welcomeBack,
  ])

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

  function enterWorkspace(result: LoginSuccess) {
    applyLoginSuccess(result)
    navigate(
      result.must_change_password ? '/change-password' : homePath(result.role),
      { replace: true },
    )
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
        device_token:
          deviceToken && !deviceToken.startsWith('mock-')
            ? deviceToken
            : undefined,
        ...extra,
      })

      if (isMfaRequired(res)) {
        setMfaStep(true)
        return
      }

      if (remember) setRememberedEmail(email.trim())
      else setRememberedEmail(null)
      // Chưa gắn session — tránh GuestRoute đá khỏi /login trước khi user bấm nút
      setWelcomeBack(res)
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

  const night = showPassword && !mfaStep && !locked && !welcomeBack

  if (welcomeBack) {
    return (
      <LoginScene night={false}>
        <div className="login-welcome" role="status" aria-live="polite">
          <div className="login-owl-stage">
            <h1 className="login-title login-title--with-owl">
              Chào mừng trở lại
            </h1>
            <div className="login-owl-cluster">
              <LoginOwlBubble message={owlMessage} mood="welcome" />
              <div className="login-owl-shelf" aria-hidden>
                <LoginOwl mood="welcome" />
              </div>
            </div>
          </div>
          <p className="login-welcome-sub">Đăng nhập thành công</p>
          <button
            type="button"
            className="login-cta"
            onClick={() => enterWorkspace(welcomeBack)}
          >
            {welcomeBack.must_change_password ? (
              'Đổi mật khẩu'
            ) : (
              <>
                Vào trang làm việc
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </div>
      </LoginScene>
    )
  }

  if (locked) {
    return (
      <LoginScene night={false}>
        <h1 className="login-title">Tài khoản đã bị khóa</h1>
        <p className="login-foot" style={{ marginTop: 0, textAlign: 'left' }}>
          {ACCOUNT_LOCKED_DEADLINE}
        </p>
        <button
          type="button"
          className="login-cta"
          onClick={() => {
            setLocked(false)
            setErrors({})
          }}
        >
          Quay lại đăng nhập
        </button>
      </LoginScene>
    )
  }

  return (
    <LoginScene night={night}>
      {mfaStep ? <h1 className="login-title">Xác thực 2 lớp</h1> : null}

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {passwordChanged && !mfaStep ? (
          <div className="login-alert login-alert-ok">
            Đổi mật khẩu thành công. Đăng nhập lại bằng mật khẩu mới.
          </div>
        ) : null}

        {!mfaStep ? (
          <>
            <div className="login-owl-stage">
              <h1 className="login-title login-title--with-owl">Đăng nhập</h1>
              {/* Bubble + cú sát nhau — title không chen giữa */}
              <div className="login-owl-cluster">
                <LoginOwlBubble message={owlMessage} mood={owlMood} />
                <div className="login-owl-shelf" aria-hidden>
                  <LoginOwl mood={owlMood} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="info@drakele.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  className={`login-field${errors.email ? ' is-invalid' : ''}`}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby="login-owl-status"
                />
              </div>
            </div>

            <div
              className="login-stack"
              onFocusCapture={() => setPasswordFocused(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setPasswordFocused(false)
                }
              }}
            >
              <FlashlightPasswordField
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                showErrorMessage={false}
                errorDescribedBy="login-owl-status"
                revealed={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </div>

            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Ghi nhớ
              </label>
              <Link to="/forgot-password" className="login-forgot">
                Quên mật khẩu?
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="login-mfa-tabs">
              <button
                type="button"
                onClick={() => {
                  setMfaMode('totp')
                  setErrors({})
                }}
                className={`login-mfa-tab${mfaMode === 'totp' ? ' is-on' : ''}`}
              >
                Mã 6 số
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaMode('backup')
                  setErrors({})
                }}
                className={`login-mfa-tab${mfaMode === 'backup' ? ' is-on' : ''}`}
              >
                Mã dự phòng
              </button>
            </div>

            {mfaMode === 'totp' ? (
              <input
                id="mfa_token"
                name="mfa_token"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="482913"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className={`login-field${errors.mfa ? ' is-invalid' : ''}`}
                aria-invalid={Boolean(errors.mfa)}
              />
            ) : (
              <input
                id="backup_code"
                name="backup_code"
                placeholder="48213096"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                className={`login-field${errors.mfa ? ' is-invalid' : ''}`}
                aria-invalid={Boolean(errors.mfa)}
              />
            )}
            {errors.mfa ? <p className="login-error">{errors.mfa}</p> : null}

            <button
              type="button"
              className="login-back"
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

        <button type="submit" className="login-cta" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mfaStep ? 'Đang xác thực…' : 'Đang đăng nhập…'}
            </>
          ) : mfaStep ? (
            'Xác nhận MFA'
          ) : (
            <>
              Đăng nhập
              <ArrowRight size={16} strokeWidth={2} />
            </>
          )}
        </button>

        {!mfaStep ? (
          <>
            <div className="login-divider">
              <span>hoặc</span>
            </div>

            <button
              type="button"
              className="login-google"
              onClick={() => {
                window.location.href = googleAuthUrl()
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.8 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.6 8.6-8.8 0-.6-.1-1-.2-1.5H12z"
                />
              </svg>
              Tiếp tục với Google
            </button>
          </>
        ) : null}
      </form>

      {!mfaStep ? (
        <p className="login-foot">
          Bạn chưa có tài khoản?
          <Link to="/register">Đăng ký</Link>
        </p>
      ) : null}
    </LoginScene>
  )
}
