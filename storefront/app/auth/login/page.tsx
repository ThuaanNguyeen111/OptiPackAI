'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { getCurrentCustomer, loginCustomer } from '@/lib/api-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Phiên còn hợp lệ (hỏi server, không tin hồ sơ lưu trong trình duyệt) thì không hiện lại form đăng nhập;
  // hết hạn thì xóa hồ sơ cũ để không còn trạng thái "đã đăng nhập giả".
  useEffect(() => {
    let active = true
    getCurrentCustomer()
      .then(() => { if (active) router.replace('/account') })
      .catch(() => { localStorage.removeItem('kaira-customer'); window.dispatchEvent(new Event('kaira-auth-changed')) })
    return () => { active = false }
  }, [router])
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await loginCustomer({ email, password }); localStorage.setItem('kaira-customer', JSON.stringify(result.customer)); window.dispatchEvent(new Event('kaira-auth-changed')); router.push('/account') } catch (err) { setError(err instanceof Error ? err.message : 'Đăng nhập thất bại') } finally { setBusy(false) } }
  return <><Header /><main className="page-shell"><div className="form-card"><div className="page-title"><span className="eyebrow">Welcome back</span><h1>Đăng nhập</h1></div><form onSubmit={submit}><label className="form-field">Email<input required id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="form-field">Mật khẩu<input required id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Đang xử lý...' : 'Đăng nhập'}</button></form><p style={{ marginTop: 20, fontSize: 14, color: "var(--muted, #6b6560)" }}>Chưa có tài khoản? <Link href="/auth/register" style={{ color: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Đăng ký ngay</Link></p></div></main><Footer /></>
}
