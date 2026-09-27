/**
 * FE-only demo: 1 khách — Lazada (giày + áo) + TikTok (quần).
 * Dùng khi live chỉ có Lazada để demo rule gộp đa sàn cho GV.
 */
import type {
  MarketplaceOrderDetail,
  MarketplaceOrderListItem,
} from '../types/marketplace-orders'

export const DEMO_MULTI_PLATFORM_GROUP_ID = '00000000000000000000demo'

export const DEMO_LAZADA_ORDER_ID = 'demo-lazada-shoes-shirt'
export const DEMO_TIKTOK_ORDER_ID = 'demo-tiktok-pants'

const DEMO_CREATED_AT = '2026-09-15T08:30:00.000Z'

export const demoMultiPlatformListOrders: MarketplaceOrderListItem[] = [
  {
    id: DEMO_LAZADA_ORDER_ID,
    platform: 'lazada',
    shopId: 'demo-shop-lazada',
    platformOrderId: '532416983949763',
    platformOrderNumber: '532416983949763',
    status: 'pending',
    recipientName: 'Trần Văn An',
    recipientCity: 'Quận 1, TP.HCM',
    isConsolidated: true,
    consolidatedGroupId: DEMO_MULTI_PLATFORM_GROUP_ID,
    totalAmount: 890_000,
    currency: 'VND',
    itemCount: 2,
    createdAt: DEMO_CREATED_AT,
  },
  {
    id: DEMO_TIKTOK_ORDER_ID,
    platform: 'tiktok',
    shopId: 'demo-shop-tiktok',
    platformOrderId: 'TT-22910',
    platformOrderNumber: 'TT-22910',
    status: 'pending',
    recipientName: 'Trần Văn An',
    recipientCity: 'Quận 1, TP.HCM',
    isConsolidated: true,
    consolidatedGroupId: DEMO_MULTI_PLATFORM_GROUP_ID,
    totalAmount: 320_000,
    currency: 'VND',
    itemCount: 1,
    createdAt: '2026-09-15T08:45:00.000Z',
  },
]

const baseRecipient = {
  recipientPhone: '0901 882 193',
  recipientAddressLine1: '123 Nguyễn Huệ, Phường Bến Nghé',
  recipientAddressLine2: null as string | null,
  recipientPostalCode: '700000',
  recipientCountry: 'VN',
}

export const demoMultiPlatformDetails: Record<string, MarketplaceOrderDetail> = {
  [DEMO_LAZADA_ORDER_ID]: {
    ...demoMultiPlatformListOrders[0]!,
    ...baseRecipient,
    items: [
      {
        sku: 'GIAY-SNEAK-01',
        name: 'Giày Sneaker Nam Trắng',
        variation: 'Size 42',
        status: 'pending',
        quantity: 1,
        unitPrice: 550_000,
        lineTotal: 550_000,
        platformOrderItemIds: ['demo-item-shoe'],
      },
      {
        sku: 'AO-POLO-01',
        name: 'Áo Polo Nam Cotton',
        variation: 'Size L · Navy',
        status: 'pending',
        quantity: 1,
        unitPrice: 340_000,
        lineTotal: 340_000,
        platformOrderItemIds: ['demo-item-shirt'],
      },
    ],
  },
  [DEMO_TIKTOK_ORDER_ID]: {
    ...demoMultiPlatformListOrders[1]!,
    ...baseRecipient,
    items: [
      {
        sku: 'QUAN-JEAN-02',
        name: 'Quần Jeans Nam Slim Fit',
        variation: 'Size 30 · Xanh đậm',
        status: 'pending',
        quantity: 1,
        unitPrice: 320_000,
        lineTotal: 320_000,
        platformOrderItemIds: ['demo-item-pants'],
      },
    ],
  },
}

export function isDemoOrderId(id: string): boolean {
  return id.startsWith('demo-')
}

export function getDemoOrderDetail(
  id: string,
): MarketplaceOrderDetail | null {
  return demoMultiPlatformDetails[id] ?? null
}

export function getDemoSiblingsForGroup(
  groupId: string,
): MarketplaceOrderListItem[] {
  if (groupId !== DEMO_MULTI_PLATFORM_GROUP_ID) return []
  return [...demoMultiPlatformListOrders]
}
