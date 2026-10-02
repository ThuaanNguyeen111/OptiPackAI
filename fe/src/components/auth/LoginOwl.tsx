import type { ReactNode } from 'react'

export type LoginOwlMood =
  | 'idle'
  | 'greet'
  | 'watch'
  | 'shy'
  | 'error'
  | 'ok'
  | 'welcome'

type LoginOwlBubbleProps = {
  message: string
  mood: LoginOwlMood
}

export function LoginOwlBubble({ message, mood }: LoginOwlBubbleProps): ReactNode {
  return (
    <div
      id="login-owl-status"
      className={`login-owl-bubble is-${mood}`}
      role="status"
      aria-live="polite"
    >
      <p className="login-owl-bubble-text">{message}</p>
      <span className="login-owl-bubble-tail" aria-hidden />
    </div>
  )
}

type LoginOwlProps = {
  mood: LoginOwlMood
}

/** Cú nhỏ phía trên ô email — biểu cảm theo mood validate. */
export function LoginOwl({ mood }: LoginOwlProps): ReactNode {
  const eyesShut = mood === 'shy'
  const browsDown = mood === 'error'
  const happy = mood === 'ok' || mood === 'greet' || mood === 'welcome'

  return (
    <div className={`login-owl is-${mood}`} aria-hidden>
      <svg
        className="login-owl-svg"
        viewBox="0 2 64 64"
        width="48"
        height="54"
      >
        {/* body */}
        <ellipse cx="32" cy="42" rx="22" ry="24" fill="#152d35" />
        <ellipse cx="32" cy="46" rx="14" ry="16" fill="#2a4a54" />
        {/* belly spots */}
        <circle cx="26" cy="48" r="2.2" fill="#d4ecdd" opacity="0.35" />
        <circle cx="34" cy="52" r="1.8" fill="#d4ecdd" opacity="0.3" />
        <circle cx="38" cy="44" r="1.6" fill="#d4ecdd" opacity="0.28" />
        {/* head */}
        <circle cx="32" cy="26" r="18" fill="#152d35" />
        {/* ear tufts */}
        <path d="M16 18 L12 6 L24 14 Z" fill="#152d35" />
        <path d="M48 18 L52 6 L40 14 Z" fill="#152d35" />
        {/* face disk */}
        <ellipse cx="32" cy="28" rx="14" ry="12" fill="#d4ecdd" />
        {/* brows */}
        <path
          d={
            browsDown
              ? 'M20 22 Q26 26 30 23'
              : happy
                ? 'M20 23 Q26 20 30 22'
                : 'M20 22 Q26 20 30 22'
          }
          fill="none"
          stroke="#152d35"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d={
            browsDown
              ? 'M34 23 Q38 26 44 22'
              : happy
                ? 'M34 22 Q38 20 44 23'
                : 'M34 22 Q38 20 44 22'
          }
          fill="none"
          stroke="#152d35"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* eyes */}
        {eyesShut ? (
          <>
            <path
              d="M22 28 Q26 31 30 28"
              fill="none"
              stroke="#152d35"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M34 28 Q38 31 42 28"
              fill="none"
              stroke="#152d35"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx="26" cy="28" r="4.5" fill="#fff" />
            <circle
              cx={mood === 'watch' ? 27.2 : 26}
              cy={mood === 'watch' ? 28.5 : 28}
              r="2.2"
              fill="#152d35"
            />
            <circle cx="38" cy="28" r="4.5" fill="#fff" />
            <circle
              cx={mood === 'watch' ? 39.2 : 38}
              cy={mood === 'watch' ? 28.5 : 28}
              r="2.2"
              fill="#152d35"
            />
          </>
        )}
        {/* beak */}
        <path d="M32 32 L28 36 L36 36 Z" fill="#e8a54b" />
        {/* wing tip on perch */}
        <ellipse cx="14" cy="48" rx="6" ry="10" fill="#0f2228" transform="rotate(-20 14 48)" />
        <ellipse cx="50" cy="48" rx="6" ry="10" fill="#0f2228" transform="rotate(20 50 48)" />
        {/* feet — nằm gọn trong asset, không chồng nền ô input */}
        <path
          d="M24 64 Q26 61 28 64 M30 64 Q32 61 34 64 M36 64 Q38 61 40 64"
          fill="none"
          stroke="#e8a54b"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
