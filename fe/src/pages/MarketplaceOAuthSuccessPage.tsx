import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
import {
  publishLazadaOAuthNotice,
  upsertLazadaShop,
} from '../lib/lazada-shop'
import {
  formatMarketplaceOAuthError,
  LAZADA_OAUTH_ERROR_TYPE,
  LAZADA_OAUTH_MESSAGE_TYPE,
} from '../types/marketplace-orders'

const ADMIN_MARKETPLACE_PATH = '/app/admin/marketplace'

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

  useEffect(() => {
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
  }, [connected, error, navigate, shopId, shopName])

  if (failed) {
    return (
      <AuthLayout mode="login">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Kết nối Lazada không thành công
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {formatMarketplaceOAuthError(error)}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full"
            onClick={() => navigate(ADMIN_MARKETPLACE_PATH)}
          >
            Quay lại kết nối sàn
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout mode="login">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Đang hoàn tất kết nối shop…
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Shop {shopName ?? shopId} đã được ghi nhận. Bạn có thể đóng tab này.
        </p>
      </div>
    </AuthLayout>
  )
}
