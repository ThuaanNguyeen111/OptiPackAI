import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import './profile-staff-badge.css'

export type ProfileStaffBadgeProps = {
  name: string
  roleLabel: string
  avatar: string
  employeeCode: string
  department: string
  address: string
  email: string
  phone: string
  mfaEnabled: boolean
  userId: string
  joinedAt?: string
  loading?: boolean
  vi?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function isImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function formatJoined(iso: string | undefined, vi: boolean): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(vi ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function shortId(userId: string, employeeCode: string): string {
  if (employeeCode.trim()) return employeeCode.trim().toUpperCase()
  if (!userId) return 'OP-XXXX'
  return `OP-${userId.slice(-6).toUpperCase()}`
}

const BAR_HEIGHTS = [8, 14, 10, 18, 12, 20, 9, 16, 11, 19, 13, 17, 8, 15, 10, 18, 12]

export function ProfileStaffBadge({
  name,
  roleLabel,
  avatar,
  employeeCode,
  department,
  address,
  email,
  phone,
  mfaEnabled,
  userId,
  joinedAt,
  loading = false,
  vi = true,
}: ProfileStaffBadgeProps): ReactNode {
  const tiltRef = useRef<HTMLDivElement>(null)
  const [flipped, setFlipped] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const displayName = name.trim() || (vi ? 'Nhân viên' : 'Staff')
  const dept = department.trim() || (vi ? 'Chưa cập nhật' : 'Not set')
  const loc = address.trim() || 'OptiPackAI'
  const badgeId = shortId(userId, employeeCode)

  const onMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rotY = (px - 0.5) * 18
    const rotX = (0.5 - py) * 14
    setTilt({ x: rotX, y: rotY })
  }, [])

  const onLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 })
  }, [])

  const toggleFlip = useCallback(() => {
    setFlipped((v) => !v)
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleFlip()
      }
    },
    [toggleFlip],
  )

  return (
    <div className="psb-scene">
      <div
        ref={tiltRef}
        className="psb-tilt"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <div className="psb-clip" aria-hidden>
          <span className="psb-clip-strap" />
          <span className="psb-clip-bar" />
        </div>

        <div
          className={`psb-flip${flipped ? ' is-flipped' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={
            vi
              ? flipped
                ? 'Mặt sau thẻ nhân viên. Nhấn để lật lại.'
                : 'Thẻ nhân viên. Di chuột để nghiêng, nhấn để lật mặt sau.'
              : flipped
                ? 'Badge back. Press to flip front.'
                : 'Staff badge. Move mouse to tilt, press to flip.'
          }
          onClick={toggleFlip}
          onKeyDown={onKeyDown}
        >
          {/* Front */}
          <div className="psb-face psb-face-front">
            <span className="psb-slot" aria-hidden />
            <div className="psb-hero">
              <div className="psb-avatar-ring">
                <div className="psb-avatar">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isImageUrl(avatar) ? (
                    <img src={avatar.trim()} alt="" />
                  ) : (
                    initials(displayName)
                  )}
                </div>
                <span
                  className="psb-online"
                  title={vi ? 'Đang hoạt động' : 'Active'}
                />
              </div>
            </div>
            <div className="psb-body">
              <h2 className="psb-name">{displayName}</h2>
              <p className="psb-role">{roleLabel || '—'}</p>
              <div className="psb-rule" />
              <div className="psb-grid">
                <div className="psb-cell">
                  <p className="psb-label">{vi ? 'Phòng ban' : 'Department'}</p>
                  <p className="psb-value" title={dept}>
                    {dept}
                  </p>
                </div>
                <div className="psb-cell">
                  <p className="psb-label">{vi ? 'Địa điểm' : 'Location'}</p>
                  <p className="psb-value" title={loc}>
                    {loc}
                  </p>
                </div>
                <div className="psb-cell">
                  <p className="psb-label">{vi ? 'Tham gia' : 'Joined'}</p>
                  <p className="psb-value">{formatJoined(joinedAt, vi)}</p>
                </div>
                <div className="psb-cell">
                  <p className="psb-label">{vi ? 'Trạng thái' : 'Status'}</p>
                  <p className="psb-value psb-status">
                    <span className="psb-status-dot" />
                    {vi ? 'Hoạt động' : 'Active'}
                  </p>
                </div>
              </div>
              <div className="psb-footer">
                <div className="psb-bars" aria-hidden>
                  {BAR_HEIGHTS.map((h, i) => (
                    <span key={i} style={{ height: h }} />
                  ))}
                </div>
                <div className="psb-meta">
                  <span>{badgeId}</span>
                  <span>OptiPackAI</span>
                </div>
              </div>
            </div>
          </div>

          {/* Back */}
          <div className="psb-face psb-face-back">
            <span className="psb-slot" aria-hidden />
            <div className="psb-body" style={{ paddingTop: 28 }}>
              <p className="psb-back-title">
                {vi ? 'Chi tiết liên hệ' : 'Contact details'}
              </p>
              <ul className="psb-back-list">
                <li>
                  <strong>Email</strong>
                  <span>{email || '—'}</span>
                </li>
                <li>
                  <strong>{vi ? 'Số điện thoại' : 'Phone'}</strong>
                  <span>{phone.trim() || '—'}</span>
                </li>
                <li>
                  <strong>{vi ? 'Mã nhân viên' : 'Employee code'}</strong>
                  <span>{employeeCode.trim() || badgeId}</span>
                </li>
                <li>
                  <strong>MFA</strong>
                  <span className="inline-flex items-center gap-1.5">
                    {mfaEnabled ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-[#2f9e73]" strokeWidth={2} />
                        {vi ? 'Đã bật' : 'Enabled'}
                      </>
                    ) : (
                      vi ? 'Chưa bật' : 'Off'
                    )}
                  </span>
                </li>
              </ul>
              <div className="psb-brand-mark">
                <span className="psb-cube" aria-hidden />
                OptiPackAI
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="psb-hint">
        {vi
          ? flipped
            ? 'Nhấn thẻ để lật mặt trước'
            : 'Di chuột để nghiêng · Nhấn để lật mặt sau'
          : flipped
            ? 'Click to flip front'
            : 'Hover to tilt · Click to flip'}
      </p>
    </div>
  )
}
