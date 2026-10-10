import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '@/components/cart/cart-provider'
import { siteConfig } from '@/lib/site-config'

export const metadata: Metadata = { title: siteConfig.title, description: siteConfig.description }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><CartProvider>{children}</CartProvider></body></html>
}
