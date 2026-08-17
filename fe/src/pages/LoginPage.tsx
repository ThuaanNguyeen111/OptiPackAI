import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Lock, Mail } from 'lucide-react'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'

type LoginErrors = {
  email?: string
  password?: string
  form?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})

  function validate() {
    const next: LoginErrors = {}
    if (!email.trim()) next.email = 'Vui lòng nhập email hoặc username.'
    else if (!email.includes('@') && email.trim().length < 3) {
      next.email = 'Email / username không hợp lệ.'
    }
    if (!password) next.password = 'Vui lòng nhập mật khẩu.'
    else if (password.length < 6) next.password = 'Mật khẩu tối thiểu 6 ký tự.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrors({})
    // Mock auth — thay bằng API khi BE sẵn sàng
    await new Promise((r) => setTimeout(r, 900))
    setLoading(false)

    if (remember) {
      localStorage.setItem('optipack-remember', email.trim())
    }
    navigate('/app')
  }

  return (
    <AuthLayout mode="login">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Sign in to manage omnichannel orders and AI packaging.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        {errors.form ? (
          <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {errors.form}
          </div>
        ) : null}

        <AuthInput
          label="Email / Username"
          name="email"
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

        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign In to Dashboard'
          )}
        </Button>

        <div className="relative py-2 text-center text-xs text-ink-tertiary">
          <span className="absolute inset-x-0 top-1/2 border-t border-[#27272A]" />
          <span className="relative bg-canvas px-3">or</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() =>
            setErrors({ form: 'Google SSO sẽ được tích hợp ở giai đoạn auth BE.' })
          }
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#EA4335"
              d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.8 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.6 8.6-8.8 0-.6-.1-1-.2-1.5H12z"
            />
          </svg>
          Continue with Google
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-subtle">
        New to OptiPackAI?{' '}
        <Link to="/register" className="font-medium text-primary-hover hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
