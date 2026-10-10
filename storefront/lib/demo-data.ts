import type { Product } from '@/types/storefront'

const image = (name: string) => `/kaira-assets/images/${name}`

export const demoProducts: Product[] = [
  {
    id: 'demo-1', slug: 'minimal-cotton-shirt', name: 'Minimal Cotton Shirt',
    description: 'Áo sơ mi cotton mềm nhẹ, phom dáng tối giản cho ngày thường.',
    categoryId: 'tops', categoryName: 'Tops', thumbnailUrl: image('product-item-1.jpg'),
    galleryImages: [image('product-item-1.jpg'), image('single-image-2.jpg'), image('product-item-5.jpg'), image('banner-image-2.jpg')],
    sizeChart: [
      { size: 'S', bust_cm: 96, waist_cm: 92, hip_cm: 98, length_cm: 70 },
      { size: 'M', bust_cm: 100, waist_cm: 96, hip_cm: 102, length_cm: 72 },
      { size: 'L', bust_cm: 104, waist_cm: 100, hip_cm: 106, length_cm: 74 },
    ],
    sizeGuideNote: 'Đo vòng ngực, eo và hông tại vị trí lớn nhất. Sai số 1–2 cm do đặc tính vải.',
    status: 'active', isFeatured: true,
    variants: [
      { id: 'demo-1-black-m', productId: 'demo-1', sku: 'MCS-BLK-M', variantName: 'Black / M', color: 'Black', size: 'M', price: 690000, compareAtPrice: 790000, availableQuantity: 12, isDefault: true },
      { id: 'demo-1-white-l', productId: 'demo-1', sku: 'MCS-WHT-L', variantName: 'White / L', color: 'White', size: 'L', price: 690000, compareAtPrice: 790000, availableQuantity: 8, isDefault: false },
    ],
  },
  {
    id: 'demo-2', slug: 'linen-midi-dress', name: 'Linen Midi Dress',
    description: 'Đầm linen thanh lịch, chất liệu thoáng mát và dễ phối đồ.',
    categoryId: 'dresses', categoryName: 'Dresses', thumbnailUrl: image('product-item-2.jpg'),
    galleryImages: [image('product-item-2.jpg'), image('product-item-3.jpg'), image('product-item-6.jpg'), image('banner-image-3.jpg')],
    sizeChart: [
      { size: 'S', bust_cm: 84, waist_cm: 68, hip_cm: 92, length_cm: 118 },
      { size: 'M', bust_cm: 88, waist_cm: 72, hip_cm: 96, length_cm: 119 },
      { size: 'L', bust_cm: 92, waist_cm: 76, hip_cm: 100, length_cm: 120 },
    ],
    sizeGuideNote: 'Phom váy midi hơi ôm. Nếu bạn nằm giữa hai size, nên chọn size lớn hơn.',
    status: 'active', isFeatured: true,
    variants: [{ id: 'demo-2-natural-s', productId: 'demo-2', sku: 'LMD-NAT-S', variantName: 'Natural / S', color: 'Natural', size: 'S', price: 890000, compareAtPrice: null, availableQuantity: 5, isDefault: true }],
  },
  {
    id: 'demo-3', slug: 'everyday-leather-bag', name: 'Everyday Leather Bag',
    description: 'Túi da gọn nhẹ cho công việc và những chuyến đi cuối tuần.',
    categoryId: 'bags', categoryName: 'Bags', thumbnailUrl: image('product-item-3.jpg'),
    galleryImages: [image('product-item-3.jpg'), image('product-item-4.jpg'), image('product-item-7.jpg'), image('banner-image-4.jpg')],
    sizeChart: [],
    sizeGuideNote: 'Kích thước: 28 × 22 × 10 cm. Quai đeo điều chỉnh được.',
    status: 'active', isFeatured: false,
    variants: [{ id: 'demo-3-tan-one', productId: 'demo-3', sku: 'ELB-TAN-ONE', variantName: 'Tan / One size', color: 'Tan', price: 1290000, compareAtPrice: null, availableQuantity: 3, isDefault: true }],
  },
  {
    id: 'demo-4', slug: 'silk-signature-scarf', name: 'Silk Signature Scarf',
    description: 'Khăn lụa mềm nhẹ, điểm nhấn thanh lịch cho mọi outfit.',
    categoryId: 'accessories', categoryName: 'Accessories', thumbnailUrl: image('product-item-8.jpg'),
    galleryImages: [image('product-item-8.jpg'), image('banner-image-5.jpg'), image('cat-sm-item.jpg'), image('single-image-2.jpg')],
    sizeChart: [], sizeGuideNote: 'Kích thước: 70 × 70 cm. Chất liệu lụa mềm, phù hợp nhiều cách thắt.',
    status: 'active', isFeatured: false,
    variants: [{ id: 'demo-4-cream-one', productId: 'demo-4', sku: 'SSS-CRM-ONE', variantName: 'Cream / One size', color: 'Cream', price: 390000, compareAtPrice: 450000, availableQuantity: 10, isDefault: true }],
  },
  {
    id: 'demo-5', slug: 'pearl-drop-earrings', name: 'Pearl Drop Earrings',
    description: 'Đôi bông tai ngọc trai tối giản, tạo điểm sáng tinh tế.',
    categoryId: 'jewelry', categoryName: 'Jewelry', thumbnailUrl: image('product-item-9.jpg'),
    galleryImages: [image('product-item-9.jpg'), image('banner-image-6.jpg'), image('cat-sm-item2.jpg'), image('product-item-10.jpg')],
    sizeChart: [], sizeGuideNote: 'Chiều dài 3.2 cm. Bảo quản trong túi vải, tránh tiếp xúc với nước hoa.',
    status: 'active', isFeatured: false,
    variants: [{ id: 'demo-5-gold-one', productId: 'demo-5', sku: 'PDE-GLD-ONE', variantName: 'Gold / One size', color: 'Gold', price: 450000, compareAtPrice: null, availableQuantity: 7, isDefault: true }],
  },
  {
    id: 'demo-6', slug: 'soft-leather-loafers', name: 'Soft Leather Loafers',
    description: 'Loafer da mềm với phom thanh lịch, đồng hành từ văn phòng đến cuối tuần.',
    categoryId: 'shoes', categoryName: 'Shoes', thumbnailUrl: image('product-item-10.jpg'),
    galleryImages: [image('product-item-10.jpg'), image('product-item-4.jpg'), image('banner-image-2.jpg'), image('cat-large-item3.jpg')],
    sizeChart: [
      { size: '36', length_cm: 23 }, { size: '37', length_cm: 24 },
      { size: '38', length_cm: 25 }, { size: '39', length_cm: 26 },
    ],
    sizeChartType: 'shoes', sizeGuideNote: 'Chiều dài bàn chân tham khảo theo cm. Nếu ở giữa hai size, nên chọn size lớn hơn.',
    status: 'active', isFeatured: false,
    variants: [
      { id: 'demo-6-brown-37', productId: 'demo-6', sku: 'SLL-BRN-37', variantName: 'Brown / 37', color: 'Brown', size: '37', price: 1190000, compareAtPrice: 1390000, availableQuantity: 4, isDefault: true },
      { id: 'demo-6-brown-38', productId: 'demo-6', sku: 'SLL-BRN-38', variantName: 'Brown / 38', color: 'Brown', size: '38', price: 1190000, compareAtPrice: 1390000, availableQuantity: 5, isDefault: false },
      { id: 'demo-6-brown-39', productId: 'demo-6', sku: 'SLL-BRN-39', variantName: 'Brown / 39', color: 'Brown', size: '39', price: 1190000, compareAtPrice: 1390000, availableQuantity: 3, isDefault: false },
    ],
  },
]
