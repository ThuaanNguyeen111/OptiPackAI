import { Play } from 'lucide-react'
import { Hero3DCanvas } from '../marketing/Hero3DCanvas'
import { handleLandingHashClick } from './scroll-landing'
import { LandingAuthCta } from './LandingAuthCta'

export function HeroSection() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-grid">
        <div>
          <div className="landing-kicker">
            <span aria-hidden>🚀</span>
            Logistics đa kênh hỗ trợ bởi AI
          </div>

          <h1>
            Xử lý đơn hàng thông minh & <em>tối ưu đóng gói</em>
          </h1>

          <p className="landing-hero-lead">
            Gộp đơn đa kênh từ Shopee, TikTok Shop và Facebook. Loại bỏ khoảng
            trống thừa trong kiện hàng nhờ thuật toán AI 3D Bin Packing.
          </p>

          <div className="landing-hero-ctas">
            <LandingAuthCta variant="hero" />
            <a
              href="#ai-engine"
              className="landing-hero-ghost"
              onClick={(event) => handleLandingHashClick(event, '#ai-engine')}
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              Xem demo đóng gói 3D
            </a>
          </div>

          <ol className="landing-steps">
            <li>
              <a
                href="#integrations"
                onClick={(event) => handleLandingHashClick(event, '#integrations')}
              >
                <span>01</span>
                Đồng bộ đa kênh
              </a>
            </li>
            <li>
              <a
                href="#ai-engine"
                onClick={(event) => handleLandingHashClick(event, '#ai-engine')}
              >
                <span>02</span>
                AI đóng gói
              </a>
            </li>
            <li>
              <a
                href="#features"
                onClick={(event) => handleLandingHashClick(event, '#features')}
              >
                <span>03</span>
                Fulfillment kho
              </a>
            </li>
          </ol>
        </div>

        <div className="mx-auto h-[300px] w-full max-w-lg overflow-hidden rounded-2xl lg:h-[380px] lg:max-w-none">
          <Hero3DCanvas className="h-full min-h-0" />
        </div>
      </div>
    </section>
  )
}
