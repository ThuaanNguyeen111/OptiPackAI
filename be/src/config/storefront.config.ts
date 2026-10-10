import { registerAs } from '@nestjs/config';

export const DEFAULT_STOREFRONT_NAME = 'AURELLE';

export default registerAs('storefront', () => ({
  name: process.env.STOREFRONT_NAME?.trim() ?? DEFAULT_STOREFRONT_NAME,
  // Website đặt hàng xong bắn webhook "đơn mới" tới ứng dụng đối tác đã
  // kết nối bằng app key (OptiPack). Ký bằng app key/secret của ứng dụng đó
  // — cùng cặp OptiPack dùng để gọi Open API (AURELLE_APP_KEY/SECRET).
  // Để trống AURELLE_WEBHOOK_URL = tắt webhook, chỉ còn cron 10 phút.
  aurelleWebhook: {
    url:
      process.env.AURELLE_WEBHOOK_URL ??
      `http://localhost:${process.env.PORT ?? '3000'}/marketplace/webhooks/aurelle`,
    appKey: process.env.AURELLE_APP_KEY,
    appSecret: process.env.AURELLE_APP_SECRET,
    sellerId: process.env.AURELLE_SELLER_ID ?? '200000000101',
  },
}));
