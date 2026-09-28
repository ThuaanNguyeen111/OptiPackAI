import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, MailCheck } from 'lucide-react'
import { forgotPassword } from '../api/auth.api'
import { LoginScene } from '../components/auth/LoginScene'
import { formatApiError } from '../lib/api'

const RESEND_SECONDS = 60

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [info, setInfo] = useState('')
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
    const res = await forgotPassword(target)
    setSentTo(target)
    setSent(true)
    setInfo(res.message)
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
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !sentTo) return
    setResending(true)
    setError(undefined)
    try {
      await sendReset(sentTo)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <LoginScene
      closeTo="/login"
      artTitle="Khôi phục truy cập"
      artDescription="Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu an toàn."
    >
      {!sent ? (
        <>
          <h1 className="login-title">Quên mật khẩu?</h1>
          <p className="login-lead">
            Nhập email của bạn để nhận liên kết đặt lại mật khẩu
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-stack">
              <div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@store.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError(undefined)
                  }}
                  className={`login-field${error ? ' is-invalid' : ''}`}
                  aria-invalid={Boolean(error)}
                />
                {error ? <p className="login-error">{error}</p> : null}
              </div>
            </div>

            <button type="submit" className="login-cta" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang gửi…
                </>
              ) : (
                'Gửi liên kết khôi phục'
              )}
            </button>
          </form>

          <p className="login-foot">
            <Link to="/login">← Quay lại đăng nhập</Link>
          </p>
        </>
      ) : (
        <div className="login-status">
          <div className="login-status-icon">
            <MailCheck className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h1 className="login-title">Kiểm tra hòm thư</h1>
          <p className="login-lead">
            {info ||
              'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.'}{' '}
            <span className="login-mono">{sentTo}</span>
          </p>

          {error ? <p className="login-error">{error}</p> : null}

          <button
            type="button"
            className="login-cta"
            onClick={() => {
              window.location.href = `mailto:${sentTo}`
            }}
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
            Mở ứng dụng Email
          </button>

          <button
            type="button"
            className="login-google"
            disabled={cooldown > 0 || resending}
            onClick={() => void handleResend()}
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang gửi lại…
              </>
            ) : cooldown > 0 ? (
              <>Gửi lại sau {cooldown}s</>
            ) : (
              'Gửi lại liên kết'
            )}
          </button>

          <p className="login-foot">
            <Link to="/login">← Quay lại đăng nhập</Link>
          </p>
        </div>
      )}
    </LoginScene>
  )
}
