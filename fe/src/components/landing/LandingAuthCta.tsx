import { Link } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { homePath } from '../../lib/rbac'

type LandingAuthCtaVariant = 'header' | 'hero' | 'footer' | 'mobile'

const CLASS_BY_VARIANT: Record<LandingAuthCtaVariant, string> = {
  header: 'landing-cta inline-flex h-9 items-center px-3.5 text-sm font-medium',
  mobile:
    'landing-cta mt-1 inline-flex h-10 items-center justify-center text-sm font-medium',
  hero: 'landing-cta',
  footer:
    'landing-cta inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium',
}

function guestLabel(variant: LandingAuthCtaVariant): string {
  if (variant === 'hero') return 'Đăng nhập hệ thống'
  if (variant === 'footer') return 'Đăng nhập →'
  return 'Đăng nhập'
}

function signedInLabel(variant: LandingAuthCtaVariant): string {
  if (variant === 'hero') return 'Vào trang làm việc'
  if (variant === 'footer') return 'Vào làm việc →'
  return 'Vào làm việc'
}

export function LandingAuthCta({
  variant,
  onNavigate,
}: {
  variant: LandingAuthCtaVariant
  onNavigate?: () => void
}) {
  const { session, ready } = useAuth()

  if (!ready) {
    return (
      <span
        className={`${CLASS_BY_VARIANT[variant]} pointer-events-none opacity-50`}
        aria-hidden
      >
        …
      </span>
    )
  }

  if (session) {
    return (
      <Link
        to={homePath(session.role)}
        className={CLASS_BY_VARIANT[variant]}
        onClick={onNavigate}
      >
        {signedInLabel(variant)}
      </Link>
    )
  }

  return (
    <Link to="/login" className={CLASS_BY_VARIANT[variant]} onClick={onNavigate}>
      {guestLabel(variant)}
    </Link>
  )
}
