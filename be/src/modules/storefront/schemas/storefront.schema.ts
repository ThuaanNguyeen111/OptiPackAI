import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'storefront_categories', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCategory {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, trim: true, lowercase: true }) slug!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontCategory', default: null }) parent_id!: Types.ObjectId | null;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) image_url!: string;
  @Prop({ default: 0 }) sort_order!: number;
  @Prop({ default: true }) is_active!: boolean;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontCategoryDocument = HydratedDocument<StorefrontCategory>;
export const StorefrontCategorySchema = SchemaFactory.createForClass(StorefrontCategory);

@Schema({ _id: false })
export class StorefrontSizeChartRow {
  @Prop({ required: true, trim: true }) size!: string;
  @Prop({ type: Number, default: null, min: 0 }) bust_cm!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) waist_cm!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) hip_cm!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) length_cm!: number | null;
}
export const StorefrontSizeChartRowSchema = SchemaFactory.createForClass(StorefrontSizeChartRow);

@Schema({ collection: 'storefront_products', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontProduct {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, trim: true, lowercase: true }) slug!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontCategory', default: null }) category_id!: Types.ObjectId | null;
  @Prop({ default: '' }) brand!: string;
  @Prop({ required: true }) thumbnail_url!: string;
  @Prop({ type: [String], default: [] }) gallery_images!: string[];
  @Prop({ type: [StorefrontSizeChartRowSchema], default: [] }) size_chart!: StorefrontSizeChartRow[];
  @Prop({ type: String, enum: ['apparel', 'shoes'], default: 'apparel' }) size_chart_type!: 'apparel' | 'shoes';
  @Prop({ type: String, default: '' }) size_guide_note!: string;
  @Prop({ type: String, enum: ['draft', 'active', 'hidden'], default: 'draft' }) status!: 'draft' | 'active' | 'hidden';
  @Prop({ default: false }) is_featured!: boolean;
  @Prop({ default: 0 }) view_count!: number;
  @Prop({ default: 0 }) sold_count!: number;
  @Prop({ type: Date, default: null }) deleted_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontProductDocument = HydratedDocument<StorefrontProduct>;
export const StorefrontProductSchema = SchemaFactory.createForClass(StorefrontProduct);
StorefrontProductSchema.index({ status: 1, is_featured: 1, created_at: -1 });

@Schema({ collection: 'storefront_images', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class StorefrontImage {
  @Prop({ type: Buffer, required: true }) data!: Buffer;
  @Prop({ required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] }) content_type!: string;
}
export type StorefrontImageDocument = HydratedDocument<StorefrontImage>;
export const StorefrontImageSchema = SchemaFactory.createForClass(StorefrontImage);

@Schema({ collection: 'storefront_product_variants', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontProductVariant {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontProduct', required: true, index: true }) product_id!: Types.ObjectId;
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) sku!: string;
  @Prop({ default: '' }) barcode!: string;
  @Prop({ required: true, trim: true }) variant_name!: string;
  @Prop({ type: String, default: null }) color!: string | null;
  @Prop({ type: String, default: null }) size!: string | null;
  @Prop({ type: String, default: null }) image_url!: string | null;
  @Prop({ required: true, min: 0 }) price!: number;
  @Prop({ type: Number, default: null, min: 0 }) compare_at_price!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) cost_price!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) weight_kg!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) length_cm!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) width_cm!: number | null;
  @Prop({ type: Number, default: null, min: 0 }) height_cm!: number | null;
  @Prop({ default: false }) is_default!: boolean;
  @Prop({ default: true }) is_active!: boolean;
  /**
   * (21/10/2026, phương án A) 'optipack' = tồn do kho OptiPack đẩy sang qua
   * Open API `/product/stock/sellable/update` → Admin website chỉ xem, không sửa.
   * Biến thể cũ không có field = 'storefront' (Admin tự quản).
   */
  @Prop({ type: String, enum: ['storefront', 'optipack'], default: 'storefront' }) stock_source?: 'storefront' | 'optipack';
  @Prop({ type: Date, default: null }) stock_synced_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontProductVariantDocument = HydratedDocument<StorefrontProductVariant>;
export const StorefrontProductVariantSchema = SchemaFactory.createForClass(StorefrontProductVariant);

@Schema({ collection: 'storefront_inventory_stocks', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontInventoryStock {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontProductVariant', required: true }) variant_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Warehouse', default: null }) warehouse_id!: Types.ObjectId | null;
  @Prop({ required: true, min: 0, default: 0 }) quantity_on_hand!: number;
  @Prop({ required: true, min: 0, default: 0 }) reserved_quantity!: number;
  @Prop({ required: true, min: 0, default: 0 }) reorder_level!: number;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontInventoryStockDocument = HydratedDocument<StorefrontInventoryStock>;
export const StorefrontInventoryStockSchema = SchemaFactory.createForClass(StorefrontInventoryStock);
StorefrontInventoryStockSchema.index({ variant_id: 1, warehouse_id: 1 }, { unique: true });

@Schema({ collection: 'customers', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Customer {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email!: string;
  @Prop({ required: true }) password_hash!: string;
  @Prop({ default: '' }) phone!: string;
  @Prop({ default: '' }) avatar!: string;
  @Prop({ type: String, enum: ['local', 'google'], default: 'local' }) login_type!: 'local' | 'google';
  @Prop({ default: false }) email_verified!: boolean;
  @Prop({ default: true }) is_active!: boolean;
  @Prop({ type: Date, default: null }) last_login_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);

@Schema({ _id: false })
export class CustomerAddressSnapshot {
  @Prop({ required: true }) recipient_name!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) province!: string;
  // Địa chỉ theo hệ thống mới không còn cấp quận/huyện.
  @Prop({ default: undefined }) district?: string;
  @Prop({ required: true }) ward!: string;
  @Prop({ required: true }) address_line!: string;
}
export const CustomerAddressSnapshotSchema = SchemaFactory.createForClass(CustomerAddressSnapshot);

@Schema({ collection: 'customer_addresses', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class CustomerAddress extends CustomerAddressSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true }) customer_id!: Types.ObjectId;
  @Prop({ default: '' }) note!: string;
  @Prop({ default: false }) is_default!: boolean;
}
export type CustomerAddressDocument = HydratedDocument<CustomerAddress>;
export const CustomerAddressSchema = SchemaFactory.createForClass(CustomerAddress);

@Schema({ collection: 'storefront_carts', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCart {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, unique: true }) customer_id!: Types.ObjectId;
  @Prop({ type: String, enum: ['active', 'converted', 'abandoned'], default: 'active' }) status!: 'active' | 'converted' | 'abandoned';
  @Prop({ type: Date, default: null }) expires_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontCartDocument = HydratedDocument<StorefrontCart>;
export const StorefrontCartSchema = SchemaFactory.createForClass(StorefrontCart);

@Schema({ collection: 'storefront_cart_items', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCartItem {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontCart', required: true, index: true }) cart_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontProduct', required: true }) product_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontProductVariant', required: true }) variant_id!: Types.ObjectId;
  @Prop({ required: true }) sku!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontCartItemDocument = HydratedDocument<StorefrontCartItem>;
export const StorefrontCartItemSchema = SchemaFactory.createForClass(StorefrontCartItem);
StorefrontCartItemSchema.index({ cart_id: 1, variant_id: 1 }, { unique: true });

@Schema({ collection: 'storefront_orders', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontOrder {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', default: null }) customer_id!: Types.ObjectId | null;
  @Prop({ type: String }) client_order_id?: string;
  @Prop({ required: true, unique: true }) order_number!: string;
  // Mã số công khai kiểu Lazada (order_id dạng số) mà Open API AURELLE trả cho
  // ứng dụng đối tác (OptiPack). Cấp lúc đặt hàng từ bộ đếm storefront_counters.
  // Đơn cũ (trước 04/10/2026) không có — mock Open API cấp bù khi cần.
  @Prop({ type: Number, default: null }) public_order_id!: number | null;
  @Prop({ type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' }) status!: string;
  @Prop({ type: String, enum: ['unpaid', 'paid', 'failed', 'refunded'], default: 'unpaid' }) payment_status!: string;
  @Prop({ type: String, enum: ['awaiting_packaging', 'packed', 'shipped', 'delivered', 'failed_delivery', 'shipped_back', 'returned'], default: 'awaiting_packaging' }) fulfillment_status!: string;
  // 20/10/2026 — thời điểm sự kiện giao hàng mới nhất đối tác báo (chống sự kiện cũ kéo trạng thái lùi).
  @Prop({ type: Date, default: null }) fulfillment_updated_at!: Date | null;
  /** (21/10/2026) Giữ chỗ tồn của đơn — xem storefront-stock.util.ts. Đơn cũ không có field = reserved. */
  @Prop({ type: String, enum: ['reserved', 'deducted', 'released'], default: 'reserved' }) stock_state?: 'reserved' | 'deducted' | 'released';
  @Prop({ required: true, min: 0 }) subtotal!: number;
  @Prop({ required: true, min: 0, default: 0 }) discount_amount!: number;
  @Prop({ required: true, min: 0, default: 0 }) shipping_fee!: number;
  @Prop({ required: true, min: 0 }) total_amount!: number;
  @Prop({ required: true, default: 'VND' }) currency!: string;
  @Prop({ type: CustomerAddressSnapshotSchema, required: true }) shipping_address_snapshot!: CustomerAddressSnapshot;
  @Prop({ default: '' }) customer_note!: string;
  @Prop({ type: Date, default: null }) placed_at!: Date | null;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Order', default: null }) canonical_order_id!: Types.ObjectId | null;
  @Prop({ type: String, enum: ['pending', 'synced', 'failed'], default: 'pending', index: true }) canonical_sync_status!: 'pending' | 'synced' | 'failed';
  @Prop({ type: String, default: null }) canonical_sync_error!: string | null;
  @Prop({ type: Date, default: null }) canonical_synced_at!: Date | null;
  @Prop({ type: Date, default: null }) canonical_financials_synced_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontOrderDocument = HydratedDocument<StorefrontOrder>;
export const StorefrontOrderSchema = SchemaFactory.createForClass(StorefrontOrder);
StorefrontOrderSchema.index({ customer_id: 1, created_at: -1 });
StorefrontOrderSchema.index({ customer_id: 1, client_order_id: 1 }, { unique: true, sparse: true });
StorefrontOrderSchema.index({ canonical_sync_status: 1, created_at: 1 });
StorefrontOrderSchema.index(
  { public_order_id: 1 },
  { unique: true, partialFilterExpression: { public_order_id: { $type: 'number' } } },
);
// Phục vụ Open API GetOrders (update_after) — mock aurelle-mock-server.ts
StorefrontOrderSchema.index({ updated_at: 1 });

/** Bộ đếm tăng dần (atomic $inc) — hiện chỉ dùng cấp public_order_id. */
@Schema({ collection: 'storefront_counters', versionKey: false })
export class StorefrontCounter {
  @Prop({ type: String, required: true }) _id!: string;
  @Prop({ type: Number, required: true, default: 0 }) seq!: number;
}
export type StorefrontCounterDocument = HydratedDocument<StorefrontCounter>;
export const StorefrontCounterSchema = SchemaFactory.createForClass(StorefrontCounter);

@Schema({ _id: false })
export class StorefrontOrderItemSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) product_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) variant_id!: Types.ObjectId;
  @Prop({ required: true }) sku_snapshot!: string;
  @Prop({ required: true }) product_name_snapshot!: string;
  @Prop({ required: true }) variant_snapshot!: string;
  @Prop({ default: '' }) image_snapshot!: string;
  @Prop({ required: true, min: 0 }) unit_price!: number;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ required: true, min: 0, default: 0 }) discount_amount!: number;
  @Prop({ required: true, min: 0 }) line_total!: number;
}
export const StorefrontOrderItemSnapshotSchema = SchemaFactory.createForClass(StorefrontOrderItemSnapshot);

@Schema({ collection: 'storefront_order_items', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class StorefrontOrderItem extends StorefrontOrderItemSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontOrder', required: true, index: true }) order_id!: Types.ObjectId;
}
export type StorefrontOrderItemDocument = HydratedDocument<StorefrontOrderItem>;
export const StorefrontOrderItemSchema = SchemaFactory.createForClass(StorefrontOrderItem);

@Schema({ collection: 'storefront_payments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontPayment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontOrder', required: true, index: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, enum: ['cod'], required: true }) payment_method!: 'cod';
  @Prop({ default: 'manual' }) provider!: string;
  @Prop({ type: String, default: null }) transaction_id!: string | null;
  @Prop({ required: true, min: 0 }) amount!: number;
  @Prop({ type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' }) status!: string;
  @Prop({ type: Date, default: null }) paid_at!: Date | null;
  @Prop({ default: '' }) failure_reason!: string;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontPaymentDocument = HydratedDocument<StorefrontPayment>;
export const StorefrontPaymentSchema = SchemaFactory.createForClass(StorefrontPayment);

@Schema({ collection: 'storefront_shipments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontShipment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontOrder', required: true, unique: true }) order_id!: Types.ObjectId;
  @Prop({ default: '' }) carrier!: string;
  @Prop({ default: '' }) tracking_number!: string;
  @Prop({ type: String, default: null }) trip_code!: string | null; // 20/10/2026 — mã chuyến giao chung
  @Prop({ type: String, enum: ['pending', 'picked_up', 'in_transit', 'delivered', 'returned'], default: 'pending' }) status!: string;
  @Prop({ type: CustomerAddressSnapshotSchema, required: true }) recipient_snapshot!: CustomerAddressSnapshot;
  @Prop({ type: Date, default: null }) shipped_at!: Date | null;
  @Prop({ type: Date, default: null }) delivered_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontShipmentDocument = HydratedDocument<StorefrontShipment>;
export const StorefrontShipmentSchema = SchemaFactory.createForClass(StorefrontShipment);

/**
 * 20/10/2026 — Hành trình đơn cho khách (đóng gói → giao → hoàn...). APPEND-ONLY.
 * Ghi khi đối tác (OptiPack) gọi `/order/status/update` hoặc khi khách tự hủy/trả hàng.
 */
@Schema({ collection: 'storefront_order_events', timestamps: false })
export class StorefrontOrderEvent {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontOrder', required: true }) order_id!: Types.ObjectId;
  @Prop({ type: Number, default: null }) public_order_id!: number | null;
  @Prop({ type: String, required: true }) status!: string;
  @Prop({ type: String, required: true }) label!: string;
  @Prop({ type: String, default: null }) tracking_code!: string | null;
  @Prop({ type: String, default: null }) trip_code!: string | null;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: Date, required: true }) occurred_at!: Date;
  @Prop({ type: String, enum: ['partner', 'customer', 'system'], default: 'partner' }) source!: string;
  @Prop({ type: String, default: null }) idempotency_key!: string | null;
  @Prop({ type: Date, default: () => new Date() }) created_at!: Date;
}
export type StorefrontOrderEventDocument = HydratedDocument<StorefrontOrderEvent>;
export const StorefrontOrderEventSchema = SchemaFactory.createForClass(StorefrontOrderEvent);
// Phục vụ: hành trình đơn của khách (GET /storefront/orders/:id) — sắp theo thời điểm xảy ra.
StorefrontOrderEventSchema.index({ order_id: 1, occurred_at: 1 });
// Chống ghi trùng khi đối tác gửi lại cùng sự kiện. PARTIAL (không phải sparse): sự kiện do khách
// tự tạo lưu `idempotency_key: null` và sparse vẫn lập chỉ mục null → đụng unique ở sự kiện thứ 2.
StorefrontOrderEventSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } },
);

@Schema({ _id: false })
export class StorefrontReturnItem {
  @Prop({ required: true }) sku!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ required: true }) reason_code!: string;
}
export const StorefrontReturnItemSchema = SchemaFactory.createForClass(StorefrontReturnItem);

/** 21/10/2026 — Đổi hàng: biến thể khách muốn đổi SANG (cùng sản phẩm, khác size/màu). */
@Schema({ _id: false })
export class StorefrontExchangeItem {
  @Prop({ required: true }) sku!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
}
export const StorefrontExchangeItemSchema = SchemaFactory.createForClass(StorefrontExchangeItem);

/**
 * 20/10/2026 — Yêu cầu trả hàng do KHÁCH gửi trên website. OptiPack kéo qua Open API
 * (`/reverse/orders/get`) rồi tạo phiếu RMA phía kho; kết quả báo ngược qua
 * `/reverse/order/update`. Website không tự quyết duyệt/từ chối.
 */
export const OPEN_RETURN_STATUS_VALUES = ['requested', 'approved', 'received'] as const;

@Schema({ collection: 'storefront_return_requests', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontReturnRequest {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true }) customer_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StorefrontOrder', required: true }) order_id!: Types.ObjectId;
  @Prop({ type: Number, default: null }) public_order_id!: number | null;
  @Prop({ type: String, enum: ['return_refund', 'refund_only', 'exchange'], required: true }) type!: 'return_refund' | 'refund_only' | 'exchange';
  @Prop({ type: String, enum: ['requested', 'approved', 'rejected', 'received', 'closed', 'canceled'], default: 'requested' }) status!: string;
  @Prop({ type: [StorefrontReturnItemSchema], default: [] }) items!: StorefrontReturnItem[];
  @Prop({ type: [StorefrontExchangeItemSchema], default: [] }) exchange_items!: StorefrontExchangeItem[]; // 21/10/2026
  @Prop({ type: String, default: '' }) customer_note!: string;
  @Prop({ type: String, default: null }) rma_code!: string | null;
  @Prop({ type: String, default: null }) decision_note!: string | null;
  @Prop({ type: Date, default: null }) status_updated_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontReturnRequestDocument = HydratedDocument<StorefrontReturnRequest>;
export const StorefrontReturnRequestSchema = SchemaFactory.createForClass(StorefrontReturnRequest);
// Phục vụ: danh sách yêu cầu của khách.
StorefrontReturnRequestSchema.index({ customer_id: 1, created_at: -1 });
// Phục vụ: Open API kéo theo thời gian cập nhật / theo trạng thái 'requested'.
StorefrontReturnRequestSchema.index({ updated_at: 1 });
StorefrontReturnRequestSchema.index({ status: 1, created_at: 1 });
// Mỗi đơn chỉ có 1 yêu cầu đang xử lý — chặn ở tầng DB để 2 lần bấm cùng lúc không tạo 2 phiếu.
StorefrontReturnRequestSchema.index(
  { order_id: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [...OPEN_RETURN_STATUS_VALUES] } } },
);
