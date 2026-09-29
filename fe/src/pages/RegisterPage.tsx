import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { LoginScene } from '../components/auth/LoginScene'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <LoginScene
      closeTo="/login"
      artTitle="Tài khoản nội bộ"
      artDescription="OptiPackAI không tự đăng ký. Admin tạo tài khoản và gửi mật khẩu tạm qua email."
    >
      <h1 className="login-title">Đăng ký</h1>
      <p className="login-lead">
        Hệ thống nội bộ — tài khoản do Admin cấp. Đăng nhập Google cũng chỉ hoạt
        động với email đã được cấp sẵn.
      </p>

      <div className="login-note">
        <Shield size={16} strokeWidth={1.75} />
        <span>
          Sau khi nhận email, đăng nhập rồi đổi mật khẩu trong 72 giờ.
        </span>
      </div>

      <button
        type="button"
        className="login-cta"
        onClick={() => navigate('/login')}
      >
        Đến trang đăng nhập
      </button>
    </LoginScene>
  )
}
