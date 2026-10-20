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

export type AdminProduct = Omit<Product, 'variants'> & {
  variants: (ProductVariant & { quantityOnHand: number; reservedQuantity: number })[]
}

export type SaveAdminProduct = Pick<Product, 'name' | 'description' | 'thumbnailUrl' | 'galleryImages' | 'status' | 'isFeatured'> & {
  categoryId: string | null
  variants: { id?: string; color: string; size: string; price: number; quantityOnHand: number }[]
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
}

export type StorefrontOrderEvent = {
  status: string
  label: string
  reason: string | null
  occurredAt: string
  source: 'partner' | 'customer' | 'system'
}

export type StorefrontOrderDetail = StorefrontOrder & {
  trackingCode?: string | null
  tripCode?: string | null
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

export type StorefrontReturnType = 'return_refund' | 'refund_only'

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
  customerNote: string
  rmaCode: string | null
  decisionNote: string | null
  createdAt: string
  updatedAt: string
}

export type StorefrontReturnDetail = StorefrontReturn & {
  events: { label: string; reason: string | null; occurredAt: string; source: 'partner' | 'customer' | 'system' }[]
}
