import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMyProfile } from '../../api/users.api'
import { useAuth } from '../../context/use-auth'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function isLikelyImageUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function LandingUserAvatar({
  onNavigate,
  showName = false,
}: {
  onNavigate?: () => void
  showName?: boolean
}) {
  const { session, ready } = useAuth()
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!session) {
      setName('')
      setAvatarUrl(undefined)
      return
    }
    let cancelled = false
    void fetchMyProfile()
      .then((profile) => {
        if (cancelled) return
        setName(profile.name)
        setAvatarUrl(profile.avatar)
      })
      .catch(() => {
        if (!cancelled) setName('')
      })
    return () => {
      cancelled = true
    }
  }, [session?.accessToken])

  if (!ready || !session) return null

  const initials = initialsFromName(name)
  const label = name || 'Hồ sơ'
  const photo = isLikelyImageUrl(avatarUrl) ? avatarUrl : undefined

  return (
    <Link
      to="/app/profile"
      className={showName ? 'landing-avatar-row' : 'landing-avatar-link'}
      title={label}
      aria-label={label}
      onClick={onNavigate}
    >
      <Avatar className="landing-avatar">
        {photo ? <AvatarImage src={photo} alt="" /> : null}
        <AvatarFallback className="landing-avatar-fallback">{initials}</AvatarFallback>
      </Avatar>
      {showName ? (
        <span className="min-w-0 truncate text-sm font-medium text-[var(--ls-ink)]">
          {label}
        </span>
      ) : null}
    </Link>
  )
}
