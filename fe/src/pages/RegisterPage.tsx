import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Loader2,
  Lock,
  Mail,
  Shield,
  Store,
  User,
} from 'lucide-react'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { PasswordStrength } from '../components/auth/PasswordStrength'
import { Button } from '../components/ui/Button'

const roles = [
  'Store Owner',
  'Warehouse Staff',
  'Shipping Coordinator',
  'Packaging Specialist',
] as const

type Role = (typeof roles)[number]

type RegisterErrors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
  storeName?: string
  role?: string
  terms?: string
  form?: string
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [role, setRole] = useState<Role>('Store Owner')
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<RegisterErrors>({})

  function validate() {
    const next: RegisterErrors = {}
    if (!fullName.trim()) next.fullName = 'Vui lòng nhập họ tên.'
    if (!email.trim()) next.email = 'Vui lòng nhập work email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Email không hợp lệ.'
    }
    if (!password) next.password = 'Vui lòng tạo mật khẩu.'
    else if (password.length < 8) next.password = 'Mật khẩu tối thiểu 8 ký tự.'
    if (!confirmPassword) next.confirmPassword = 'Vui lòng nhập lại mật khẩu.'
    else if (confirmPassword !== password) {
      next.confirmPassword = 'Mật khẩu xác nhận không khớp.'
    }
    if (!storeName.trim()) next.storeName = 'Vui lòng nhập tên cửa hàng.'
    if (!roles.includes(role)) next.role = 'Chọn vai trò hợp lệ.'
    if (!terms) next.terms = 'Bạn cần đồng ý Terms & Privacy.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrors({})
    await new Promise((r) => setTimeout(r, 1100))
    setLoading(false)
    navigate('/app')
  }

  return (
    <AuthLayout mode="register">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Create your account
        </h1>
        <p className="mt-1 text-xs text-ink-muted">
          Set up OptiPackAI for your store and warehouse team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2.5" noValidate>
        {errors.form ? (
          <div className="rounded-md border border-error/30 bg-error/10 px-3 py-1.5 text-xs text-error">
            {errors.form}
          </div>
        ) : null}

        <AuthInput
          compact
          label="Full Name"
          name="fullName"
          autoComplete="name"
          placeholder="Nguyễn Minh Anh"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          icon={<User className="h-4 w-4" strokeWidth={1.75} />}
        />

        <AuthInput
          compact
          label="Work Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="owner@anhminh.store"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
        />

        <div>
          <AuthInput
            compact
            label="Password"
            name="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            passwordToggle
            icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
          />
          <PasswordStrength password={password} />
        </div>

        <AuthInput
          compact
          label="Confirm Password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          passwordToggle
          icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
        />

        <AuthInput
          compact
          label="Shop / Store Name"
          name="storeName"
          placeholder="Anh Minh Store"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          error={errors.storeName}
          icon={<Store className="h-4 w-4" strokeWidth={1.75} />}
        />

        <div>
          <label
            htmlFor="role"
            className="mb-1 block text-xs font-medium text-ink"
          >
            Role
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">
              <Shield className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={`h-9 w-full appearance-none rounded-md border border-[#27272A] bg-surface-2 py-1.5 pr-10 pl-10 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-[#6366F1]/40 ${
                errors.role ? 'border-error' : ''
              }`}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          </div>
          {errors.role ? (
            <p className="mt-1 text-xs text-error">{errors.role}</p>
          ) : null}
        </div>

        <div>
          <label className="inline-flex items-start gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-[#27272A] bg-surface-2 accent-primary"
            />
            <span>
              I agree to the{' '}
              <button type="button" className="text-primary-hover hover:underline">
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" className="text-primary-hover hover:underline">
                Privacy Policy
              </button>
              .
            </span>
          </label>
          {errors.terms ? (
            <p className="mt-1 text-xs text-error">{errors.terms}</p>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="mt-1 h-9 min-h-9 w-full"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            'Create Account'
          )}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-ink-subtle">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-hover hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
