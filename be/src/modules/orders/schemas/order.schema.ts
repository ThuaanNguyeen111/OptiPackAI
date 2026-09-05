import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import { OrderStatus, UNFULFILLED_ORDER_STATUSES } from '../enums/order-status.enum';

export type OrderDocument = Order & Document;

/**
 * ===================================================================
 * SUBDOCUMENT — ĐỊA CHỈ NGƯỜI NHẬN (embedded, không tách collection)
 * ===================================================================
 * QUYẾT ĐỊNH EMBED (không phải THAM CHIẾU sang collection riêng):
 * địa chỉ luôn được ĐỌC/GHI CÙNG với đơn hàng, không bao giờ cần query
 * độc lập kiểu "tìm tất cả địa chỉ có thành phố X" tách khỏi đơn hàng —
 * embed tránh 1 lần $lookup không cần thiết mỗi khi đọc đơn (đúng
 * nguyên tắc MongoDB: embed khi dữ liệu con luôn đi cùng cha, tham
 * chiếu khi dữ liệu con có vòng đời/tần suất truy vấn riêng — giống
 * cách marketplace_shops KHÔNG bị nhét vào orders vì lý do ngược lại,
 * xem giải thích trong marketplace-shop.schema.ts).
 * ===================================================================
 */
@Schema({ _id: false })
class RecipientAddress {
  @Prop({ type: String, required: true, trim: true })
  full_name!: string;

  // SĐT GỐC (giữ nguyên định dạng sàn trả về) — hiển thị cho nhân viên,
  // KHÔNG dùng trường này để so khớp consolidation (dùng consolidation_key).
  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, required: true, trim: true })
  address_line1!: string;

  @Prop({ type: String, trim: true })
  address_line2?: string;

  @Prop({ type: String, required: true, trim: true })
  city!: string;

  @Prop({ type: String, trim: true })
  postal_code?: string;

  @Prop({ type: String, required: true, trim: true, default: 'VN' })
  country!: string;
}

/**
 * ===================================================================
 * SUBDOCUMENT — SẢN PHẨM TRONG ĐƠN (embedded array)
 * ===================================================================
 * QUYẾT ĐỊNH EMBED: 1 đơn thường chỉ có vài đến vài chục item — mảng
 * BOUNDED (có giới hạn hợp lý), luôn đọc/ghi cùng đơn cha, không có
 * use case "tìm item theo SKU xuyên suốt mọi đơn" ở giai đoạn hiện tại
 * đủ tần suất để cần tách collection riêng + index riêng. Nếu sau này
 * Package 3 (AI packaging) cần truy vấn item xuyên đơn ở tần suất cao
 * (vd tính tổng nhu cầu đóng gói theo SKU), ĐÓ là lúc cân nhắc tách —
 * KHÔNG tách trước khi có nhu cầu thật (tránh over-engineering).
 * ===================================================================
 */
@Schema({ _id: false })
class OrderItem {
  // ID item TRÊN SÀN — dùng để đối chiếu ngược khi sàn có update riêng
  // từng item (vd 1 item trong đơn bị hủy nhưng các item khác vẫn giao).
  @Prop({ type: String, required: true })
  platform_order_item_id!: string;

  @Prop({ type: String, required: true })
  sku!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true })
  variation?: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  // Lưu dạng NUMBER (đã parseFloat từ string gốc của Lazada) — KHÔNG
  // lưu string, để có thể $sum/$avg trực tiếp trong aggregation pipeline
  // (Package 5 - analytics sẽ cần) mà không phải convert lại mỗi lần.
  @Prop({ type: Number, required: true, min: 0 })
  unit_price!: number;

  @Prop({ type: String, enum: OrderStatus, required: true })
  status!: OrderStatus;
}

/**
 * ===================================================================
 * COLLECTION `orders` — CHUẨN HÓA ĐƠN HÀNG TỪ MỌI SÀN VỀ 1 HÌNH DẠNG
 * ===================================================================
 * PHẠM VI HIỆN TẠI: chỉ Lazada ghi dữ liệu vào collection này (đúng
 * quyết định thu hẹp scope tạm thời — xem marketplace-integration.module.ts).
 * Field `platform` vẫn khai đủ enum 3 sàn (không chỉ literal 'lazada')
 * để KHÔNG phải migrate schema khi mở lại TikTok/Tiki — chỉ cần
 * service mới ghi platform tương ứng, schema không đổi gì.
 *
 * QUAN HỆ VỚI `marketplace_shops`: lưu CẢ 2 — `marketplace_shop` (ObjectId
 * ref, cho populate/join khi cần đầy đủ thông tin shop) VÀ `platform` +
 * `shop_id` denormalized ngay trên chính document Order (cho phép lọc/
 * đếm đơn theo shop mà KHÔNG cần $lookup — đây là truy vấn NÓNG NHẤT
 * của dashboard vận hành, denormalize có chủ đích để đổi lấy tốc độ,
 * chấp nhận trả giá bằng việc phải giữ đồng bộ nếu sau này cho phép
 * đổi platform/shop_id của 1 MarketplaceShop đã tồn tại — thực tế
 * KHÔNG xảy ra vì 2 field đó immutable sau khi connect).
 * ===================================================================
 */
@Schema({
  collection: 'orders',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'MarketplaceShop', required: true })
  marketplace_shop!: Types.ObjectId;

  // Denormalized — xem giải thích ở JSDoc class phía trên.
  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ type: String, required: true })
  shop_id!: string;

  // ID đơn TRÊN SÀN (order_id của Lazada) — lưu STRING dù Lazada trả
  // number, để nhất quán kiểu dữ liệu khi sàn khác dùng ID dạng string.
  @Prop({ type: String, required: true })
  platform_order_id!: string;

  @Prop({ type: String })
  platform_order_number?: string;

  @Prop({ type: String, enum: OrderStatus, required: true })
  status!: OrderStatus;

  // Trạng thái GỐC chưa dịch, giữ lại để debug khi mapLazadaStatus()
  // gặp giá trị lạ chưa từng thấy (Lazada có thể thêm status mới không
  // báo trước) — KHÔNG dùng trường này cho business logic, chỉ để audit.
  @Prop({ type: [String], default: [] })
  raw_statuses!: string[];

  @Prop({ type: RecipientAddress, required: true })
  recipient!: RecipientAddress;

  // Xem giải thích đầy đủ trong utils/consolidation-key.util.ts.
  @Prop({ type: String, required: true })
  consolidation_key!: string;

  @Prop({ type: [OrderItem], required: true, default: [] })
  items!: OrderItem[];

  @Prop({ type: Number, required: true, min: 0 })
  total_amount!: number;

  @Prop({ type: String, required: true, default: 'VND' })
  currency!: string;

  // true = đơn NÀY đã bị gộp vào 1 gói hàng chung với đơn khác cùng
  // consolidation_key — khi true, `consolidated_group_id` bắt buộc có giá trị.
  @Prop({ type: Boolean, required: true, default: false })
  is_consolidated!: boolean;

  // ID DÙNG CHUNG cho mọi đơn thuộc cùng 1 gói hàng — KHÔNG tách
  // collection `fulfillment_groups` riêng ở giai đoạn này (chưa có nhu
  // cầu truy vấn "danh sách gói hàng" độc lập khỏi orders); truy vấn
  // "các đơn trong cùng gói X" chỉ đơn giản là
  // `Order.find({ consolidated_group_id: X })`. Khi Package 4
  // (fulfillment) cần thêm thuộc tính riêng cho gói hàng (vd 1 nhãn vận
  // đơn chung, 1 trạng thái đóng gói chung), ĐÓ là lúc tách collection
  // riêng — field này migrate thẳng thành FK sang collection mới,
  // không cần đổi giá trị đã lưu.
  @Prop({ type: Types.ObjectId, default: null })
  consolidated_group_id!: Types.ObjectId | null;

  // Lần cuối service polling ghi/cập nhật document này — KHÁC với
  // updated_at (Mongoose tự set updated_at cho MỌI lần save, kể cả
  // sửa tay qua Mongo Compass) — field này CHỈ service polling ghi,
  // dùng để debug "lần sync gần nhất lấy dữ liệu tới đâu".
  @Prop({ type: Date, required: true })
  synced_at!: Date;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  // KHÔNG có @Prop — Mongoose tự sinh 2 field này qua option `timestamps`
  // ở @Schema() phía trên. Khai báo type-only (đúng convention đã dùng ở
  // user.schema.ts) để TypeScript biết kiểu, tránh phải cast/`.get()`
  // (nguồn gốc `any`) mỗi lần đọc created_at ở service/controller.
  created_at?: Date;
  updated_at?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

/**
 * (a) UNIQUE compound index — 1 đơn trên 1 sàn chỉ tồn tại ĐÚNG 1 bản
 *     ghi. Đây cũng chính là điều kiện `findOneAndUpdate(..., {upsert:true})`
 *     mà orders.service.ts dùng khi polling — 2 lần poll trùng cửa sổ
 *     thời gian sẽ GHI ĐÈ thay vì tạo bản ghi trùng lặp (idempotent).
 */
OrderSchema.index(
  { platform: 1, shop_id: 1, platform_order_id: 1 },
  { unique: true },
);

/**
 * (b) TRUY VẤN NÓNG NHẤT của dashboard vận hành: "danh sách đơn của
 *     shop X, lọc theo trạng thái, sắp xếp theo ngày tạo mới nhất".
 *     Thứ tự field tuân thủ nguyên tắc ESR (Equality → Sort → Range)
 *     của MongoDB — 2 field lọc bằng (equality) đứng trước, field sort
 *     đứng cuối, để Mongo dùng ĐÚNG 1 index vừa lọc vừa sort mà KHÔNG
 *     cần bước SORT_KEY_GENERATOR (in-memory sort) tốn thêm bộ nhớ.
 */
OrderSchema.index({ shop_id: 1, status: 1, created_at: -1 });

/**
 * (c) PARTIAL INDEX cho bước consolidation — CHỈ index đơn đang ở
 *     trạng thái CHƯA fulfill (UNFULFILLED_ORDER_STATUSES). Đơn đã
 *     DELIVERED/CANCELED/RETURNED/SHIPPED KHÔNG BAO GIỜ là ứng viên
 *     consolidation nên loại khỏi index — index nhỏ hơn đáng kể khi dữ
 *     liệu lịch sử lớn dần (giống partial index đã áp dụng cho
 *     access_token_expires_at ở marketplace-shop.schema.ts).
 */
OrderSchema.index(
  { consolidation_key: 1 },
  { partialFilterExpression: { status: { $in: UNFULFILLED_ORDER_STATUSES } } },
);

/**
 * (d) Tra cứu theo nhóm gộp (trang chi tiết 1 gói hàng gồm nhiều đơn) —
 *     PARTIAL vì phần lớn đơn có is_consolidated=false, không cần index
 *     những đơn không thuộc nhóm nào.
 */
OrderSchema.index(
  { consolidated_group_id: 1 },
  { partialFilterExpression: { is_consolidated: true } },
);
