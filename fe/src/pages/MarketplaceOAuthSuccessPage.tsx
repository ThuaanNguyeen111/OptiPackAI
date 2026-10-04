import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LoginScene } from '../components/auth/LoginScene'
import {
  publishLazadaOAuthNotice,
  upsertLazadaShop,
} from '../lib/lazada-shop'
import {
  formatMarketplaceOAuthError,
  LAZADA_OAUTH_ERROR_TYPE,
  LAZADA_OAUTH_MESSAGE_TYPE,
  MARKETPLACE_OAUTH_MESSAGE_TYPE,
} from '../types/marketplace-orders'

const ADMIN_MARKETPLACE_PATH = '/app/admin/marketplace'

const PLATFORM_LABELS: Record<string, string> = {
  lazada: 'Lazada',
  aurelle: 'AURELLE',
}

export function MarketplaceOAuthSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const shopId = params.get('shopId')?.trim() ?? ''
  const shopNameRaw = params.get('shopName')
  const shopName =
    shopNameRaw && shopNameRaw.trim() && shopNameRaw !== 'null'
      ? shopNameRaw.trim()
      : null
  const connected = params.get('connected') === 'true'
  const error = params.get('error')
  const failed = Boolean(error) || !shopId || !connected
  // BE cũ không gửi platform → mặc định Lazada (tương thích ngược)
  const platform = params.get('platform')?.trim() || 'lazada'
  const platformLabel = PLATFORM_LABELS[platform] ?? platform

  useEffect(() => {
    // Sàn khác Lazada (vd AURELLE): danh sách shop đọc từ DB, KHÔNG ghi vào
    // danh sách Lazada trong localStorage — chỉ báo tab gốc tải lại.
    if (platform !== 'lazada') {
      if (failed) return
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: MARKETPLACE_OAUTH_MESSAGE_TYPE, platform, shopId, shopName },
          window.location.origin,
        )
        window.close()
      }
      const fallback = window.setTimeout(() => {
        navigate(ADMIN_MARKETPLACE_PATH, { replace: true })
      }, 250)
      return () => window.clearTimeout(fallback)
    }

    if (error) {
      publishLazadaOAuthNotice({
        type: LAZADA_OAUTH_ERROR_TYPE,
        error,
      })
      if (
        window.name === 'optipack-lazada-connect' ||
        Boolean(window.opener && !window.opener.closed)
      ) {
        window.close()
      }
      return
    }

    if (!shopId || !connected) {
      if (window.opener && !window.opener.closed) {
        publishLazadaOAuthNotice({
          type: LAZADA_OAUTH_ERROR_TYPE,
          error: 'MKT_SERVER_ERROR',
        })
      }
      return
    }

    upsertLazadaShop({
      shopId,
      shopName,
      connectedAt: new Date().toISOString(),
    })

    publishLazadaOAuthNotice({
      type: LAZADA_OAUTH_MESSAGE_TYPE,
      shopId,
      shopName,
    })

    const openedAsConnectTab =
      window.name === 'optipack-lazada-connect' ||
      Boolean(window.opener && !window.opener.closed)

    if (openedAsConnectTab) {
      window.close()
    }

    const closeFallback = window.setTimeout(() => {
      navigate(ADMIN_MARKETPLACE_PATH, { replace: true })
    }, 250)
    return () => window.clearTimeout(closeFallback)
  }, [connected, error, failed, navigate, platform, shopId, shopName])

  if (failed) {
    return (
      <LoginScene
        closeTo={ADMIN_MARKETPLACE_PATH}
        artTitle="Kết nối sàn"
        artDescription="Hoàn tất ủy quyền shop để đồng bộ đơn hàng vào hệ thống."
      >
        <h1 className="login-title">Kết nối {platformLabel} không thành công</h1>
        <p className="login-lead">{formatMarketplaceOAuthError(error)}</p>
        <button
          type="button"
          className="login-cta"
          onClick={() => navigate(ADMIN_MARKETPLACE_PATH)}
        >
          Quay lại kết nối sàn
        </button>
      </LoginScene>
    )
  }

  return (
    <LoginScene
      closeTo={ADMIN_MARKETPLACE_PATH}
      artTitle="Kết nối sàn"
      artDescription="Hoàn tất ủy quyền shop để đồng bộ đơn hàng vào hệ thống."
    >
      <h1 className="login-title">Đang hoàn tất…</h1>
      <p className="login-lead">
        Shop {shopName ?? shopId} đã được ghi nhận. Bạn có thể đóng tab này.
      </p>
      <div className="login-status-icon">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    </LoginScene>
  )
}
