import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, Mail, MailCheck } from 'lucide-react'
import { AuthInput } from '../components/auth/AuthInput'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'

const RESEND_SECONDS = 60

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  function validateEmail(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return 'Vui lòng nhập email.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return 'Email không hợp lệ.'
    }
    return undefined
  }

  async function sendReset(target: string) {
    // Mock — thay bằng API khi BE sẵn sàng
    await new Promise((r) => setTimeout(r, 900))
    setSentTo(target)
    setSent(true)
    setCooldown(RESEND_SECONDS)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      setError(err)
      return
    }
    setError(undefined)
    setLoading(true)
    try {
      await sendReset(email.trim())
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !sentTo) return
    setResending(true)
    try {
      await sendReset(sentTo)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout mode="forgot">
      {!sent ? (
        <>
          <div className="lg:hidden">
            <Link to="/" className="mb-6 inline-flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-on-primary shadow-[0_0_24px_rgba(99,102,241,0.4)]">
                OP
              </span>
              <span className="text-lg font-semibold tracking-tight text-ink">
                OptiPackAI
              </span>
            </Link>
          </div>

          <div>
            <p className="mb-3 hidden text-sm font-semibold tracking-tight text-ink lg:block">
              OptiPackAI
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Quên mật khẩu?
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Nhập email của bạn để nhận liên kết đặt lại mật khẩu
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <AuthInput
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@store.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(undefined)
              }}
              error={error}
              icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang gửi…
                </>
              ) : (
                'Gửi liên kết khôi phục'
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-medium text-primary-hover hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Quay lại
            </Link>
          </p>
        </>
      ) : (
        <div className="text-center">
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full opacity-70 blur-xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(16,185,129,0.45), rgba(99,102,241,0.35), transparent 70%)',
              }}
            />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#222734] bg-[#151922] shadow-[0_0_28px_rgba(99,102,241,0.35)] ring-2 ring-[#6366F1]/30 ring-offset-2 ring-offset-[#0B0E14]">
              <MailCheck className="h-7 w-7 text-[#10B981]" strokeWidth={1.75} />
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Kiểm tra hòm thư của bạn
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến{' '}
            <span className="font-mono text-ink">{sentTo}</span>
          </p>

          <div className="mt-8 space-y-3">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => {
                window.location.href = `mailto:${sentTo}`
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" strokeWidth={1.75} />
              Mở ứng dụng Email
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={cooldown > 0 || resending}
              onClick={handleResend}
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang gửi lại…
                </>
              ) : cooldown > 0 ? (
                <>Gửi lại sau {cooldown}s</>
              ) : (
                'Gửi lại liên kết'
              )}
            </Button>
          </div>

          <p className="mt-8 text-center text-sm">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-medium text-primary-hover hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Quay lại trang Đăng nhập
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  )
}
