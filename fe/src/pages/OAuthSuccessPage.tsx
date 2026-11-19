import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  LoginOwl,
  LoginOwlBubble,
} from '../components/auth/LoginOwl'
import { LoginScene } from '../components/auth/LoginScene'
import { exchangeGoogleLogin, googleMfaLogin } from '../api/auth.api'
import { useAuth } from '../context/use-auth'
import { formatApiError } from '../lib/api'
import { homePath } from '../lib/rbac'
import {
  GOOGLE_OAUTH_ERRORS,
  isMfaRequired,
  type LoginResponse,
  type LoginSuccess,
} from '../types/auth'

export function OAuthSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { applyLoginSuccess } = useAuth()
  const [welcomeBack, setWelcomeBack] = useState<LoginSuccess | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // AOFP-333 — tài khoản bật MFA: BE trả challenge, nhập mã ở đây.
  const [challenge, setChallenge] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const exchanged = useRef(false)

  const error = params.get('error')
  const loginCode = params.get('login_code')
  const errorMessage =
    failure ??
    ((error && GOOGLE_OAUTH_ERRORS[error]) ||
      (error ? GOOGLE_OAUTH_ERRORS.server_error : null))

  function handleResult(res: LoginResponse) {
    if (!isMfaRequired(res)) {
      setWelcomeBack(res)
    } else if (res.mfa_challenge) {
      setChallenge(res.mfa_challenge)
    } else {
      setFailure(GOOGLE_OAUTH_ERRORS.server_error)
    }
  }

  // AOFP-333 — URL chỉ mang login_code dùng 1 lần; token lấy qua POST, không nằm trên URL.
  useEffect(() => {
    if (error || !loginCode || exchanged.current) return
    exchanged.current = true // StrictMode chạy effect 2 lần; mã chỉ đổi được 1 lần.
    window.history.replaceState(null, '', window.location.pathname)
    exchangeGoogleLogin(loginCode)
      .then(handleResult)
      .catch((err: unknown) => {
        setFailure(formatApiError(err))
      })
  }, [error, loginCode])

  async function submitMfa(e: FormEvent) {
    e.preventDefault()
    const code = mfaCode.trim()
    if (!challenge || !code) {
      setMfaError('Nhập mã xác thực 6 số hoặc mã dự phòng.')
      return
    }
    setVerifying(true)
    setMfaError(null)
    try {
      handleResult(
        await googleMfaLogin(
          /^\d{6}$/.test(code)
            ? { mfa_challenge: challenge, mfa_token: code }
            : { mfa_challenge: challenge, backup_code: code },
        ),
      )
      setChallenge(null)
    } catch (err: unknown) {
      setMfaError(formatApiError(err))
    } finally {
      setVerifying(false)
    }
  }

  function enterWorkspace(result: LoginSuccess) {
    applyLoginSuccess(result)
    navigate(
      result.must_change_password ? '/change-password' : homePath(result.role),
      { replace: true },
    )
  }

  const missingTokens = !error && !failure && !loginCode && !welcomeBack && !challenge

  if (challenge && !welcomeBack) {
    return (
      <LoginScene
        closeTo="/login"
        artTitle="Đăng nhập Google"
        artDescription="Tài khoản bật xác thực 2 lớp — nhập mã để hoàn tất."
      >
        <h1 className="login-title">Xác thực 2 lớp</h1>
        <form className="login-form" onSubmit={(e) => void submitMfa(e)} noValidate>
          <p className="login-lead">Nhập mã 6 số từ app Authenticator, hoặc một mã dự phòng.</p>
          <input
            id="mfa_token"
            name="mfa_token"
            autoComplete="one-time-code"
            placeholder="482913"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className={`login-field${mfaError ? ' is-invalid' : ''}`}
            aria-invalid={Boolean(mfaError)}
            aria-label="Mã xác thực"
          />
          {mfaError ? <p className="login-error">{mfaError}</p> : null}
          <button type="submit" className="login-cta" disabled={verifying}>
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang xác thực…
              </>
            ) : (
              'Xác nhận MFA'
            )}
          </button>
          <button type="button" className="login-back" onClick={() => navigate('/login')}>
            ← Quay lại đăng nhập
          </button>
        </form>
      </LoginScene>
    )
  }

  if (welcomeBack) {
    return (
      <LoginScene
        closeTo="/login"
        artTitle="Đăng nhập Google"
        artDescription="Đang hoàn tất đăng nhập bằng tài khoản Google đã được Admin cấp."
      >
        <div className="login-welcome" role="status" aria-live="polite">
          <div className="login-owl-stage">
            <h1 className="login-title login-title--with-owl">
              Chào mừng trở lại
            </h1>
            <div className="login-owl-cluster">
              <LoginOwlBubble
                message={
                  welcomeBack.must_change_password
                    ? 'Chào mừng trở lại! Bấm bên dưới để đổi mật khẩu nhé.'
                    : 'Chào mừng trở lại! Bấm bên dưới để vào trang làm việc.'
                }
                mood="welcome"
              />
              <div className="login-owl-shelf" aria-hidden>
                <LoginOwl mood="welcome" />
              </div>
            </div>
          </div>
          <p className="login-welcome-sub">Đăng nhập Google thành công</p>
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

  return (
    <LoginScene
      closeTo="/login"
      artTitle="Đăng nhập Google"
      artDescription="Đang hoàn tất đăng nhập bằng tài khoản Google đã được Admin cấp."
    >
      {errorMessage || missingTokens ? (
        <>
          <h1 className="login-title">Không thành công</h1>
          <p className="login-lead">
            {errorMessage ?? 'Thiếu thông tin đăng nhập từ máy chủ.'}
          </p>
          <button
            type="button"
            className="login-cta"
            onClick={() => navigate('/login')}
          >
            Quay lại đăng nhập
          </button>
        </>
      ) : (
        <>
          <h1 className="login-title">Đang hoàn tất…</h1>
          <p className="login-lead">Vui lòng chờ trong giây lát.</p>
          <div className="login-status-icon">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </>
      )}
    </LoginScene>
  )
}
