import { Link } from 'react-router-dom'

type LandingAuthCtaVariant = 'header' | 'hero' | 'footer' | 'mobile'

const CLASS_BY_VARIANT: Record<LandingAuthCtaVariant, string> = {
  header: 'landing-cta inline-flex h-9 items-center px-3.5 text-sm font-medium',
  mobile:
    'landing-cta mt-1 inline-flex h-10 items-center justify-center text-sm font-medium',
  hero: 'landing-cta',
  footer:
    'landing-cta inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium',
}

function labelFor(variant: LandingAuthCtaVariant): string {
  if (variant === 'hero') return 'Đăng nhập hệ thống'
  if (variant === 'footer') return 'Đăng nhập →'
  return 'Đăng nhập'
}

export function LandingAuthCta({
  variant,
  onNavigate,
}: {
  variant: LandingAuthCtaVariant
  onNavigate?: () => void
}) {
  return (
    <Link to="/login" className={CLASS_BY_VARIANT[variant]} onClick={onNavigate}>
      {labelFor(variant)}
    </Link>
  )
}
