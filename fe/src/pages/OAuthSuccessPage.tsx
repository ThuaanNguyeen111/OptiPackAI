import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
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

  const error = params.get('error')
  const errorMessage =
    (error && GOOGLE_OAUTH_ERRORS[error]) ||
    (error ? GOOGLE_OAUTH_ERRORS.server_error : null)

  useEffect(() => {
    if (error) return

    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const roleRaw = params.get('role')
    const mustChange = params.get('must_change_password') === 'true'
    const role = roleRaw !== null ? Number(roleRaw) : NaN

    if (!access_token || !refresh_token || !isUserRole(role)) {
      return
    }

    const result: LoginSuccess = {
      access_token,
      refresh_token,
      role,
      must_change_password: mustChange,
    }
    applyLoginSuccess(result)
    navigate(mustChange ? '/change-password' : homePath(role), { replace: true })
  }, [applyLoginSuccess, error, navigate, params])

  const missingTokens =
    !error &&
    (!params.get('access_token') ||
      !params.get('refresh_token') ||
      !isUserRole(Number(params.get('role'))))

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
