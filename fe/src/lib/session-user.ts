/** `sub` trong access token là id người đang đăng nhập. */
export function sessionUserId(token: string | undefined): string | null {
  if (!token) return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json: unknown = JSON.parse(atob(padded))
    if (typeof json !== 'object' || json === null || !('sub' in json)) return null
    const sub = (json as { sub?: unknown }).sub
    return typeof sub === 'string' && sub.length > 0 ? sub : null
  } catch {
    return null
  }
}
