import { FLAT_CATEGORIES } from '../packaging/engine/units';
import { ProductCategory } from '../../common/enums/product-category.enum';
import { isPlaceholderBox } from './primitive-params';
import type { ModelKind, ModelSource } from './schemas/product-model.schema';

export interface ModelLike {
  source: ModelSource;
  kind: ModelKind;
  has_fold_rig: boolean;
  primitive?: { shape: string; corner_radius_pct?: number | null } | null;
}

/**
 * AOFP-352 (Q3, Q18) — loại SKU nào được dùng mô hình nào. Trả câu lỗi tiếng Việt, null = được.
 * Quần áo cần file có clip gập + túi zip (hướng dẫn gập chạy từ clip trong file); túi xách cần dáng thật.
 */
export function modelCategoryMismatch(category: string | null | undefined, model: ModelLike): string | null {
  if (category && FLAT_CATEGORIES.has(category)) {
    if (model.source === 'primitive' || model.kind !== 'garment' || !model.has_fold_rig) {
      return 'Quần áo cần mô hình có bước gập và túi zip — chọn mô hình theo loại hoặc mô hình riêng có xương gập.';
    }
    return null;
  }
  if (category === ProductCategory.BAG && model.source === 'primitive') {
    return 'Túi xách cần mô hình đúng dáng (theo loại hoặc tải lên) — không dùng hình cơ bản.';
  }
  if (model.kind === 'garment') return 'Mô hình quần áo chỉ dùng cho SKU quần áo.';
  return null;
}

/** Nhãn nguồn hiển thị (spec §3.2). */
export function modelSourceLabel(model: ModelLike): string {
  if (model.source === 'category') return 'Mô hình theo loại';
  if (model.source === 'upload') return 'Mô hình riêng';
  return isPlaceholderBox(model.primitive) ? 'Hình đại diện — dựng từ kích thước' : 'Dựng từ hình cơ bản';
}
