import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/auth/AuthLayout'
import { Button } from '../components/ui/Button'
import { upsertLazadaShop } from '../lib/lazada-shop'
import { LAZADA_OAUTH_MESSAGE_TYPE } from '../types/marketplace-orders'

export function MarketplaceOAuthSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const shopId = params.get('shopId')?.trim() ?? ''
  const shopNameRaw = params.get('shopName')
  const shopName =
    shopNameRaw && shopNameRaw.trim() && shopNameRaw !== 'null'
      ? shopNameRaw.trim()
      : null
  const connected = params.get('connected') !== 'false'
  const error = params.get('error')

  useEffect(() => {
    if (error || !shopId || !connected) return

    upsertLazadaShop({
      shopId,
      shopName,
      connectedAt: new Date().toISOString(),
    })

    const payload = {
      type: LAZADA_OAUTH_MESSAGE_TYPE,
      shopId,
      shopName,
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin)
      window.close()
      return
    }
    navigate('/app/admin/marketplace', { replace: true })
  }, [connected, error, navigate, shopId, shopName])

  if (error || !shopId) {
    return (
      <AuthLayout mode="login">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Kết nối Lazada không thành công
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {error
              ? `Mã lỗi: ${error}`
              : 'Thiếu shopId trên URL callback. Nếu BE vẫn trả JSON thô, hãy dán JSON ở màn Kết nối sàn.'}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full"
            onClick={() => navigate('/app/admin/marketplace')}
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
