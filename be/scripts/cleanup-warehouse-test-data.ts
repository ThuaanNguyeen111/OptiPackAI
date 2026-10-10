import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Connection, Model, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { AppException } from '../src/common/exceptions/app-exception';
import { WarehouseService } from '../src/modules/warehouse/warehouse.service';
import { Warehouse } from '../src/modules/warehouse/schemas/warehouse.schema';
import { WarehouseZone } from '../src/modules/warehouse/schemas/warehouse-zone.schema';
import { BinLocation } from '../src/modules/warehouse/schemas/bin-location.schema';
import { SkuBinAssignment } from '../src/modules/warehouse/schemas/sku-bin-assignment.schema';
import { InventoryMovement } from '../src/modules/warehouse/schemas/inventory-movement.schema';

/**
 * ===================================================================
 * 10/10/2026 — DỌN DỮ LIỆU KHO TEST 1 LẦN (thay cho việc vào MongoDB xoá tay)
 * ===================================================================
 * Xoá tay trong DB để lại dữ liệu mồ côi (VD dòng "SKU trên ô" trỏ tới ô đã
 * bị xoá) → màn hình báo "CHƯA GÁN VỊ TRÍ". Script này dọn ĐÚNG quy tắc của
 * API xoá hẳn (purgeWarehouse / purgeZone / purgeBin):
 *   - CHƯA TỪNG DÙNG (không còn hàng, không có dòng sổ cái) → xoá hẳn.
 *   - ĐÃ DÙNG → GIỮ NGUYÊN, chỉ liệt kê (muốn ẩn thì dùng DELETE thường).
 *   - Ô xét theo NGUYÊN KỆ: kệ có ≥ 1 ô đã dùng thì giữ cả kệ (không để kệ
 *     bị thủng lỗ trên sơ đồ); muốn bỏ từng ô lẻ thì gọi API xoá hẳn từng ô.
 *   - Dữ liệu mồ côi: khu/ô không còn kho/khu cha, dòng gán tồn 0 trỏ tới
 *     kho/ô không tồn tại → xoá. Dòng gán mồ côi CÒN TỒN > 0 → chỉ báo, không
 *     xoá (cần người kiểm tra số hàng đó).
 * Không đụng sổ cái inventory_movements, đơn hàng, master SKU, mapping.
 *
 * BƯỚC 1 — chạy thử (mặc định, KHÔNG ghi gì), xem danh sách sẽ xoá/giữ:
 *   npx ts-node -r dotenv/config scripts/cleanup-warehouse-test-data.ts --all
 *   npx ts-node -r dotenv/config scripts/cleanup-warehouse-test-data.ts --warehouse=<id1>,<id2>
 * BƯỚC 2 — xoá thật (tự ghi file backup vào be/backups/ TRƯỚC khi xoá):
 *   npx ts-node -r dotenv/config scripts/cleanup-warehouse-test-data.ts --all --apply
 * Phải chọn --all hoặc --warehouse=... để không vô tình xoá kho thật đang
 * chuẩn bị (kho/kệ trống chưa nhập hàng cũng tính là "chưa từng dùng").
 * ===================================================================
 */

type Lean<T> = T & { _id: Types.ObjectId };
interface PlanRow {
  loai: string;
  ma: string;
  id: string;
  hanh_dong: string;
  ly_do: string;
}

const idOf = (v: unknown): string =>
  v instanceof Types.ObjectId ? v.toHexString() : String(v);

function parseArgs(): { apply: boolean; all: boolean; warehouseIds: string[] } {
  const args = process.argv.slice(2);
  const unknown = args.filter(
    (a) =>
      a !== '--apply' &&
      a !== '--all' &&
      !/^--warehouse=[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/.test(a),
  );
  if (unknown.length > 0) {
    console.error(
      `❌ Cờ không hợp lệ: ${unknown.join(' ')}. Chỉ nhận --all, --warehouse=<id>[,<id>...], --apply. Không ghi gì vào DB.`,
    );
    process.exit(1);
  }
  const all = args.includes('--all');
  const whArg = args.find((a) => a.startsWith('--warehouse='));
  const warehouseIds = whArg
    ? whArg.slice('--warehouse='.length).split(',')
    : [];
  if (all === warehouseIds.length > 0) {
    console.error(
      '❌ Chọn ĐÚNG MỘT trong hai: --all (mọi kho) hoặc --warehouse=<id>[,<id>...].',
    );
    process.exit(1);
  }
  return { apply: args.includes('--apply'), all, warehouseIds };
}

async function main(): Promise<void> {
  const { apply, all, warehouseIds } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(WarehouseService);
    const connection = app.get<Connection>(getConnectionToken());
    const warehouseModel = app.get<Model<Warehouse>>(
      getModelToken(Warehouse.name),
    );
    const zoneModel = app.get<Model<WarehouseZone>>(
      getModelToken(WarehouseZone.name),
    );
    const binModel = app.get<Model<BinLocation>>(
      getModelToken(BinLocation.name),
    );
    const assignmentModel = app.get<Model<SkuBinAssignment>>(
      getModelToken(SkuBinAssignment.name),
    );
    const movementModel = app.get<Model<InventoryMovement>>(
      getModelToken(InventoryMovement.name),
    );

    // ---- 1. Đọc toàn bộ cây kho (dữ liệu kho nhỏ) + tập ô/kho "đã dùng" ----
    const [
      warehouses,
      zones,
      bins,
      stockedBinIds,
      movedBinIds,
      movedWarehouseIds,
    ] = await Promise.all([
      warehouseModel.find().lean<Lean<Warehouse>[]>(),
      zoneModel.find().lean<Lean<WarehouseZone>[]>(),
      binModel.find().lean<Lean<BinLocation>[]>(),
      assignmentModel.distinct('bin_location_id', {
        quantity_on_hand: { $gt: 0 },
      }),
      movementModel.distinct('bin_location_id'),
      movementModel.distinct('warehouse_id'),
    ]);
    const usedBins = new Set([...stockedBinIds, ...movedBinIds].map(idOf));
    const movedWarehouses = new Set(movedWarehouseIds.map(idOf));
    const warehouseIdSet = new Set(warehouses.map((w) => idOf(w._id)));
    const zoneIdSet = new Set(zones.map((z) => idOf(z._id)));

    const missing = warehouseIds.filter((id) => !warehouseIdSet.has(id));
    if (missing.length > 0) {
      console.error(
        `❌ Không tìm thấy kho: ${missing.join(', ')}. Không ghi gì vào DB.`,
      );
      process.exitCode = 1;
      return;
    }
    const scope = all
      ? warehouses
      : warehouses.filter((w) => warehouseIds.includes(idOf(w._id)));

    // ---- 2. Lập kế hoạch theo đúng quy tắc purge ----
    const plan: PlanRow[] = [];
    const purgeWarehouses: Lean<Warehouse>[] = [];
    const purgeZones: Lean<WarehouseZone>[] = [];
    const purgeBins: Lean<BinLocation>[] = [];

    for (const wh of scope) {
      const whId = idOf(wh._id);
      const whBins = bins.filter((b) => idOf(b.warehouse_id) === whId);
      if (
        !movedWarehouses.has(whId) &&
        whBins.every((b) => !usedBins.has(idOf(b._id)))
      ) {
        purgeWarehouses.push(wh);
        plan.push({
          loai: 'Kho',
          ma: wh.warehouse_code,
          id: whId,
          hanh_dong: 'XOÁ HẲN',
          ly_do: `chưa từng dùng (kèm ${String(whBins.length)} ô)`,
        });
        continue;
      }
      plan.push({
        loai: 'Kho',
        ma: wh.warehouse_code,
        id: whId,
        hanh_dong: 'GIỮ',
        ly_do: 'có hàng hoặc lịch sử nhập–xuất',
      });
      for (const zone of zones.filter((z) => idOf(z.warehouse_id) === whId)) {
        const zId = idOf(zone._id);
        const zBins = whBins.filter((b) => idOf(b.zone_id) === zId);
        if (zBins.every((b) => !usedBins.has(idOf(b._id)))) {
          purgeZones.push(zone);
          plan.push({
            loai: 'Khu',
            ma: zone.zone_code,
            id: zId,
            hanh_dong: 'XOÁ HẲN',
            ly_do: `chưa từng dùng (kèm ${String(zBins.length)} ô)`,
          });
          continue;
        }
        // Xét theo NGUYÊN KỆ (cùng khu + dãy + phía + số kệ): kệ có dù chỉ 1 ô
        // đã dùng thì giữ nguyên cả kệ, tránh kệ bị "thủng lỗ" trên sơ đồ kho.
        const racks = new Map<string, Lean<BinLocation>[]>();
        for (const bin of zBins) {
          const key = `${bin.aisle}|${bin.side ?? ''}|${String(bin.rack)}`;
          racks.set(key, [...(racks.get(key) ?? []), bin]);
        }
        for (const rackBins of racks.values()) {
          const first = rackBins[0];
          if (!first) continue;
          // Mã ô v2 "KA-D1-T04-T01-4" = kệ + tầng + ô → bỏ 2 đoạn cuối;
          // mã ô v1 "A01-01-02-01" = kệ + tầng → bỏ 1 đoạn cuối.
          const rackLabel =
            first.bin_code
              .split('-')
              .slice(0, first.layout_version === 2 ? -2 : -1)
              .join('-') || first.bin_code;
          const usedCount = rackBins.filter((b) =>
            usedBins.has(idOf(b._id)),
          ).length;
          if (usedCount === 0) purgeBins.push(...rackBins);
          plan.push({
            loai: 'Kệ',
            ma: rackLabel,
            id: `${String(rackBins.length)} ô`,
            hanh_dong: usedCount === 0 ? 'XOÁ HẲN' : 'GIỮ',
            ly_do:
              usedCount === 0
                ? 'chưa từng dùng (cả kệ)'
                : `${String(usedCount)}/${String(rackBins.length)} ô có hàng hoặc lịch sử → giữ nguyên cả kệ`,
          });
        }
      }
    }

    // ---- 3. Dữ liệu mồ côi (toàn DB, không phụ thuộc phạm vi kho) ----
    const orphanZones = zones.filter(
      (z) => !warehouseIdSet.has(idOf(z.warehouse_id)),
    );
    const orphanZoneIds = new Set(orphanZones.map((z) => idOf(z._id)));
    const orphanBinsAll = bins.filter(
      (b) =>
        !warehouseIdSet.has(idOf(b.warehouse_id)) ||
        !zoneIdSet.has(idOf(b.zone_id)) ||
        orphanZoneIds.has(idOf(b.zone_id)),
    );
    const orphanBins = orphanBinsAll.filter((b) => !usedBins.has(idOf(b._id)));
    const zonesWithKeptOrphanBins = new Set(
      orphanBinsAll
        .filter((b) => usedBins.has(idOf(b._id)))
        .map((b) => idOf(b.zone_id)),
    );
    const deletableOrphanZones = orphanZones.filter(
      (z) => !zonesWithKeptOrphanBins.has(idOf(z._id)),
    );
    const orphanBinIdSet = new Set(orphanBins.map((b) => idOf(b._id)));
    const liveBinIds = new Set(
      bins.map((b) => idOf(b._id)).filter((id) => !orphanBinIdSet.has(id)),
    );
    const orphanAssignments = await assignmentModel
      .find({
        $or: [
          { warehouse_id: { $nin: warehouses.map((w) => w._id) } },
          {
            bin_location_id: {
              $nin: [...liveBinIds].map((id) => new Types.ObjectId(id)),
            },
          },
        ],
      })
      .lean<Lean<SkuBinAssignment>[]>();
    const orphanAssignZero = orphanAssignments.filter(
      (a) => a.quantity_on_hand === 0,
    );
    const orphanAssignStock = orphanAssignments.filter(
      (a) => a.quantity_on_hand > 0,
    );

    for (const z of deletableOrphanZones)
      plan.push({
        loai: 'Khu mồ côi',
        ma: z.zone_code,
        id: idOf(z._id),
        hanh_dong: 'XOÁ HẲN',
        ly_do: 'kho cha không còn',
      });
    for (const b of orphanBins)
      plan.push({
        loai: 'Ô mồ côi',
        ma: b.bin_code,
        id: idOf(b._id),
        hanh_dong: 'XOÁ HẲN',
        ly_do: 'kho/khu cha không còn',
      });
    for (const a of orphanAssignZero)
      plan.push({
        loai: 'Gán SKU mồ côi',
        ma: a.master_sku ?? a.seller_sku,
        id: idOf(a._id),
        hanh_dong: 'XOÁ HẲN',
        ly_do: 'tồn 0, trỏ tới kho/ô không còn',
      });
    for (const a of orphanAssignStock)
      plan.push({
        loai: 'Gán SKU mồ côi',
        ma: a.master_sku ?? a.seller_sku,
        id: idOf(a._id),
        hanh_dong: 'GIỮ — CẦN KIỂM TRA',
        ly_do: `còn tồn ${String(a.quantity_on_hand)}, trỏ tới kho/ô không còn`,
      });

    console.log(
      `${apply ? '🧹 XOÁ THẬT' : '🔎 CHẠY THỬ (không ghi DB)'} — phạm vi: ${all ? 'mọi kho' : `${String(scope.length)} kho đã chọn`}`,
    );
    if (plan.length === 0) {
      console.log('✅ Không có gì cần dọn.');
      return;
    }
    console.table(plan);
    const toDelete = plan.filter((p) => p.hanh_dong === 'XOÁ HẲN').length;
    const binCount =
      purgeBins.length +
      bins.filter(
        (b) =>
          purgeZones.some((z) => idOf(z._id) === idOf(b.zone_id)) ||
          purgeWarehouses.some((w) => idOf(w._id) === idOf(b.warehouse_id)),
      ).length +
      orphanBins.length;
    if (toDelete === 0) {
      console.log(
        'Không có mục nào xoá được — mọi mục đều đã dùng (muốn ẩn thì dùng DELETE thường).',
      );
      return;
    }
    if (!apply) {
      console.log(
        `→ ${String(toDelete)} mục sẽ bị xoá (tổng ${String(binCount)} ô). Kiểm tra bảng trên rồi chạy lại với --apply để xoá thật.`,
      );
      return;
    }

    // ---- 4. Backup TRƯỚC khi xoá (đủ để khôi phục bằng insertMany nếu cần) ----
    const purgeBinIds = [
      ...purgeBins.map((b) => b._id),
      ...bins
        .filter((b) => purgeZones.some((z) => idOf(z._id) === idOf(b.zone_id)))
        .map((b) => b._id),
    ];
    const backup = {
      created_at: new Date().toISOString(),
      warehouses: purgeWarehouses,
      zones: [
        ...purgeZones,
        ...deletableOrphanZones,
        ...zones.filter((z) =>
          purgeWarehouses.some((w) => idOf(w._id) === idOf(z.warehouse_id)),
        ),
      ],
      bin_locations: [
        ...orphanBins,
        ...bins.filter(
          (b) =>
            purgeBinIds.some((id) => idOf(id) === idOf(b._id)) ||
            purgeWarehouses.some((w) => idOf(w._id) === idOf(b.warehouse_id)),
        ),
      ],
      sku_bin_assignments: [
        ...orphanAssignZero,
        ...(await assignmentModel
          .find({
            quantity_on_hand: 0,
            $or: [
              { warehouse_id: { $in: purgeWarehouses.map((w) => w._id) } },
              { bin_location_id: { $in: purgeBinIds } },
            ],
          })
          .lean()),
      ],
    };
    const dir = join(__dirname, '..', 'backups');
    mkdirSync(dir, { recursive: true });
    const file = join(
      dir,
      `warehouse-cleanup-${backup.created_at.replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`💾 Đã backup vào ${file}`);

    // ---- 5. Xoá — kho/khu/ô gọi ĐÚNG hàm của API (tự kiểm tra lại, mỗi mục 1 transaction) ----
    const total = { warehouses: 0, zones: 0, bins: 0, assignments: 0 };
    const skipped: string[] = [];
    const run = async (
      label: string,
      fn: () => Promise<typeof total>,
    ): Promise<void> => {
      try {
        const r = await fn();
        total.warehouses += r.warehouses;
        total.zones += r.zones;
        total.bins += r.bins;
        total.assignments += r.assignments;
      } catch (err: unknown) {
        // Dữ liệu đổi giữa lúc lập kế hoạch và lúc xoá (VD vừa nhập hàng) → bỏ qua, không xoá.
        if (err instanceof AppException)
          skipped.push(`${label}: ${err.message}`);
        else throw err;
      }
    };
    for (const w of purgeWarehouses)
      await run(`Kho ${w.warehouse_code}`, () =>
        service.purgeWarehouse(idOf(w._id)),
      );
    for (const z of purgeZones)
      await run(`Khu ${z.zone_code}`, () => service.purgeZone(idOf(z._id)));
    for (const b of purgeBins)
      await run(`Ô ${b.bin_code}`, () => service.purgeBin(idOf(b._id)));

    // Mồ côi: hàm purge cần kho/khu cha nên xoá trực tiếp, chung 1 transaction,
    // vẫn kèm điều kiện an toàn (ô chưa dùng, dòng gán tồn 0) ngay trong lệnh xoá.
    if (
      deletableOrphanZones.length +
        orphanBins.length +
        orphanAssignZero.length >
      0
    ) {
      await connection.transaction(async (session) => {
        const a = await assignmentModel.deleteMany(
          {
            _id: { $in: orphanAssignZero.map((x) => x._id) },
            quantity_on_hand: 0,
          },
          { session },
        );
        const b = await binModel.deleteMany(
          { _id: { $in: orphanBins.map((x) => x._id) } },
          { session },
        );
        const z = await zoneModel.deleteMany(
          { _id: { $in: deletableOrphanZones.map((x) => x._id) } },
          { session },
        );
        total.assignments += a.deletedCount;
        total.bins += b.deletedCount;
        total.zones += z.deletedCount;
      });
    }

    console.log(
      `✅ Đã xoá: ${String(total.warehouses)} kho, ${String(total.zones)} khu, ${String(total.bins)} ô, ${String(total.assignments)} dòng gán SKU (tồn 0).`,
    );
    if (skipped.length > 0) {
      console.log('⚠️ Bỏ qua (dữ liệu vừa thay đổi, đã có hàng/lịch sử):');
      for (const s of skipped) console.log(`   - ${s}`);
    }
    if (orphanAssignStock.length > 0) {
      console.log(
        `⚠️ ${String(orphanAssignStock.length)} dòng gán mồ côi CÒN TỒN chưa xoá — cần kiểm tra số hàng thật trước.`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
