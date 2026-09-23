import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'storefront_categories', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCategory {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, trim: true, lowercase: true }) slug!: string;
  @Prop({ type: Types.ObjectId, ref: 'StorefrontCategory', default: null }) parent_id!: Types.ObjectId | null;
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
  @Prop({ type: Types.ObjectId, ref: 'StorefrontCategory', default: null }) category_id!: Types.ObjectId | null;
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
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontProductDocument = HydratedDocument<StorefrontProduct>;
export const StorefrontProductSchema = SchemaFactory.createForClass(StorefrontProduct);
StorefrontProductSchema.index({ status: 1, is_featured: 1, created_at: -1 });

@Schema({ collection: 'storefront_product_variants', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontProductVariant {
  @Prop({ type: Types.ObjectId, ref: 'StorefrontProduct', required: true, index: true }) product_id!: Types.ObjectId;
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
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontProductVariantDocument = HydratedDocument<StorefrontProductVariant>;
export const StorefrontProductVariantSchema = SchemaFactory.createForClass(StorefrontProductVariant);

@Schema({ collection: 'storefront_inventory_stocks', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontInventoryStock {
  @Prop({ type: Types.ObjectId, ref: 'StorefrontProductVariant', required: true }) variant_id!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Warehouse', default: null }) warehouse_id!: Types.ObjectId | null;
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
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customer_id!: Types.ObjectId;
  @Prop({ default: '' }) note!: string;
  @Prop({ default: false }) is_default!: boolean;
}
export type CustomerAddressDocument = HydratedDocument<CustomerAddress>;
export const CustomerAddressSchema = SchemaFactory.createForClass(CustomerAddress);

@Schema({ collection: 'storefront_carts', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCart {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, unique: true }) customer_id!: Types.ObjectId;
  @Prop({ type: String, enum: ['active', 'converted', 'abandoned'], default: 'active' }) status!: 'active' | 'converted' | 'abandoned';
  @Prop({ type: Date, default: null }) expires_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontCartDocument = HydratedDocument<StorefrontCart>;
export const StorefrontCartSchema = SchemaFactory.createForClass(StorefrontCart);

@Schema({ collection: 'storefront_cart_items', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontCartItem {
  @Prop({ type: Types.ObjectId, ref: 'StorefrontCart', required: true, index: true }) cart_id!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StorefrontProduct', required: true }) product_id!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'StorefrontProductVariant', required: true }) variant_id!: Types.ObjectId;
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
  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null }) customer_id!: Types.ObjectId | null;
  @Prop({ type: String }) client_order_id?: string;
  @Prop({ required: true, unique: true }) order_number!: string;
  @Prop({ type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' }) status!: string;
  @Prop({ type: String, enum: ['unpaid', 'paid', 'failed', 'refunded'], default: 'unpaid' }) payment_status!: string;
  @Prop({ type: String, enum: ['awaiting_packaging', 'packed', 'shipped', 'delivered', 'returned'], default: 'awaiting_packaging' }) fulfillment_status!: string;
  @Prop({ required: true, min: 0 }) subtotal!: number;
  @Prop({ required: true, min: 0, default: 0 }) discount_amount!: number;
  @Prop({ required: true, min: 0, default: 0 }) shipping_fee!: number;
  @Prop({ required: true, min: 0 }) total_amount!: number;
  @Prop({ required: true, default: 'VND' }) currency!: string;
  @Prop({ type: CustomerAddressSnapshotSchema, required: true }) shipping_address_snapshot!: CustomerAddressSnapshot;
  @Prop({ default: '' }) customer_note!: string;
  @Prop({ type: Date, default: null }) placed_at!: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'Order', default: null }) canonical_order_id!: Types.ObjectId | null;
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

@Schema({ _id: false })
export class StorefrontOrderItemSnapshot {
  @Prop({ type: Types.ObjectId, required: true }) product_id!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) variant_id!: Types.ObjectId;
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
  @Prop({ type: Types.ObjectId, ref: 'StorefrontOrder', required: true, index: true }) order_id!: Types.ObjectId;
}
export type StorefrontOrderItemDocument = HydratedDocument<StorefrontOrderItem>;
export const StorefrontOrderItemSchema = SchemaFactory.createForClass(StorefrontOrderItem);

@Schema({ collection: 'storefront_payments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StorefrontPayment {
  @Prop({ type: Types.ObjectId, ref: 'StorefrontOrder', required: true, index: true }) order_id!: Types.ObjectId;
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
  @Prop({ type: Types.ObjectId, ref: 'StorefrontOrder', required: true, unique: true }) order_id!: Types.ObjectId;
  @Prop({ default: '' }) carrier!: string;
  @Prop({ default: '' }) tracking_number!: string;
  @Prop({ type: String, enum: ['pending', 'picked_up', 'in_transit', 'delivered', 'returned'], default: 'pending' }) status!: string;
  @Prop({ type: CustomerAddressSnapshotSchema, required: true }) recipient_snapshot!: CustomerAddressSnapshot;
  @Prop({ type: Date, default: null }) shipped_at!: Date | null;
  @Prop({ type: Date, default: null }) delivered_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StorefrontShipmentDocument = HydratedDocument<StorefrontShipment>;
export const StorefrontShipmentSchema = SchemaFactory.createForClass(StorefrontShipment);
