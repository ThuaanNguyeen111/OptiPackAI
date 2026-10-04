import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>{siteConfig.name}</strong>
        <p>Phong cách tối giản cho những ngày đẹp trời.</p>
        <p style={{ marginTop: '12px', fontSize: '13px' }}>
          <Link href="/developer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            ◈ Cổng Nhà phát triển & API Open API
          </Link>
        </p>
      </div>
      <div>
        <h4>Hỗ trợ</h4>
        <p>Giao hàng & đổi trả</p>
        <p>Liên hệ</p>
        <p>
          <a href="http://localhost:3000/api/docs" target="_blank" rel="noreferrer">
            Swagger API Docs ↗
          </a>
        </p>
      </div>
      <div>
        <h4>Đăng ký nhận tin</h4>
        <p>Nhận thông tin sản phẩm mới và ưu đãi.</p>
        <div className="newsletter">
          <input placeholder="Email của bạn" type="email" />
          <button aria-label="Đăng ký nhận tin">→</button>
        </div>
      </div>
      <small>© 2026 {siteConfig.name}. Template adapted from TemplatesJungle. Giữ credit theo license template.</small>
    </footer>
  )
}
