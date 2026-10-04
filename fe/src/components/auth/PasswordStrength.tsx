type PasswordStrengthProps = {
  password: string
}

function getStrength(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[@$!%*?&]/.test(password)) score += 1
  return score
}

const labels = ['Rất yếu', 'Yếu', 'Tạm được', 'Tốt', 'Mạnh']

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = password ? getStrength(password) : 0
  const percent = password ? (score / 4) * 100 : 0

  return (
    <div className="login-strength">
      <div className="login-strength-bar">
        <div
          className={`login-strength-fill is-${score}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="login-strength-hint">
        {password ? labels[score] : 'Tối thiểu 8 ký tự, chữ hoa/thường, số, ký tự đặc biệt'}
      </p>
    </div>
  )
}
