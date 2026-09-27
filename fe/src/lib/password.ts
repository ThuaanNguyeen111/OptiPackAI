const BE_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/

export function validateNewPassword(password: string): string | undefined {
  if (!password) return 'Vui lòng nhập mật khẩu mới.'
  if (password.length < 8) return 'Mật khẩu mới phải từ 8 ký tự trở lên.'
  if (!BE_PASSWORD_PATTERN.test(password)) {
    return 'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt.'
  }
  return undefined
}
