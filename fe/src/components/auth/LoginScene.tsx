import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { PackedCartonSvg } from '../landing/editorial/PackedCartonIllustration'
import './login-scene.css'

type LoginSceneProps = {
  night?: boolean
  children: ReactNode
  artTitle?: string
  artDescription?: string
  closeTo?: string
}

export function LoginScene({
  night = false,
  children,
  artTitle = 'OptiPackAI',
  artDescription = 'Đơn Lazada và AURELLE, lấy hàng theo kệ, xếp thùng 3D và vận đơn GHN trong cùng một hệ thống.',
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
          <PackedCartonSvg className="login-art-carton" />
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
