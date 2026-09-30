import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import './login-scene.css'

type LoginSceneProps = {
  night?: boolean
  children: ReactNode
  artTitle?: string
  artDescription?: string
  closeTo?: string
}

function pine(x: number, y: number, s: number): ReactNode {
  return (
    <g className="ls-tree" transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M16 0 L28 18 H22 L32 34 H24 L36 52 H-4 L8 34 H0 L10 18 H4 Z" />
      <rect x="13" y="52" width="6" height="14" rx="1" />
    </g>
  )
}

function LandscapeArt(): ReactNode {
  return (
    <svg
      className="login-art-svg"
      viewBox="0 0 420 560"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="lsSkyDay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4ecdd" />
          <stop offset="42%" stopColor="#c5e3d0" />
          <stop offset="100%" stopColor="#b8dcc8" />
        </linearGradient>
        <linearGradient id="lsSkyNight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#152d35" />
          <stop offset="55%" stopColor="#0f2228" />
          <stop offset="100%" stopColor="#0c1c22" />
        </linearGradient>
        <radialGradient id="lsSunGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#eef8f2" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#d4ecdd" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#d4ecdd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lsMoonGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#d4ecdd" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#c5e3d0" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#c5e3d0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lsMist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4ecdd" stopOpacity="0" />
          <stop offset="45%" stopColor="#152d35" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0c1c22" stopOpacity="0.72" />
        </linearGradient>
      </defs>

      <rect className="ls-sky-day" width="420" height="560" fill="url(#lsSkyDay)" />
      <rect className="ls-sky-night" width="420" height="560" fill="url(#lsSkyNight)" />

      <g className="ls-stars">
        <circle className="ls-star" cx="36" cy="42" r="1.3" fill="#fff" />
        <circle className="ls-star" cx="92" cy="68" r="1" fill="#fff" style={{ animationDelay: '0.4s' }} />
        <circle className="ls-star" cx="148" cy="30" r="1.2" fill="#fff" style={{ animationDelay: '1.1s' }} />
        <circle className="ls-star" cx="198" cy="86" r="0.8" fill="#fff" style={{ animationDelay: '0.2s' }} />
        <circle className="ls-star" cx="248" cy="40" r="1.4" fill="#fff" style={{ animationDelay: '1.6s' }} />
        <circle className="ls-star" cx="292" cy="74" r="0.7" fill="#fff" style={{ animationDelay: '0.8s' }} />
        <circle className="ls-star" cx="338" cy="26" r="1.1" fill="#fff" style={{ animationDelay: '1.3s' }} />
        <circle className="ls-star" cx="378" cy="58" r="0.9" fill="#fff" style={{ animationDelay: '0.6s' }} />
        <circle className="ls-star" cx="58" cy="118" r="0.7" fill="#fff" style={{ animationDelay: '1.8s' }} />
        <circle className="ls-star" cx="320" cy="112" r="0.8" fill="#fff" style={{ animationDelay: '0.3s' }} />
        <circle className="ls-star" cx="210" cy="54" r="0.6" fill="#fff" style={{ animationDelay: '2s' }} />
      </g>

      <g className="ls-sun">
        <circle cx="118" cy="108" r="54" fill="url(#lsSunGlow)" />
        <circle cx="118" cy="108" r="26" fill="#f3d06a" />
        <circle cx="118" cy="108" r="18" fill="#ffe9a8" />
      </g>

      <g className="ls-moon">
        <circle cx="118" cy="108" r="58" fill="url(#lsMoonGlow)" />
        <circle cx="118" cy="108" r="28" fill="#d4ecdd" />
        <circle cx="108" cy="100" r="5" fill="#c5e3d0" opacity="0.5" />
        <circle cx="128" cy="116" r="3.5" fill="#c5e3d0" opacity="0.4" />
      </g>

      <path
        className="ls-ridge-1"
        d="M-10 268 L70 168 L118 214 L176 128 L228 198 L286 118 L344 178 L430 142 L430 360 L-10 360 Z"
      />
      <path
        className="ls-ridge-2"
        d="M-10 312 L48 248 L102 286 L158 214 L214 270 L276 200 L340 258 L430 228 L430 420 L-10 420 Z"
      />
      <path
        className="ls-ridge-3"
        d="M-10 368 L40 322 L96 352 L150 300 L214 348 L278 308 L348 346 L430 318 L430 560 L-10 560 Z"
      />
      <ellipse className="ls-water" cx="210" cy="455" rx="250" ry="78" opacity="0.45" />
      <rect x="0" y="330" width="420" height="230" fill="url(#lsMist)" />

      {pine(8, 330, 1.15)}
      {pine(46, 348, 0.82)}
      {pine(348, 322, 1.28)}
      {pine(390, 344, 0.88)}
    </svg>
  )
}

export function LoginScene({
  night = false,
  children,
  artTitle = 'Quản lý công việc',
  artDescription = 'Đăng nhập để quản lý công việc, theo dõi tiến độ dự án và phối hợp cùng đội ngũ.',
  closeTo = '/',
}: LoginSceneProps): ReactNode {
  return (
    <div className={`login-scene${night ? ' is-night' : ''}`}>
      <svg
        className="login-scene-mountains"
        viewBox="0 0 1440 320"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0 220 L120 180 L260 230 L420 140 L580 210 L760 120 L940 200 L1100 150 L1280 210 L1440 170 L1440 320 L0 320 Z"
          opacity="0.25"
        />
        <path
          fill="currentColor"
          d="M0 260 L180 210 L340 250 L520 180 L720 240 L900 170 L1120 230 L1440 190 L1440 320 L0 320 Z"
          opacity="0.35"
        />
      </svg>

      <div className="login-card">
        <aside className="login-art">
          <LandscapeArt />
          <div className="login-art-copy">
            <h2>{artTitle}</h2>
            <p>{artDescription}</p>
          </div>
        </aside>

        <section className="login-panel">
          <Link to={closeTo} className="login-close" aria-label="Đóng">
            <X size={16} strokeWidth={2} />
          </Link>
          {children}
        </section>
      </div>
    </div>
  )
}
