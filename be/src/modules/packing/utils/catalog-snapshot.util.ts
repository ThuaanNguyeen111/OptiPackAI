import { createHash } from 'crypto';
import type { BoxSpec, MailerSpec, MaterialSpec } from '../../packaging/engine/types';
import type { ChargeRule } from '../solver';
import { formatGAsKg } from '../../../common/utils/measure-format.util';

/**
 * ===================================================================
 * Ảnh chụp danh mục đầu vào của bộ giải (05/11/2026)
 * ===================================================================
 * Trả lời "Admin CRUD thùng/vật tư thì AI cập nhật thế nào": bộ giải đọc
 * thẳng DB mỗi lần tính nên KHÔNG cần đồng bộ; nhưng kế hoạch đã tính là ảnh
 * chụp lúc đó. Mỗi kế hoạch lưu dấu vân tay (hash ngắn) của từng thùng / túi /
 * vật tư đã dùng + phiên bản luật vật tư + luật cước. So với danh mục hiện tại
 * → nêu đích danh thay đổi để người dùng quyết định tính lại. Chỉ băm các
 * trường bộ giải dùng (số đo, bì, tải, giá) — tồn kho đổi không tính.
 * ===================================================================
 */

export interface CatalogInputs {
  boxes: BoxSpec[];
  mailers: MailerSpec[];
  materials: MaterialSpec[];
  materialRulesVersion: number | null;
  charge: ChargeRule;
}

export interface CatalogEntrySnapshot {
  code: string;
  name: string;
  fingerprint: string;
}

export interface CatalogSnapshot {
  boxes: CatalogEntrySnapshot[];
  mailers: CatalogEntrySnapshot[];
  materials: CatalogEntrySnapshot[];
  material_rules_version: number | null;
  volumetric_divisor: number;
  billing_step_g: number;
}

const hash = (value: unknown): string => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

const entry = (code: string, name: string, fields: unknown): CatalogEntrySnapshot => ({
  code,
  name,
  fingerprint: hash(fields),
});

export function snapshotCatalog(inputs: CatalogInputs): CatalogSnapshot {
  const byCode = (a: CatalogEntrySnapshot, b: CatalogEntrySnapshot): number => a.code.localeCompare(b.code);
  return {
    boxes: inputs.boxes
      .map((b) => entry(b.code, b.name, [b.inner, b.outer, b.tare_g, b.max_load_g, b.price_vnd]))
      .sort(byCode),
    mailers: inputs.mailers
      .map((m) => entry(m.code, m.name, [m.width_mm, m.length_mm, m.tare_g, m.max_load_g, m.price_vnd]))
      .sort(byCode),
    materials: inputs.materials
      .map((m) => entry(m.code, m.name, [m.type, m.unit, m.weight_g_per_unit, m.price_vnd_per_unit]))
      .sort(byCode),
    material_rules_version: inputs.materialRulesVersion,
    volumetric_divisor: inputs.charge.volumetricDivisor,
    billing_step_g: inputs.charge.billingStepG,
  };
}

function diffEntries(label: string, before: CatalogEntrySnapshot[], after: CatalogEntrySnapshot[]): string[] {
  const old = new Map(before.map((e) => [e.code, e]));
  const now = new Map(after.map((e) => [e.code, e]));
  const out: string[] = [];
  for (const e of after) {
    const prev = old.get(e.code);
    if (!prev) out.push(`${label} ${e.code} mới được thêm (${e.name}).`);
    else if (prev.fingerprint !== e.fingerprint) out.push(`${label} ${e.code} đã đổi số đo, khối lượng hoặc giá.`);
  }
  for (const e of before) if (!now.has(e.code)) out.push(`${label} ${e.code} đã ngừng dùng hoặc thiếu số đo.`);
  return out;
}

/** Thay đổi của danh mục HIỆN TẠI so với lúc tính kế hoạch (rỗng = không đổi). */
export function diffCatalog(before: CatalogSnapshot, after: CatalogSnapshot): string[] {
  const out = [
    ...diffEntries('Thùng', before.boxes, after.boxes),
    ...diffEntries('Túi niêm phong', before.mailers, after.mailers),
    ...diffEntries('Vật tư', before.materials, after.materials),
  ];
  if (before.material_rules_version !== after.material_rules_version) {
    const v = (n: number | null): string => (n === null ? 'mặc định' : String(n));
    out.push(`Luật vật tư chèn: phiên bản ${v(before.material_rules_version)} → ${v(after.material_rules_version)}.`);
  }
  if (before.volumetric_divisor !== after.volumetric_divisor || before.billing_step_g !== after.billing_step_g) {
    out.push(
      `Luật cân tính cước đã đổi (hệ số ${String(before.volumetric_divisor)}, bước ${formatGAsKg(before.billing_step_g)} → ` +
        `hệ số ${String(after.volumetric_divisor)}, bước ${formatGAsKg(after.billing_step_g)}).`,
    );
  }
  return out;
}
