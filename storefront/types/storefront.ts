export type ProductVariant = {
  id: string
  productId: string
  sku: string
  variantName: string
  color?: string | null
  size?: string | null
  imageUrl?: string | null
  price: number
  compareAtPrice?: number | null
  weightKg?: number | null
  /** 22/10/2026 — kích thước kiện (chỉ trả cho Admin). */
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  availableQuantity: number
  isDefault: boolean
}

export type SizeChartRow = {
  size: string
  bust_cm?: number | null
  waist_cm?: number | null
  hip_cm?: number | null
  length_cm?: number | null
}

export type SizeChartType = 'apparel' | 'shoes'

export type Product = {
  id: string
  name: string
  slug: string
  description: string
  categoryId?: string | null
  categoryName?: string | null
  thumbnailUrl: string
  galleryImages: string[]
  sizeChart: SizeChartRow[]
  sizeChartType?: SizeChartType
  sizeGuideNote?: string
  status: 'draft' | 'active' | 'hidden'
  isFeatured: boolean
  variants: ProductVariant[]
}

export type CartItem = {
  variant: ProductVariant
  product: Pick<Product, 'id' | 'name' | 'slug' | 'thumbnailUrl'>
  quantity: number
}

export type Category = { id: string; name: string; slug: string }

/** 22/10/2026 — danh mục website trên trang Admin (`/storefront/admin/categories`). */
export type AdminCategory = Category & {
  description: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  /** Danh mục cấp 2 OptiPack đã nối (phần đầu SKU của sản phẩm trong danh mục). */
  skuCategoryCode: string | null
  productCount: number
}

export type SaveAdminCategory = {
  name: string
  description?: string
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
  skuCategoryCode?: string | null
}

export type AdminProduct = Omit<Product, 'variants'> & {
  /** 22/10/2026 — phần đầu SKU theo quy tắc OptiPack (null = sản phẩm cũ). */
  skuCategoryCode?: string | null
  skuModelNo?: number | null
  // stockSource 'optipack' (21/10/2026) = tồn do kho OptiPack đẩy sang, Admin chỉ xem.
  // colorCode (22/10/2026) = mã màu OptiPack của biến thể theo quy tắc; null = biến thể cũ.
  variants: (ProductVariant & { quantityOnHand: number; reservedQuantity: number; stockSource?: 'storefront' | 'optipack'; stockSyncedAt?: string | null; colorCode?: string | null })[]
}

/** 22/10/2026 — danh mục cấp 2 + màu của OptiPack để ghép SKU (`GET /storefront/admin/products/sku-options`). */
export type SkuOptions = {
  rule: string
  categories: { code: string; name: string; parentCode: string | null; sizes: string[] }[]
  colors: { code: string; name: string; hex: string | null }[]
}

export type SaveAdminProduct = Pick<Product, 'name' | 'description' | 'thumbnailUrl' | 'galleryImages' | 'status' | 'isFeatured'> & {
  categoryId: string | null
  /** 22/10/2026 — bắt buộc khi có biến thể mới (SKU theo quy tắc OptiPack). */
  skuCategoryCode?: string
  skuModelNo?: number
  variants: {
    id?: string; color: string; size: string; colorCode?: string; price: number; quantityOnHand: number
    /** 22/10/2026 — kích thước kiện; null = xoá, bỏ trống = giữ nguyên. */
    weightKg?: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null
  }[]
}

export type Customer = {
  id: string
  name: string
  email: string
  phone?: string
}

export type StorefrontOrder = {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  totalAmount: number
  subtotal?: number
  discountAmount?: number
  shippingFee?: number
  currency: string
  createdAt: string
  publicOrderId: number | null
  /** Yêu cầu trả hàng chưa xử lý xong của đơn (null nếu không có). */
  activeReturn?: { id: string; status: string; statusLabel: string } | null
  /** 22/10/2026 — ai hủy đơn: khách tự hủy hay người bán hủy (hết hàng...). */
  cancelSource?: 'customer' | 'seller' | null
  cancelReason?: string | null
  /** 22/10/2026 — tiền giảm trừ vì kho giao thiếu. */
  shortRefundAmount?: number
  /** 22/10/2026 — tổng tiền đã hoàn (trả hàng / hủy). */
  refundedAmount?: number
}

export type StorefrontOrderItem = {
  product_id: string
  variant_id: string
  sku_snapshot: string
  product_name_snapshot: string
  variant_snapshot: string
  image_snapshot?: string | null
  unit_price: number
  quantity: number
  discount_amount?: number
  line_total: number
  /** 22/10/2026 — số đơn vị kho báo giao thiếu (không tính tiền). */
  short_quantity?: number
}

export type StorefrontOrderDetail = StorefrontOrder & {
  trackingCode?: string | null
  tripCode?: string | null
  /** 21/10/2026 — tên hãng vận chuyển (GHN...), null khi chưa giao cho hãng */
  carrier?: string | null
  events?: StorefrontOrderEvent[]
  paymentMethod?: 'cod' | 'bank_transfer' | null
  shippingAddress?: {
    recipient_name: string
    phone: string
    province: string
    district?: string
    ward: string
    address_line: string
  }
  items: StorefrontOrderItem[]
}

export type StorefrontReturnType = 'return_refund' | 'refund_only' | 'exchange'

export type StorefrontReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'closed' | 'canceled'

export type StorefrontReturnItem = {
  sku: string
  quantity: number
  reasonCode: string
  reasonLabel: string
}

export type StorefrontReturn = {
  id: string
  orderId: string
  orderNumber: string
  type: StorefrontReturnType
  status: StorefrontReturnStatus
  statusLabel: string
  items: StorefrontReturnItem[]
  exchangeItems: { sku: string; quantity: number }[]
  /** 22/10/2026 — hàng đổi đang được giao tới khách (null = cửa hàng chưa gửi hàng đổi). */
  exchangeShipment: {
    status: 'packed' | 'shipped' | 'delivered' | 'failed_delivery'
    statusLabel: string
    carrier: string | null
    trackingCode: string | null
    updatedAt: string | null
  } | null
  customerNote: string
  rmaCode: string | null
  decisionNote: string | null
  /** 22/10/2026 — số tiền hoàn khi yêu cầu hoàn tất (null = chưa hoàn tất). */
  refundAmount?: number | null
  refundedAt?: string | null
  createdAt: string
  updatedAt: string
}

/** Biến thể có thể đổi sang cho 1 sản phẩm trong đơn (cùng sản phẩm, đang bán). */
export type ExchangeOption = {
  sku: string
  options: { sku: string; variantName: string; color: string | null; size: string | null; available: number }[]
}

export type StorefrontReturnDetail = StorefrontReturn & {
  events: { label: string; reason: string | null; occurredAt: string; source: 'partner' | 'customer' | 'system'; trackingCode?: string | null }[]
}
