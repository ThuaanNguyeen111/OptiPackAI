'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { registerCustomer } from '@/lib/api-client'

export default function RegisterPage() {
  const router = useRouter(); const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' }); const [error, setError] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); try { const result = await registerCustomer(form); localStorage.setItem('kaira-customer', JSON.stringify(result.customer)); window.dispatchEvent(new Event('kaira-auth-changed')); router.push('/account') } catch (err) { setError(err instanceof Error ? err.message : 'Đăng ký thất bại') } }
  return <><Header /><main className="page-shell"><div className="form-card"><div className="page-title"><span className="eyebrow">Join AURELLE</span><h1>Tạo tài khoản</h1></div><form onSubmit={submit}><label className="form-field">Họ tên<input required name="name" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="form-field">Email<input required name="email" autoComplete="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="form-field">Số điện thoại<input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="form-field">Mật khẩu<input required minLength={8} name="password" autoComplete="new-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>{error && <p className="error">{error}</p>}<button className="button">Đăng ký</button></form><p style={{ marginTop: 20, fontSize: 14, color: "var(--muted, #6b6560)" }}>Đã có tài khoản? <Link href="/auth/login" style={{ color: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Đăng nhập</Link></p></div></main><Footer /></>
}
