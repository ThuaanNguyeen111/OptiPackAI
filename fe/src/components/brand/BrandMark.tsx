type BrandMarkProps = {
  className?: string
  /** `login` dùng ô mark trên màn đăng nhập */
  variant?: 'default' | 'login'
}

/** Ô logo: thay chữ OP bằng icon thùng OptiPackAI. */
export function BrandMark({
  className = '',
  variant = 'default',
}: BrandMarkProps) {
  const base = variant === 'login' ? 'login-art-mark' : 'lp-mark'
  return (
    <span className={`${base} ${className}`.trim()} aria-hidden>
      <img
        src="/brand/optipack-mark.png"
        alt=""
        className="brand-mark-img"
        width={32}
        height={32}
        decoding="async"
      />
    </span>
  )
}
