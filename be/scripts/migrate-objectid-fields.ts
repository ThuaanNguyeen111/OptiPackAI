import mongoose from 'mongoose';
import { FieldReport, migrateObjectIdFields } from '../src/common/schemas/objectid-migration';

/**
 * ===================================================================
 * MIGRATION 07/10/2026 — chuyển các id đang lưu dạng CHUỖI sang ObjectId
 * ===================================================================
 * Trước 07/10/2026, 35 field id khai `@Prop({ type: Types.ObjectId })` bị Mongoose hiểu
 * là kiểu Mixed, nên chỗ nào trong code ghi chuỗi thì DB lưu chuỗi (đã biết chắc:
 * pick_events.order_group_id, notifications.recipient_user_id / related_entity_id,
 * login_audit_logs.user_id). Schema nay khai đúng `SchemaTypes.ObjectId`: Mongoose tự
 * đổi chuỗi -> ObjectId khi TRUY VẤN, nên các dòng cũ còn lưu chuỗi sẽ KHÔNG khớp nữa
 * (vd thông báo cũ không hiện cho người nhận). Script này chuyển hết dữ liệu cũ.
 *
 * Quy tắc cho từng giá trị dạng chuỗi:
 *  - 24 ký tự hex           -> đổi sang ObjectId cùng giá trị.
 *  - chuỗi rỗng             -> null.
 *  - chuỗi khác (không phải id, vd mã shop Lazada "201171264532" trong
 *    notifications.related_entity_id) -> chỉ LIỆT KÊ; thêm cờ --null-invalid để ghi null.
 *    (Không đổi được sang ObjectId; khi đọc, Mongoose bỏ qua giá trị này như không có.)
 *
 * Mặc định CHẠY THỬ: chỉ đếm và in ra, KHÔNG ghi gì. Thêm --apply để ghi thật.
 * Chạy lại nhiều lần an toàn: lần sau chỉ còn thấy các giá trị chưa chuyển.
 * Dùng driver MongoDB trực tiếp (không khởi động cả ứng dụng, không chạy cron).
 *
 *   cd be
 *   npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts                         # chạy thử
 *   npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts --apply                 # ghi thật
 *   npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts --apply --null-invalid  # ghi thật + giá trị không hợp lệ -> null
 *
 * Kết nối theo biến MONGODB_URI trong be/.env (giống ứng dụng).
 * Chạy 1 lần cho MỖI database (Atlas chung, và DB riêng trên máy từng người nếu có).
 * ===================================================================
 */
const APPLY = process.argv.includes('--apply');
const NULL_INVALID = process.argv.includes('--null-invalid');

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  console.log(`Database: ${db.databaseName} — chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}${NULL_INVALID ? ' + ghi null cho giá trị không hợp lệ' : ''}`);

  const reports: FieldReport[] = await migrateObjectIdFields(db, { apply: APPLY, nullInvalid: NULL_INVALID });

  let totalConverted = 0;
  let totalInvalid = 0;
  for (const r of reports) {
    if (r.converted + r.emptied + r.invalid === 0) continue;
    totalConverted += r.converted + r.emptied;
    totalInvalid += r.invalid;
    const invalidText = r.invalid > 0 ? `, ${String(r.invalid)} không phải id (${JSON.stringify(r.invalidSamples)})${NULL_INVALID ? ' -> null' : ' -> giữ nguyên'}` : '';
    console.log(`  ${r.path}: ${String(r.converted)} chuỗi id -> ObjectId, ${String(r.emptied)} chuỗi rỗng -> null${invalidText}`);
  }
  if (totalConverted + totalInvalid === 0) {
    console.log('✅ Không còn giá trị id nào lưu dạng chuỗi — không cần làm gì.');
  } else if (totalConverted === 0 && !(APPLY && NULL_INVALID)) {
    console.log(`✅ Không còn id dạng chuỗi nào cần chuyển. Còn ${String(totalInvalid)} giá trị không phải id được giữ nguyên (khi đọc sẽ ra null; thêm --apply --null-invalid nếu muốn ghi null).`);
  } else if (APPLY) {
    console.log(`✅ Đã chuyển ${String(totalConverted)} giá trị.${totalInvalid > 0 && !NULL_INVALID ? ` Còn ${String(totalInvalid)} giá trị không phải id được giữ nguyên (thêm --null-invalid nếu muốn ghi null).` : ''}`);
  } else {
    console.log(`ℹ️  Chạy thử: sẽ chuyển ${String(totalConverted)} giá trị, ${String(totalInvalid)} giá trị không phải id. Thêm --apply để ghi thật.`);
  }
  await mongoose.disconnect();
}

run().catch(async (error: unknown) => {
  console.error('❌ Migration thất bại:', error);
  await mongoose.disconnect();
  process.exit(1);
});
