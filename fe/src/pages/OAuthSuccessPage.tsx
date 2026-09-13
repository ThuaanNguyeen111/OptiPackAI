import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
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
    <AuthLayout mode="login">
      {errorMessage || missingTokens ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Đăng nhập Google không thành công
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {errorMessage ?? 'Thiếu thông tin đăng nhập từ máy chủ.'}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full"
            onClick={() => navigate('/login')}
          >
            Quay lại đăng nhập
          </Button>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Đang hoàn tất đăng nhập…
          </h1>
          <p className="mt-2 text-sm text-ink-muted">Vui lòng chờ trong giây lát.</p>
        </div>
      )}
    </AuthLayout>
  )
}
