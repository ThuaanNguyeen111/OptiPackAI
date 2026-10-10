import type { Customer, Product, StorefrontOrder } from '@/types/storefront'
import { demoProducts } from './demo-data'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Yêu cầu không thành công')
  return response.json() as Promise<T>
}

export async function getProducts(): Promise<Product[]> {
  try { return await request<Product[]>('/storefront/products') } catch { return demoProducts }
}

export async function getProduct(slug: string): Promise<Product | null> {
  try { return await request<Product>(`/storefront/products/${encodeURIComponent(slug)}`) } catch { return demoProducts.find((product) => product.slug === slug) ?? null }
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
