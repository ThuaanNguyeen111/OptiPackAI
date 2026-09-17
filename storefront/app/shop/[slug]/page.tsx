import Image from 'next/image'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ProductDetail } from '@/components/product/product-detail'
import { getProduct } from '@/lib/api-client'

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug)
  if (!product) notFound()
  return <><Header cartCount={0} /><main className="page-shell"><ProductDetail product={product} /></main><Footer /></>
}
