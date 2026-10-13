'use client'

import Link from 'next/link'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-shell"><div className="form-card" role="alert">
    <h1>Chưa tải được dữ liệu</h1><p>Vui lòng thử lại sau ít phút.</p>
    <button className="button" onClick={reset}>Thử lại</button> <Link href="/">Về trang chủ</Link>
  </div></main>
}
