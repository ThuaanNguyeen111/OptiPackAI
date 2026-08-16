type PasswordStrengthProps = {
  password: string
}

function getStrength(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
const colors = [
  'bg-error',
  'bg-error',
  'bg-amber-400',
  'bg-primary-hover',
  'bg-success',
]

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = password ? getStrength(password) : 0
  const percent = password ? (score / 4) * 100 : 0

  return (
    <div className="mt-1">
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-all ${colors[score]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-ink-subtle">
        {password ? labels[score] : 'Use 8+ chars with number & symbol'}
      </p>
    </div>
  )
}
