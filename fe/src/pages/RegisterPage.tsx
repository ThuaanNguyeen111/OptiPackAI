import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <AuthLayout mode="register">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Tài khoản do Admin cấp
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          OptiPackAI là hệ thống nội bộ. Không tự đăng ký — Admin tạo tài khoản
          và gửi mật khẩu tạm qua email. Đăng nhập Google cũng chỉ hoạt động
          với email đã được cấp sẵn.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-hairline bg-surface-1 p-4">
        <p className="flex items-start gap-2 text-sm text-ink">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover" />
          Sau khi nhận email, đăng nhập rồi đổi mật khẩu trong 72 giờ.
        </p>
      </div>

      <Button
        type="button"
        variant="primary"
        className="mt-6 w-full"
        onClick={() => navigate('/login')}
      >
        Đến trang đăng nhập
      </Button>
    </AuthLayout>
  )
}
