'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { loginAdmin } from '@/lib/api-client'
import { siteConfig } from '@/lib/site-config'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await loginAdmin({ email, password }); router.replace('/admin') }
    catch (error) { setError(error instanceof Error ? error.message : 'Đăng nhập thất bại') }
    finally { setBusy(false) }
  }

  return <main className="admin-login"><div className="form-card">
    <Link className="brand" href="/">{siteConfig.name}</Link>
    <div className="page-title"><span className="eyebrow">Quản trị cửa hàng</span><h1>Đăng nhập admin</h1></div>
    <form onSubmit={submit}>
      <label className="form-field">Email<input type="email" autoComplete="username" required maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label className="form-field">Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
    <p><Link href="/">← Về cửa hàng</Link></p>
  </div></main>
}
