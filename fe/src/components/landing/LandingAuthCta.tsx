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

function labelFor(
  signedIn: boolean,
  variant: LandingAuthCtaVariant,
): string {
  if (signedIn) {
    return variant === 'footer' ? 'Mở Dashboard →' : 'Vào hệ thống'
  }
  if (variant === 'hero') return 'Đăng nhập hệ thống'
  if (variant === 'footer') return 'Mở Dashboard →'
  return 'Đăng nhập'
}

export function LandingAuthCta({
  variant,
  onNavigate,
}: {
  variant: LandingAuthCtaVariant
  onNavigate?: () => void
}) {
  const { session, ready } = useAuth()
  if (!ready) return null

  const to = session ? homePath(session.role) : '/login'

  return (
    <Link to={to} className={CLASS_BY_VARIANT[variant]} onClick={onNavigate}>
      {labelFor(Boolean(session), variant)}
    </Link>
  )
}
