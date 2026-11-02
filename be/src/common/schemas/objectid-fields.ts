/**
 * ===================================================================
 * 07/10/2026 — DANH SÁCH CÁC FIELD KIỂU ObjectId (ngoài `_id`) TRONG TOÀN BỘ SCHEMA
 * ===================================================================
 * Bối cảnh: trước 07/10/2026 các field này khai `@Prop({ type: Types.ObjectId })`.
 * Với @nestjs/mongoose, `Types.ObjectId` (lớp giá trị của bson) bị coi là một class
 * lồng nên Mongoose dựng thành kiểu `Mixed` -> KHÔNG tự ép chuỗi sang ObjectId khi
 * truy vấn hoặc khi ghi. Hậu quả: truy vấn bằng chuỗi id ra 0 dòng (Picking List
 * "CHƯA GÁN VỊ TRÍ", pick-item 409, Nhập thêm hàng 404), chỗ nào ghi chuỗi thì DB
 * lưu chuỗi (pick_events.order_group_id, notifications.recipient_user_id...).
 *
 * Cách khai đúng: `@Prop({ type: SchemaTypes.ObjectId })` (import từ 'mongoose').
 *
 * Danh sách này được dùng ở 2 nơi:
 *  - `scripts/migrate-objectid-fields.ts` — chuyển giá trị chuỗi cũ sang ObjectId.
 *  - `objectid-fields.spec.ts` — kiểm tra mọi field trong danh sách thực sự là
 *    ObjectId và không schema nào còn field kiểu Mixed. Thêm field ObjectId mới vào
 *    schema thì phải thêm vào đây, nếu không test sẽ báo lỗi.
 *
 * `arrayPath`: field nằm trong mảng sub-document (vd `inspection[].warehouse_id`).
 * ===================================================================
 */
export interface ObjectIdFieldEntry {
  collection: string;
  fields: string[];
  arrayPath?: { array: string; fields: string[] };
  /**
   * 10/10/2026 (gộp thi_dev) — field nằm 2 tầng (mảng trong mảng, vd `parcels[].scans[].by`).
   * Script KHÔNG chuyển các field này: code luôn ghi `new Types.ObjectId(...)` từ ngày tạo
   * nên không có dữ liệu chuỗi cũ. Chỉ để test đối chiếu đủ danh sách.
   */
  nested?: string[];
}

export const OBJECT_ID_FIELDS: ObjectIdFieldEntry[] = [
  { collection: 'bin_locations', fields: ['warehouse_id', 'zone_id'] },
  { collection: 'warehouse_zones', fields: ['warehouse_id'] },
  {
    collection: 'sku_bin_assignments',
    fields: ['warehouse_id', 'bin_location_id'],
  },
  {
    collection: 'inventory_movements',
    fields: ['warehouse_id', 'assignment_id', 'bin_location_id'],
    nested: ['lot_allocations.lot_id'], // 15/10/2026 — lô hàng FIFO
  },
  // 15/10/2026 — lô hàng + phiếu nhập kho (FIFO theo ngày nhập). Luôn ghi ObjectId.
  {
    collection: 'stock_lots',
    fields: ['warehouse_id', 'assignment_id', 'bin_location_id', 'receipt_id'],
  },
  {
    collection: 'stock_receipts',
    fields: ['warehouse_id'],
    arrayPath: { array: 'lines', fields: ['assignment_id', 'bin_location_id', 'lot_id'] },
  },
  {
    collection: 'packaging_recommendations',
    fields: [
      'order_group_id',
      'order_id',
      'approved_by',
      'adjusted_by',
      'packed_by',
    ],
  },
  { collection: 'users', fields: ['created_by'] },
  { collection: 'trusted_devices', fields: ['user_id'] },
  { collection: 'login_audit_logs', fields: ['user_id'] },
  { collection: 'refresh_tokens', fields: ['user_id'] },
  {
    collection: 'orders',
    fields: ['marketplace_shop', 'consolidated_group_id', 'source_return_id'],
  },
  {
    collection: 'shipments',
    fields: ['order_group_id', 'shipper_id'], // shipper_id 29/10/2026 — hỏa tốc tự giao
    arrayPath: { array: 'carrier_parcels', fields: ['order_id'] }, // C4 (14/10/2026) — kiện gửi hãng
  },
  { collection: 'carrier_webhook_events', fields: ['shipment_id'] }, // C5 (14/10/2026)
  { collection: 'shipment_events', fields: ['shipment_id', 'order_group_id'] },
  { collection: 'marketplace_status_outbox', fields: ['order_group_id', 'shipment_id', 'return_request_id', 'order_id'] }, // 20/10/2026 — ghi ngược trạng thái; order_id 22/10/2026
  {
    collection: 'return_requests',
    fields: [
      'order_group_id',
      'shipment_id',
      'replacement_order_id',
      'replacement_group_id',
      'source_order_id', // 20/10/2026 — đơn gốc của khách (phiếu nguồn marketplace)
    ],
    arrayPath: {
      array: 'inspection',
      fields: ['warehouse_id', 'bin_location_id'],
    },
  },
  { collection: 'marketplace_shops', fields: ['connected_by', 'disconnected_by'] }, // disconnected_by: 22/10/2026
  { collection: 'activity_logs', fields: ['order_group_id', 'entity_id'] }, // 23/10/2026 — sổ hoạt động (lịch sử)
  {
    collection: 'notifications',
    fields: ['recipient_user_id', 'related_entity_id'],
  },
  { collection: 'stock_reservations', fields: ['order_group_id', 'warehouse_id'] }, // warehouse_id: 21/10/2026
  { collection: 'stock_reservation_totals', fields: ['warehouse_id'] }, // 21/10/2026
  {
    collection: 'pick_events',
    fields: ['order_group_id', 'warehouse_id', 'bin_location_id'],
    nested: ['lot_allocations.lot_id'], // 15/10/2026
  },
  {
    collection: 'order_groups',
    fields: [
      'assigned_staff_id',
      'source_return_id',
      'manual_link_id',
      'warehouse_id',
      'split_from_group_id',
      'merged_into_group_id',
    ],
  }, // manual_link_id: 13/10/2026, warehouse_id: 21/10/2026, split/merged: 23/10/2026
  // 10/10/2026 — các collection của thi_dev (đóng gói 3D, cài đặt, storefront) khai `Types.ObjectId`
  // (bị hiểu là Mixed) cho tới lúc gộp main; nay đã đổi sang SchemaTypes.ObjectId.
  { collection: 'packaging_material_rules', fields: ['updated_by'] },
  { collection: 'packaging_movements', fields: ['packing_plan_id'] },
  {
    collection: 'packing_plans',
    fields: [
      'order_group_id',
      'approved_by',
      'rejected_by',
      'rejection_owner_id',
      'packed_by',
      'assigned_packer_id',
      'packing_started_by',
    ],
    // orders[].order_id / parcels[].order_id từng được ghi dạng CHUỖI -> cần chạy script.
    arrayPath: { array: 'orders', fields: ['order_id'] },
  },
  {
    collection: 'packing_plans',
    fields: [],
    arrayPath: { array: 'parcels', fields: ['order_id', 'sealed_by'] },
    nested: [
      'parcels.scans.by',
      'parcels.weighings.by',
      'parcels.reviews.by',
      'parcels.unpack.by',
      'parcels.box_source_override.by', // 21/10/2026 — chọn nguồn thùng khác gợi ý
      'parcels.placements.order_id', // AOFP-224 (31/10/2026) — chủ món trong kiện gộp nhiều đơn
    ],
  },
  {
    collection: 'packing_plans',
    fields: [],
    arrayPath: { array: 'adjustments', fields: ['by'] },
  },
  {
    collection: 'packing_plans',
    fields: [],
    arrayPath: { array: 'issues', fields: ['by'] },
  },
  {
    collection: 'packing_plans',
    fields: [],
    arrayPath: { array: 'activity', fields: ['by'] },
  },
  { collection: 'packing_settings', fields: ['updated_by'] },
  { collection: 'order_sync_settings', fields: ['updated_by'] }, // 15/10/2026
  { collection: 'shipping_settings', fields: ['updated_by'] },
  { collection: 'product_master', fields: ['profile_confirmed_by'] },
  { collection: 'storefront_categories', fields: ['parent_id'] },
  { collection: 'storefront_products', fields: ['category_id'] },
  { collection: 'storefront_product_variants', fields: ['product_id'] },
  {
    collection: 'storefront_inventory_stocks',
    fields: ['variant_id', 'warehouse_id'],
  },
  { collection: 'customer_addresses', fields: ['customer_id'] },
  { collection: 'storefront_carts', fields: ['customer_id'] },
  {
    collection: 'storefront_cart_items',
    fields: ['cart_id', 'product_id', 'variant_id'],
  },
  {
    collection: 'storefront_orders',
    fields: ['customer_id', 'canonical_order_id'],
  },
  {
    collection: 'storefront_order_items',
    fields: ['order_id', 'product_id', 'variant_id'],
  },
  { collection: 'storefront_payments', fields: ['order_id'] },
  { collection: 'storefront_shipments', fields: ['order_id'] },
  { collection: 'storefront_order_events', fields: ['order_id'] }, // 20/10/2026 — hành trình đơn
  { collection: 'storefront_return_requests', fields: ['customer_id', 'order_id'] }, // 20/10/2026 — khách trả hàng
];

/** Chuỗi id hợp lệ để đổi sang ObjectId: đúng 24 ký tự hex. */
export const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
