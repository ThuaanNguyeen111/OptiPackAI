import { footprintOverlapArea } from '../../packaging/engine/validator';
import type {
  BoxSpec,
  PackingUnit,
  Placement,
} from '../../packaging/engine/types';
import type { Variant } from './types';

/**
 * ===================================================================
 * Trạng thái MỘT kiện trong lúc giải mã — Empty Maximal Spaces (EMS)
 * ===================================================================
 * Mỗi kiện giữ danh sách các khoảng trống cực đại (hộp chữ nhật rỗng lớn
 * nhất không chứa món nào). Món luôn đặt ở góc (x1, y1, z1) của một EMS
 * nên không bao giờ giao món khác; sau khi đặt, mọi EMS bị cắt được tách
 * thành tối đa 6 EMS con, rồi loại EMS quá nhỏ / nằm trọn trong EMS khác.
 *
 * Luật đỡ đáy và tải chồng GIỐNG validator (đỡ 100% diện tích đáy bằng mặt
 * trên các món ngay dưới; tải truyền xuống theo tỷ lệ diện tích tiếp xúc).
 * Validator vẫn kiểm lại kết quả cuối — đây không phải nguồn sự thật.
 * ===================================================================
 */

export interface Ems {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
}

/** Số vị trí tốt nhất (theo DFTRC) mà gen được chọn giữa — mở rộng không gian giải mã. */
const TOP_K = 4;

interface Supporter {
  index: number;
  share: number;
}

export interface PlacementCheck {
  supporters: Supporter[];
  deltas: Map<number, number>;
}

function interiorOverlap(e: Ems, b: Ems): boolean {
  return (
    e.x1 < b.x2 &&
    b.x1 < e.x2 &&
    e.y1 < b.y2 &&
    b.y1 < e.y2 &&
    e.z1 < b.z2 &&
    b.z1 < e.z2
  );
}

function contains(outer: Ems, inner: Ems): boolean {
  return (
    outer.x1 <= inner.x1 &&
    outer.y1 <= inner.y1 &&
    outer.z1 <= inner.z1 &&
    outer.x2 >= inner.x2 &&
    outer.y2 >= inner.y2 &&
    outer.z2 >= inner.z2
  );
}

export class ParcelState {
  readonly placements: Placement[] = [];
  /** Món đúng dạng đã đặt (dạng gập nếu gập). */
  readonly units: PackingUnit[] = [];
  /** Chỉ số món trong danh sách gốc của đơn, theo thứ tự đặt. */
  readonly unitIndices: number[] = [];
  weight = 0;
  private ems: Ems[];
  private readonly limits: (number | null)[] = [];
  private readonly loads: number[] = [];
  private readonly supportersOf: Supporter[][] = [];

  constructor(
    readonly box: BoxSpec,
    /** Cạnh nhỏ nhất của mọi biến thể món — EMS hẹp hơn thì vô dụng, bỏ. */
    private readonly minDim: number,
  ) {
    this.ems = [
      {
        x1: 0,
        y1: 0,
        z1: 0,
        x2: box.inner.length_mm,
        y2: box.inner.width_mm,
        z2: box.inner.height_mm,
      },
    ];
  }

  /** Kiểm đặt `v` tại (x, y, z): tải thùng, đỡ đáy toàn phần, tải chồng. */
  check(v: Variant, x: number, y: number, z: number): PlacementCheck | null {
    if (this.weight + v.unit.weight_g > this.box.max_load_g) return null;
    if (z === 0) return { supporters: [], deltas: new Map() };

    const footprint = { x, y, z, dx: v.dx, dy: v.dy, dz: v.dz };
    const raw: { index: number; area: number }[] = [];
    let covered = 0;
    for (let i = 0; i < this.placements.length; i += 1) {
      const other = this.placements[i];
      if (!other || other.z + other.dz !== z) continue;
      const area = footprintOverlapArea(footprint, other);
      if (area > 0) {
        raw.push({ index: i, area });
        covered += area;
      }
    }
    if (covered < v.dx * v.dy) return null;
    const supporters = raw.map((r) => ({
      index: r.index,
      share: r.area / covered,
    }));

    const deltas = new Map<number, number>();
    this.collectDeltas(supporters, v.unit.weight_g, deltas);
    for (const [index, delta] of deltas) {
      const limit = this.limits[index] ?? null;
      if (limit === null) return null;
      if ((this.loads[index] ?? 0) + delta > limit) return null;
    }
    return { supporters, deltas };
  }

  private collectDeltas(
    supporters: Supporter[],
    weight: number,
    out: Map<number, number>,
  ): void {
    for (const s of supporters) {
      const delta = weight * s.share;
      out.set(s.index, (out.get(s.index) ?? 0) + delta);
      const below = this.supportersOf[s.index];
      if (below && below.length > 0) this.collectDeltas(below, delta, out);
    }
  }

  /**
   * Tìm chỗ cho món theo luật DFTRC (Distance to the Front-Top-Right Corner,
   * Gonçalves & Resende 2013): trong mọi cặp (EMS, biến thể) vừa và hợp lệ,
   * chọn EMS chứa cặp có góc xa nhất của món CÁCH XA góc trước-trên-phải của
   * thùng nhất → hàng dồn về góc sau-dưới-trái, xếp chặt. Gen `gene` ∈ [0,1)
   * chọn trong TOP_K vị trí (EMS × biến thể) hợp lệ tốt nhất (0 = tốt nhất).
   */
  find(
    variants: Variant[],
    gene: number,
  ): { variant: Variant; at: Ems; check: PlacementCheck } | null {
    // Gập chỉ khi cần (quy tắc 22/09/2026): thử dạng gốc trước, hết chỗ mới thử dạng gập.
    const plain = variants.filter((v) => v.unit.folded !== true);
    const folded = variants.filter((v) => v.unit.folded === true);
    return (
      this.findAmong(plain, gene) ??
      (folded.length > 0 ? this.findAmong(folded, gene) : null)
    );
  }

  private findAmong(
    variants: Variant[],
    gene: number,
  ): { variant: Variant; at: Ems; check: PlacementCheck } | null {
    if (variants.length === 0) return null;
    const L = this.box.inner.length_mm;
    const W = this.box.inner.width_mm;
    const H = this.box.inner.height_mm;
    const candidates: { e: Ems; v: Variant; d: number }[] = [];
    for (const e of this.ems) {
      for (const v of variants) {
        if (
          v.dx > e.x2 - e.x1 ||
          v.dy > e.y2 - e.y1 ||
          v.dz > e.z2 - e.z1
        )
          continue;
        const fx = L - (e.x1 + v.dx);
        const fy = W - (e.y1 + v.dy);
        const fz = H - (e.z1 + v.dz);
        candidates.push({ e, v, d: fx * fx + fy * fy + fz * fz });
      }
    }
    // Xa góc trước-trên-phải nhất trước; hòa thì thấp hơn, sâu hơn, trái hơn (ổn định).
    candidates.sort(
      (a, b) =>
        b.d - a.d ||
        a.e.z1 - b.e.z1 ||
        a.e.y1 - b.e.y1 ||
        a.e.x1 - b.e.x1,
    );
    // Gen chọn trong TOP_K vị trí hợp lệ tốt nhất theo DFTRC (gen 0 = tốt nhất).
    // Chỉ chọn biến thể trong 1 EMS cố định sẽ bỏ sót bố cục cần thiết (vd 2 đôi
    // dép đặt cạnh nhau thay vì chồng lên nhau để quần gập nằm phủ lên trên).
    const valid: { variant: Variant; at: Ems; check: PlacementCheck }[] = [];
    for (const c of candidates) {
      const check = this.check(c.v, c.e.x1, c.e.y1, c.e.z1);
      if (!check) continue;
      valid.push({ variant: c.v, at: c.e, check });
      if (valid.length >= TOP_K) break;
    }
    const pick = valid[Math.min(valid.length - 1, Math.floor(gene * valid.length))];
    if (pick) return pick;
    return null;
  }

  place(
    variant: Variant,
    at: Ems,
    check: PlacementCheck,
    unitIndex: number,
  ): Placement {
    const placement: Placement = {
      item_key: variant.unit.item_key,
      sku: variant.unit.sku,
      step: this.placements.length + 1,
      x: at.x1,
      y: at.y1,
      z: at.z1,
      dx: variant.dx,
      dy: variant.dy,
      dz: variant.dz,
      orientation: variant.orientation,
      ...(variant.unit.folded === true && { folded: true }),
    };
    this.placements.push(placement);
    this.units.push(variant.unit);
    this.unitIndices.push(unitIndex);
    this.limits.push(variant.unit.is_fragile ? null : variant.unit.max_stack_load_g);
    this.loads.push(0);
    this.supportersOf.push(check.supporters);
    for (const [i, delta] of check.deltas)
      this.loads[i] = (this.loads[i] ?? 0) + delta;
    this.weight += variant.unit.weight_g;
    this.splitEms({
      x1: placement.x,
      y1: placement.y,
      z1: placement.z,
      x2: placement.x + placement.dx,
      y2: placement.y + placement.dy,
      z2: placement.z + placement.dz,
    });
    return placement;
  }

  private splitEms(b: Ems): void {
    const next: Ems[] = [];
    for (const e of this.ems) {
      if (!interiorOverlap(e, b)) {
        next.push(e);
        continue;
      }
      if (b.x1 > e.x1) next.push({ ...e, x2: b.x1 });
      if (b.x2 < e.x2) next.push({ ...e, x1: b.x2 });
      if (b.y1 > e.y1) next.push({ ...e, y2: b.y1 });
      if (b.y2 < e.y2) next.push({ ...e, y1: b.y2 });
      if (b.z1 > e.z1) next.push({ ...e, z2: b.z1 });
      if (b.z2 < e.z2) next.push({ ...e, z1: b.z2 });
    }
    const m = this.minDim;
    const useful = next.filter(
      (e) => e.x2 - e.x1 >= m && e.y2 - e.y1 >= m && e.z2 - e.z1 >= m,
    );
    // Giữ EMS cực đại: bỏ EMS nằm trọn trong EMS khác (trùng nhau thì giữ cái đầu).
    this.ems = useful.filter(
      (e, i) =>
        !useful.some(
          (f, j) => j !== i && contains(f, e) && (!contains(e, f) || j < i),
        ),
    );
  }
}
