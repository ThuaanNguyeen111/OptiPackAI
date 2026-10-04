import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  LoginOwl,
  LoginOwlBubble,
} from '../components/auth/LoginOwl'
import { LoginScene } from '../components/auth/LoginScene'
import { useAuth } from '../context/use-auth'
import { homePath } from '../lib/rbac'
import {
  GOOGLE_OAUTH_ERRORS,
  isUserRole,
  type LoginSuccess,
} from '../types/auth'

export function OAuthSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { applyLoginSuccess } = useAuth()
  const [welcomeBack, setWelcomeBack] = useState<LoginSuccess | null>(null)

  const error = params.get('error')
  const errorMessage =
    (error && GOOGLE_OAUTH_ERRORS[error]) ||
    (error ? GOOGLE_OAUTH_ERRORS.server_error : null)

  useEffect(() => {
    if (error || welcomeBack) return

    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const roleRaw = params.get('role')
    const mustChange = params.get('must_change_password') === 'true'
    const role = roleRaw !== null ? Number(roleRaw) : NaN

    if (!access_token || !refresh_token || !isUserRole(role)) {
      return
    }

    setWelcomeBack({
      access_token,
      refresh_token,
      role,
      must_change_password: mustChange,
    })
  }, [error, params, welcomeBack])

  function enterWorkspace(result: LoginSuccess) {
    applyLoginSuccess(result)
    navigate(
      result.must_change_password ? '/change-password' : homePath(result.role),
      { replace: true },
    )
  }

  const missingTokens =
    !error &&
    !welcomeBack &&
    (!params.get('access_token') ||
      !params.get('refresh_token') ||
      !isUserRole(Number(params.get('role'))))

  if (welcomeBack) {
    return (
      <LoginScene
        closeTo="/login"
        artTitle="Đăng nhập Google"
        artDescription="Hoàn tất phiên đăng nhập để quản lý công việc và phối hợp cùng đội ngũ."
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
      artDescription="Hoàn tất phiên đăng nhập để quản lý công việc và phối hợp cùng đội ngũ."
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
