import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Boxes, ClipboardList, Truck } from 'lucide-react'
import { PackedCartonSvg } from '../landing/editorial/PackedCartonIllustration'
import { BrandMark } from '../brand/BrandMark'
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
  artTitle = 'Đơn từ mọi sàn, đóng đúng thùng, giao đúng người.',
  artDescription = 'Đơn Lazada và AURELLE, lấy hàng theo kệ, xếp thùng 3D và vận đơn GHN trong cùng một hệ thống.',
  closeTo = '/',
}: LoginSceneProps): ReactNode {
  return (
    <div className={`login-scene${night ? ' is-night' : ''}`}>
      <div className="login-card">
        <aside className="login-art">
          <Link to="/" className="login-art-brand">
            <BrandMark variant="login" />
            OptiPackAI
          </Link>
          <PackedCartonSvg className="login-art-carton" />
          <div className="login-art-copy">
            <h2>{artTitle}</h2>
            <p>{artDescription}</p>
            <ul className="login-art-steps">
              <li data-stage="pick">
                <ClipboardList size={15} strokeWidth={2} aria-hidden />
                Lấy hàng theo kệ
              </li>
              <li data-stage="pack">
                <Boxes size={15} strokeWidth={2} aria-hidden />
                Xếp thùng 3D
              </li>
              <li data-stage="ship">
                <Truck size={15} strokeWidth={2} aria-hidden />
                Vận đơn GHN
              </li>
            </ul>
          </div>
        </aside>

        <section className="login-panel">
          <Link to={closeTo} className="login-close">
            <ArrowLeft size={15} strokeWidth={2} aria-hidden />
            {closeTo === '/' ? 'Trang chủ' : 'Quay lại'}
          </Link>
          {children}
        </section>
      </div>
    </div>
  )
}
