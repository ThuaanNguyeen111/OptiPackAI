import mongoose from 'mongoose';

/**
 * ===================================================================
 * SKU chặn nhiều nhóm đơn nhất (24/11/2026)
 * ===================================================================
 * CHỈ ĐỌC. Nhóm đơn không lập được kế hoạch đóng gói vì hồ sơ SKU chưa `ready` được ghi ở
 * `order_groups.packing_blocked_skus`. Script đếm mỗi SKU đang chặn bao nhiêu nhóm, để kho đo
 * SKU chặn nhiều trước; kèm cờ "đã có số đo sàn" (marketplace_dimension) để tham khảo khi đo.
 *
 * Chạy:  npx ts-node --transpile-only -r dotenv/config scripts/report-blocked-skus.ts [--top=30]
 * ===================================================================
 */

interface BlockedRow {
  _id: { platform: string; shop_id: string; sku: string };
  groups: number;
  reasons: string[];
  oldest: Date | null;
}

interface ProfileRow {
  seller_sku: string;
  platform: string;
  shop_id: string;
  packaging_profile_status?: string;
  product_category?: string | null;
  marketplace_dimension?: { package_length_cm?: number } | null;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  const topArg = Number(
    process.argv.find((a) => a.startsWith('--top='))?.slice(6) ?? 30,
  );
  const top = Number.isInteger(topArg) && topArg > 0 ? topArg : 30;
  await mongoose.connect(uri);
  const db = mongoose.connection;

  const rows = await db
    .collection('order_groups')
    .aggregate<BlockedRow>([
      { $match: { packing_blocked_reason: { $type: 'string' } } },
      { $unwind: '$packing_blocked_skus' },
      {
        $group: {
          _id: {
            platform: '$platform',
            shop_id: '$shop_id',
            sku: '$packing_blocked_skus',
          },
          groups: { $sum: 1 },
          reasons: { $addToSet: '$packing_blocked_reason' },
          oldest: { $min: '$packing_blocked_at' },
        },
      },
      { $sort: { groups: -1, oldest: 1 } },
    ])
    .toArray();
  const blockedGroups = await db
    .collection('order_groups')
    .countDocuments({ packing_blocked_reason: { $type: 'string' } });

  const profiles = new Map(
    (
      await db
        .collection<ProfileRow>('product_master')
        .find({ seller_sku: { $in: rows.map((r) => r._id.sku) } })
        .project<ProfileRow>({
          seller_sku: 1,
          platform: 1,
          shop_id: 1,
          packaging_profile_status: 1,
          product_category: 1,
          marketplace_dimension: 1,
        })
        .toArray()
    ).map((p) => [`${p.platform}|${p.shop_id}|${p.seller_sku}`, p]),
  );

  console.log(
    JSON.stringify(
      { nhom_don_dang_bi_chan: blockedGroups, sku_dang_chan: rows.length },
      null,
      2,
    ),
  );
  if (rows.length === 0) {
    await mongoose.disconnect();
    return;
  }
  console.table(
    rows.slice(0, top).map((r) => {
      const p = profiles.get(`${r._id.platform}|${r._id.shop_id}|${r._id.sku}`);
      return {
        shop_id: r._id.shop_id,
        sku: r._id.sku,
        nhom_bi_chan: r.groups,
        ly_do: r.reasons.join(', '),
        trang_thai: p
          ? (p.packaging_profile_status ?? 'thiếu trạng thái')
          : 'chưa có hồ sơ',
        loai: p?.product_category ?? '-',
        co_so_do_san: p?.marketplace_dimension?.package_length_cm
          ? 'có'
          : 'không',
        chan_tu: r.oldest ? r.oldest.toISOString().slice(0, 10) : '-',
      };
    }),
  );
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exitCode = 1;
});
