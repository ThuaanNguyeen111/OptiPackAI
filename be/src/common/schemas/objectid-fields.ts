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
}

export const OBJECT_ID_FIELDS: ObjectIdFieldEntry[] = [
  { collection: 'bin_locations', fields: ['warehouse_id', 'zone_id'] },
  { collection: 'warehouse_zones', fields: ['warehouse_id'] },
  { collection: 'sku_bin_assignments', fields: ['warehouse_id', 'bin_location_id'] },
  { collection: 'inventory_movements', fields: ['warehouse_id', 'assignment_id', 'bin_location_id'] },
  { collection: 'packaging_recommendations', fields: ['order_group_id', 'approved_by'] },
  { collection: 'users', fields: ['created_by'] },
  { collection: 'trusted_devices', fields: ['user_id'] },
  { collection: 'login_audit_logs', fields: ['user_id'] },
  { collection: 'refresh_tokens', fields: ['user_id'] },
  { collection: 'orders', fields: ['marketplace_shop', 'consolidated_group_id', 'source_return_id'] },
  { collection: 'shipments', fields: ['order_group_id'] },
  { collection: 'shipment_events', fields: ['shipment_id', 'order_group_id'] },
  {
    collection: 'return_requests',
    fields: ['order_group_id', 'shipment_id', 'replacement_order_id', 'replacement_group_id'],
    arrayPath: { array: 'inspection', fields: ['warehouse_id', 'bin_location_id'] },
  },
  { collection: 'marketplace_shops', fields: ['connected_by'] },
  { collection: 'notifications', fields: ['recipient_user_id', 'related_entity_id'] },
  { collection: 'stock_reservations', fields: ['order_group_id'] },
  { collection: 'pick_events', fields: ['order_group_id', 'bin_location_id'] },
  { collection: 'order_groups', fields: ['active_packaging_recommendation', 'assigned_staff_id', 'source_return_id'] },
];

/** Chuỗi id hợp lệ để đổi sang ObjectId: đúng 24 ký tự hex. */
export const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
