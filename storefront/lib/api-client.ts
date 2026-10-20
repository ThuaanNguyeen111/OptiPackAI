import type { AdminProduct, Category, Customer, Product, SaveAdminProduct, StorefrontOrder, StorefrontOrderDetail } from '@/types/storefront'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init?.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string | string[] } | null
    throw new ApiError(Array.isArray(error?.message) ? error.message.join('; ') : error?.message ?? 'Yêu cầu không thành công', response.status)
  }
  return response.json() as Promise<T>
}

export async function getProducts(): Promise<Product[]> {
  return request<Product[]>('/storefront/products')
}

export async function getProduct(slug: string): Promise<Product | null> {
  try { return await request<Product>(`/storefront/products/${encodeURIComponent(slug)}`) }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
}

export function getCategories() { return request<Category[]>('/storefront/categories') }
export function loginAdmin(input: { email: string; password: string }) {
  return request<{ email: string }>('/storefront/admin/auth/login', { method: 'POST', body: JSON.stringify(input) })
}
export function getCurrentAdmin() { return request<{ email: string }>('/storefront/admin/auth/me') }
export function logoutAdmin() { return request<{ message: string }>('/storefront/admin/auth/logout', { method: 'POST' }) }
export function getAdminProducts() { return request<AdminProduct[]>('/storefront/admin/products') }
export function getAdminProduct(id: string) { return request<AdminProduct>(`/storefront/admin/products/${encodeURIComponent(id)}`) }
export function saveAdminProduct(input: SaveAdminProduct, id?: string) {
  return request<AdminProduct>(`/storefront/admin/products${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method: id ? 'PATCH' : 'POST', body: JSON.stringify(input),
  })
}
export function deleteAdminProduct(id: string) {
  return request<{ message: string }>(`/storefront/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export async function uploadAdminImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  const result = await request<{ url: string }>('/storefront/admin/images', { method: 'POST', body: form })
  return `${API_URL.replace(/\/$/, '')}${result.url}`
}

export async function registerCustomer(input: { name: string; email: string; password: string; phone?: string }) {
  return request<{ customer: Customer }>('/customer-auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export async function loginCustomer(input: { email: string; password: string }) {
  return request<{ customer: Customer }>('/customer-auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export async function getCurrentCustomer() {
  return request<{ customer: Customer }>('/customer-auth/me')
}

export async function logoutCustomer() {
  return request<{ message: string }>('/customer-auth/logout', { method: 'POST' })
}

export async function checkout(input: { items: { variant_id: string; quantity: number }[]; shippingAddress: Record<string, string>; paymentMethod: 'cod'; customerNote?: string; clientOrderId?: string }) {
  return request<StorefrontOrder>('/storefront/orders/checkout', { method: 'POST', body: JSON.stringify({ items: input.items, shipping_address: input.shippingAddress, payment_method: input.paymentMethod, customer_note: input.customerNote, client_order_id: input.clientOrderId }) })
}

export async function getOrders() {
  return request<StorefrontOrder[]>('/storefront/orders')
}

export async function getOrder(id: string) {
  return request<StorefrontOrderDetail>(`/storefront/orders/${encodeURIComponent(id)}`)
}

export async function cancelOrder(id: string, reason?: string) {
  return request<StorefrontOrder>(`/storefront/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason?.trim() || undefined }) })
}

export async function getCart() {
  return request<{ items: import('@/types/storefront').CartItem[] }>('/storefront/cart')
}

export async function syncCart(items: { variant_id: string; quantity: number }[]) {
  return request<{ items: import('@/types/storefront').CartItem[] }>('/storefront/cart/sync', { method: 'POST', body: JSON.stringify({ items }) })
}

export async function addCartItem(variant_id: string, quantity: number) {
  return request<{ items: import('@/types/storefront').CartItem[] }>('/storefront/cart/items', { method: 'POST', body: JSON.stringify({ variant_id, quantity }) })
}

export async function updateCartItem(variant_id: string, quantity: number) {
  return request<{ items: import('@/types/storefront').CartItem[] }>(`/storefront/cart/items/${encodeURIComponent(variant_id)}`, { method: 'PATCH', body: JSON.stringify({ variant_id, quantity }) })
}

export async function removeCartItem(variant_id: string) {
  return request<{ items: import('@/types/storefront').CartItem[] }>(`/storefront/cart/items/${encodeURIComponent(variant_id)}`, { method: 'DELETE' })
}

export async function clearCart() {
  return request<{ items: import('@/types/storefront').CartItem[] }>('/storefront/cart', { method: 'DELETE' })
}
