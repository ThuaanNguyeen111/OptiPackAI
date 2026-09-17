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
  canonicalOrderId: string | null
  canonicalSyncStatus: 'pending' | 'synced' | 'failed'
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

export type StorefrontOrderDetail = StorefrontOrder & {
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
