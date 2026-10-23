'use client'

import { useState } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

/** 22/10/2026 — ô mật khẩu có nút Hiện/Ẩn (dùng ở đăng nhập, đăng ký, đăng nhập Admin). */
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false)
  return <span className="password-field">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button
      type="button"
      className="password-toggle"
      aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      aria-pressed={visible}
      onClick={() => setVisible((current) => !current)}
    >{visible ? 'Ẩn' : 'Hiện'}</button>
  </span>
}
