'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CartItem, Product, ProductVariant } from '@/types/storefront'
import { addCartItem, clearCart as clearRemoteCart, getCart, removeCartItem, syncCart, updateCartItem } from '@/lib/api-client'

type CartContextValue = {
  items: CartItem[]
  count: number
  total: number
  add: (product: Product, variant: ProductVariant, quantity?: number) => void
  update: (variantId: string, quantity: number) => void
  remove: (variantId: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function isCustomerLoggedIn() {
  return Boolean(window.localStorage.getItem('kaira-customer'))
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const itemsRef = useRef(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('kaira-cart')
      if (stored) setItems(JSON.parse(stored) as CartItem[])
    } catch {
      window.localStorage.removeItem('kaira-cart')
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (hydrated) window.localStorage.setItem('kaira-cart', JSON.stringify(items))
  }, [hydrated, items])

  const syncRemote = useCallback(async () => {
    if (!isCustomerLoggedIn()) return

    const localItems = itemsRef.current
    const remote = await getCart()

    if (remote.items.length > 0) {
      setItems(remote.items)
      return
    }

    if (localItems.length > 0) {
      const synced = await syncCart(
        localItems.map((item) => ({ variant_id: item.variant.id, quantity: item.quantity })),
      )
      setItems(synced.items)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return

    void syncRemote().catch(() => undefined)
    const handler = () => void syncRemote().catch(() => undefined)
    window.addEventListener('kaira-auth-changed', handler)

    return () => window.removeEventListener('kaira-auth-changed', handler)
  }, [hydrated, syncRemote])

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.quantity * item.variant.price, 0),
    add: (product, variant, quantity = 1) => {
      setItems((current) => {
        const found = current.find((item) => item.variant.id === variant.id)
        const nextQuantity = found
          ? Math.min(found.quantity + quantity, variant.availableQuantity)
          : Math.min(quantity, variant.availableQuantity)

        if (found) {
          return current.map((item) => item.variant.id === variant.id
            ? { ...item, quantity: nextQuantity }
            : item)
        }

        return nextQuantity > 0
          ? [...current, { product, variant, quantity: nextQuantity }]
          : current
      })

      if (isCustomerLoggedIn()) {
        void addCartItem(variant.id, quantity)
          .then((remote) => setItems(remote.items))
          .catch(() => undefined)
      }
    },
    update: (variantId, quantity) => {
      setItems((current) => current.map((item) => item.variant.id === variantId
        ? { ...item, quantity: Math.max(1, Math.min(quantity, item.variant.availableQuantity)) }
        : item))

      if (isCustomerLoggedIn()) {
        void updateCartItem(variantId, quantity)
          .then((remote) => setItems(remote.items))
          .catch(() => undefined)
      }
    },
    remove: (variantId) => {
      setItems((current) => current.filter((item) => item.variant.id !== variantId))

      if (isCustomerLoggedIn()) {
        void removeCartItem(variantId)
          .then((remote) => setItems(remote.items))
          .catch(() => undefined)
      }
    },
    clear: () => {
      setItems([])

      if (isCustomerLoggedIn()) {
        void clearRemoteCart()
          .then((remote) => setItems(remote.items))
          .catch(() => undefined)
      }
    },
  }), [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be inside CartProvider')
  return context
}
