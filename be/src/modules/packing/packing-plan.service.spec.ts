import { Types } from 'mongoose';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { item, jean, sampleBoxes, shoebox, tee } from '../packaging/engine/scenarios/order-scenarios';
import type { PackableItem } from '../../common/interfaces/packaging.interface';
import { PackingPlanService, type CpSatTask } from './packing-plan.service';
import { PackingJobService } from './packing-job.service';
import { PACKING_ERROR_CODES } from './packing.errors';
import type { PackingPlanDocument } from './schemas/packing-plan.schema';

jest.setTimeout(60_000);

/**
 * ===================================================================
 * PackingPlanService — kế hoạch 1/nhóm (04/10/2026, đợt 3)
 * ===================================================================
 * Dùng BỘ GIẢI THẬT (BRKGA + validator) và kho dữ liệu giả trong bộ nhớ,
 * để kiểm luồng nghiệp vụ: tính → duyệt/chỉnh/từ chối → đóng gói, khóa
 * lạc quan theo `version`, và chuyển trạng thái nhóm trong transaction.
 * ===================================================================
 */

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

/** Model giả tối giản: lưu 1 tập document, hỗ trợ đúng các truy vấn service dùng. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- kiểu suy ra từ object literal là đủ cho test
function fakePlanModel() {
  const docs: Doc[] = [];
  const matches = (d: Doc, f: Record<string, unknown>): boolean =>
    Object.entries(f).every(([k, v]) => {
      const actual = d[k];
      if (k === '_id') return String(actual) === String(v);
      if (v && typeof v === 'object' && '$ne' in v) return actual !== v.$ne;
      if (actual instanceof Types.ObjectId) return String(actual) === String(v);
      return actual === v;
    });
  const hydrate = (d: Doc): Doc =>
    Object.assign(structuredClone(d), {
      _id: d._id,
      order_group_id: d.order_group_id,
      orders: (d.orders as Doc[] | undefined)?.map((o) => ({ ...o })) ?? [],
      parcels: (d.parcels as Doc[] | undefined)?.map((p) => ({ ...p })) ?? [],
    });
  const applyUpdate = (d: Doc, update: Record<string, unknown>): void => {
    const set = (update.$set ?? (update.$inc || update.$push ? {} : update)) as Record<string, unknown>;
    for (const [k, v] of Object.entries(set)) {
      if (k.includes('.')) {
        const [root, index, field] = k.split('.') as [string, string, string];
        const arr = d[root] as Record<string, unknown>[];
        const item = arr[Number(index)];
        if (item) item[field] = v;
      } else d[k] = v;
    }
    for (const [k, v] of Object.entries((update.$inc ?? {}) as Record<string, number>))
      d[k] = (d[k] as number) + v;
    for (const [k, v] of Object.entries((update.$push ?? {}) as Record<string, unknown>))
      d[k] = [...((d[k] as unknown[] | undefined) ?? []), v];
  };
  const model = {
    docs,
    create: jest.fn((data: Record<string, unknown>) => {
      if (data.is_active && docs.some((d) => d.is_active && String(d.order_group_id) === String(data.order_group_id)))
        return Promise.reject(Object.assign(new Error('dup'), { code: 11000 }));
      const doc = { _id: new Types.ObjectId(), orders: [], parcels: [], adjustments: [], ...data } as Doc;
      docs.push(doc);
      return Promise.resolve(hydrate(doc));
    }),
    findOne: jest.fn((f: Record<string, unknown>) => {
      const found = docs.filter((d) => matches(d, f)).sort((a, b) => (b.revision as number) - (a.revision as number))[0];
      const result = found ? hydrate(found) : null;
      const chain = {
        sort: () => chain,
        select: () => chain,
        lean: () => Promise.resolve(result),
        session: () => Promise.resolve(result),
        then: (r: (v: unknown) => unknown, e?: (x: unknown) => unknown) => Promise.resolve(result).then(r, e),
      };
      return chain;
    }),
    findOneAndUpdate: jest.fn((f: Record<string, unknown>, update: Record<string, unknown>) => {
      const found = docs.find((d) => matches(d, f));
      if (!found) return Promise.resolve(null);
      applyUpdate(found, update);
      return Promise.resolve(hydrate(found));
    }),
    updateOne: jest.fn((f: Record<string, unknown>, update: Record<string, unknown>) => {
      const found = docs.find((d) => matches(d, f));
      if (found) applyUpdate(found, update);
      return Promise.resolve({ matchedCount: found ? 1 : 0 });
    }),
    find: jest.fn((f: Record<string, unknown>) => {
      const ids = ((f.order_group_id as { $in?: unknown[] } | undefined)?.$in ?? []).map(String);
      const res = docs.filter((d) => d.is_active === f.is_active && ids.includes(String(d.order_group_id)));
      return { select: () => ({ lean: () => Promise.resolve(res) }) };
    }),
  };
  return model;
}

describe('PackingPlanService', () => {
  const userId = new Types.ObjectId().toString();
  let groupId: string;
  let group: { _id: Types.ObjectId; fulfillment_status: GroupFulfillmentStatus; __v: number };
  let allocations: { order_id: string; platform_order_id: string; items: PackableItem[] }[];
  let planModel: ReturnType<typeof fakePlanModel>;
  let orderGroupsService: {
    findOrderGroupById: jest.Mock;
    allocatePickedItemsToOrders: jest.Mock;
    assertHasActiveOrders: jest.Mock;
    transitionFulfillmentStatus: jest.Mock;
  };
  let boxService: {
    listActiveSpecs: jest.Mock;
    findActiveSpecByCode: jest.Mock;
    listAvailability: jest.Mock;
    consumeForPack: jest.Mock;
  };
  let materialService: { planningData: jest.Mock; consumeForPack: jest.Mock };
  let notificationsService: {
    notify: jest.Mock;
    buildPendingPackagingPlanMessage: jest.Mock;
    buildPackagingRejectedMessage: jest.Mock;
    buildAbnormalPackageMessage: jest.Mock;
  };
  let guideAi: { writeGuide: jest.Mock };
  let service: PackingPlanService;
  let stock: Map<string, number>;

  beforeEach(() => {
    group = { _id: new Types.ObjectId(), fulfillment_status: GroupFulfillmentStatus.PICKED, __v: 3 };
    groupId = group._id.toString();
    allocations = [
      { order_id: new Types.ObjectId().toString(), platform_order_id: 'DEMO-1', items: [tee(2), jean(1)] },
      { order_id: new Types.ObjectId().toString(), platform_order_id: 'DEMO-2', items: [shoebox(2)] },
    ];
    stock = new Map([
      ['SAMPLE-S', 50],
      ['SAMPLE-M', 50],
      ['SAMPLE-L', 50],
    ]);
    planModel = fakePlanModel();
    orderGroupsService = {
      findOrderGroupById: jest.fn(() => Promise.resolve({ ...group })),
      allocatePickedItemsToOrders: jest.fn(() => Promise.resolve(allocations)),
      assertHasActiveOrders: jest.fn(() => Promise.resolve()),
      transitionFulfillmentStatus: jest.fn((_id: string, target: GroupFulfillmentStatus, expected: number) => {
        if (expected !== group.__v) return Promise.reject(new Error('conflict'));
        group = { ...group, fulfillment_status: target, __v: group.__v + 1 };
        return Promise.resolve(group);
      }),
    };
    boxService = {
      listActiveSpecs: jest.fn(() => Promise.resolve(sampleBoxes())),
      findActiveSpecByCode: jest.fn((code: string) =>
        Promise.resolve(sampleBoxes().find((b) => b.code === code)),
      ),
      listAvailability: jest.fn(() =>
        Promise.resolve(
          new Map(
            [...stock].map(([code, n]) => [code, { onHand: n, reserved: 0, available: n, reorderLevel: 2 }]),
          ),
        ),
      ),
      consumeForPack: jest.fn(() => Promise.resolve([])),
    };
    materialService = {
      planningData: jest.fn(() => Promise.resolve({ catalog: [], rules: [] })),
      consumeForPack: jest.fn(() => Promise.resolve({ consumed: [], shortfalls: [] })),
    };
    notificationsService = {
      notify: jest.fn(() => Promise.resolve()),
      buildPendingPackagingPlanMessage: jest.fn(() => ({ title: 't', message: 'm' })),
      buildPackagingRejectedMessage: jest.fn(() => ({ title: 't', message: 'm' })),
      buildAbnormalPackageMessage: jest.fn(() => ({ title: 't', message: 'm' })),
    };
    guideAi = {
      writeGuide: jest.fn(() =>
        Promise.resolve({ source: 'template', model: null, fallback_reason: 'no_api_key', summary: 's', steps: [] }),
      ),
    };
    const connection = {
      startSession: () =>
        Promise.resolve({
          withTransaction: (fn: () => Promise<unknown>) => fn(),
          endSession: () => Promise.resolve(),
        }),
    };
    service = new PackingPlanService(
      planModel as never,
      connection as never,
      orderGroupsService as never,
      boxService as never,
      materialService as never,
      { namesByCode: jest.fn(() => Promise.resolve(new Map())) } as never,
      guideAi as never,
      notificationsService as never,
      { get: () => null } as never, // không có CP-SAT
    );
  });

  async function computed(): Promise<PackingPlanDocument> {
    const { plan } = await service.compute(groupId);
    return plan;
  }

  describe('compute', () => {
    it('ghi kế hoạch ready cho MỌI đơn, kiện đánh số 1..N, nhóm → pending_approval, báo Packaging Staff', async () => {
      const plan = await computed();
      expect(plan.status).toBe('ready');
      expect(plan.revision).toBe(1);
      expect(plan.orders).toHaveLength(2);
      expect(plan.parcels.map((p) => p.parcel_no)).toEqual(
        Array.from({ length: plan.parcels.length }, (_, i) => i + 1),
      );
      expect(plan.orders.every((o) => o.status === 'ok')).toBe(true);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PENDING_APPROVAL);
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    });

    it('không có CP-SAT: đơn cần chứng minh thêm ghi cp_sat = unavailable, còn lại skipped; không tạo việc nền', async () => {
      const { plan, tasks } = await service.compute(groupId);
      expect(tasks).toEqual([]);
      expect(plan.orders.every((o) => ['skipped', 'unavailable'].includes(o.cp_sat))).toBe(true);
    });

    it('nhóm chưa lấy hàng xong → PACKING_WRONG_PLAN_STATUS', async () => {
      group.fulfillment_status = GroupFulfillmentStatus.PICKING;
      await expect(service.compute(groupId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS,
      });
    });

    it('đang có kế hoạch hoạt động → PACKING_PLAN_COMPUTING (khóa chống tính trùng)', async () => {
      await computed();
      group.fulfillment_status = GroupFulfillmentStatus.PICKED;
      await expect(service.compute(groupId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.PLAN_COMPUTING,
      });
    });

    it('lỗi dữ liệu (vd hồ sơ SKU chưa sẵn sàng) → kế hoạch failed kèm lý do, nhóm giữ nguyên', async () => {
      orderGroupsService.allocatePickedItemsToOrders.mockRejectedValue(new Error('Hồ sơ SKU X chưa sẵn sàng'));
      await expect(service.compute(groupId)).rejects.toThrow('Hồ sơ SKU X');
      const failed = planModel.docs[0];
      expect(failed?.status).toBe('failed');
      expect(failed?.failure_reason).toMatch(/Hồ sơ SKU X/);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);
    });

    it('kho dư thùng → không có gợi ý kho thùng', async () => {
      const plan = await computed();
      expect(plan.orders.every((o) => o.stock_suggestion === null)).toBe(true);
    });

    it('kho hết thùng vừa hơn → gợi ý đúng thùng thiếu, lấp đầy và tiền rẻ hơn', async () => {
      allocations = [{ order_id: new Types.ObjectId().toString(), platform_order_id: 'DEMO-1', items: [tee(2), jean(1)] }];
      stock = new Map([
        ['SAMPLE-S', 0],
        ['SAMPLE-M', 0],
        ['SAMPLE-L', 50],
      ]);
      const plan = await computed();
      const order = plan.orders[0];
      expect(plan.parcels.map((p) => p.box.code)).toEqual(['SAMPLE-L']);
      expect(order?.stock_suggestion).toMatchObject({
        parcels: 1,
        current_parcels: 1,
        saving_vnd: 3500,
        missing: [{ box_code: 'SAMPLE-M', needed: 1, available: 0 }],
      });
      expect(order?.stock_suggestion?.avg_fill).toBeGreaterThan(order?.stock_suggestion?.current_avg_fill ?? 1);
      expect(order?.explanation.some((l) => l.startsWith('Nếu kho có đủ thùng SAMPLE-M (thiếu 1)'))).toBe(true);
    });

    it('đơn lớn hơn giới hạn CP-SAT mà chưa chứng minh được → ghi rõ vì sao chỉ là phương án tốt nhất tìm được', async () => {
      allocations = [
        {
          order_id: new Types.ObjectId().toString(),
          platform_order_id: 'DEMO-SI',
          items: [
            item('DEMO-TEE', [36, 24, 4], 0.22, { qty: 40, category: 't_shirt', stackKg: 2, fold: true }),
            item('DEMO-JEAN', [38, 30, 6], 0.65, { qty: 12, category: 'trousers', stackKg: 3, fold: true }),
          ],
        },
      ];
      const plan = await computed();
      const order = plan.orders[0];
      expect(order?.proof).toBe('heuristic');
      expect(order?.explanation.some((l) => l.includes('vượt giới hạn 12 món'))).toBe(true);
    });

    it('tôn trọng loại trừ thùng khi tính lại có điều kiện', async () => {
      const { plan } = await service.compute(groupId, { exclude_box_codes: ['SAMPLE-M', 'SAMPLE-S'] });
      expect(plan.parcels.every((p) => p.box.code === 'SAMPLE-L')).toBe(true);
      expect(plan.solver.options.exclude_box_codes).toEqual(['SAMPLE-M', 'SAMPLE-S']);
    });
  });

  describe('duyệt / tính lại / từ chối', () => {
    it('approve đúng version → approved, nhóm approved_for_packing, version tăng', async () => {
      const plan = await computed();
      const approved = await service.approve(groupId, plan.version, userId);
      expect(approved.status).toBe('approved');
      expect(approved.version).toBe(plan.version + 1);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
    });

    it('approve với version cũ → PACKING_VERSION_CONFLICT', async () => {
      const plan = await computed();
      await expect(service.approve(groupId, plan.version + 5, userId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.VERSION_CONFLICT,
      });
    });

    it('approve khi còn đơn chưa xếp hết món → PACKING_HAS_UNPLACED', async () => {
      stock = new Map([
        ['SAMPLE-S', 0],
        ['SAMPLE-M', 0],
        ['SAMPLE-L', 0],
      ]);
      const plan = await computed();
      expect(plan.orders.some((o) => o.status !== 'ok')).toBe(true);
      await expect(service.approve(groupId, plan.version, userId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.HAS_UNPLACED,
      });
    });

    it('recompute: kế hoạch cũ superseded, nhóm về picked rồi tính lần 2', async () => {
      const plan = await computed();
      const { plan: next } = await service.recompute(groupId, { expected_version: plan.version, prefer: 'cheapest' });
      expect(next.revision).toBe(2);
      expect(planModel.docs[0]?.status).toBe('superseded');
      expect(planModel.docs[0]?.is_active).toBe(false);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PENDING_APPROVAL);
    });

    it('reject: kế hoạch rejected (vẫn hoạt động — cron không tự tính lại), nhóm về picked, báo Admin', async () => {
      const plan = await computed();
      const rejected = await service.reject(groupId, plan.version, 'Đóng thùng gỗ ngoài hệ thống', userId);
      expect(rejected.status).toBe('rejected');
      expect(rejected.is_active).toBe(true);
      expect(rejected.rejection_reason).toBe('Đóng thùng gỗ ngoài hệ thống');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);
      expect(notificationsService.notify).toHaveBeenCalledTimes(2); // chờ duyệt + bị từ chối
    });
  });

  describe('chỉnh tay', () => {
    it('đổi thùng: xếp lại vào thùng mới, ghi lịch sử, nhãn đơn thành heuristic, version tăng', async () => {
      const plan = await computed();
      const target = plan.parcels[0];
      if (!target) throw new Error('thiếu kiện');
      const updated = await service.changeBox(
        groupId,
        target.parcel_no,
        { box_code: 'SAMPLE-L', reason: 'RECOMMENDED_BOX_NOT_IN_STOCK', expected_version: plan.version },
        userId,
      );
      expect(updated.parcels[0]?.box.code).toBe('SAMPLE-L');
      expect(updated.version).toBe(plan.version + 1);
      expect(updated.adjustments).toHaveLength(1);
      const order = updated.orders.find((o) => o.order_id.equals(target.order_id));
      expect(order?.proof).toBe('heuristic');
    });

    it('đổi sang thùng không vừa → PACKING_BOX_DOES_NOT_FIT', async () => {
      const plan = await computed();
      const shoes = plan.parcels.find((p) => p.platform_order_id === 'DEMO-2');
      if (!shoes) throw new Error('thiếu kiện giày');
      await expect(
        service.changeBox(
          groupId,
          shoes.parcel_no,
          { box_code: 'SAMPLE-S', reason: 'OTHER', note: 'thử', expected_version: plan.version },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.BOX_DOES_NOT_FIT });
    });

    it('lý do "Khác" không ghi chú → PACKING_NOTE_REQUIRED', async () => {
      const plan = await computed();
      await expect(
        service.changeBox(groupId, 1, { box_code: 'SAMPLE-L', reason: 'OTHER', expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.NOTE_REQUIRED });
    });

    it('tách 1 món ra kiện mới: thêm 1 kiện, mọi món vẫn có đúng 1 chỗ', async () => {
      const plan = await computed();
      const first = plan.parcels[0];
      const key = first?.placements[0]?.item_key;
      if (!first || !key) throw new Error('thiếu dữ liệu');
      const updated = await service.moveItem(
        groupId,
        first.parcel_no,
        { item_key: key, reason: 'PRODUCT_MORE_FRAGILE_THAN_EXPECTED', expected_version: plan.version },
        userId,
      );
      expect(updated.parcels.length).toBe(plan.parcels.length + 1);
      const keys = updated.parcels.flatMap((p) => p.placements.map((q) => q.item_key));
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.sort()).toEqual(plan.parcels.flatMap((p) => p.placements.map((q) => q.item_key)).sort());
      expect(updated.parcels.map((p) => p.parcel_no)).toEqual(updated.parcels.map((_, i) => i + 1));
    });

    it('không cho chuyển món sang kiện của đơn khác', async () => {
      const plan = await computed();
      const a = plan.parcels.find((p) => p.platform_order_id === 'DEMO-1');
      const b = plan.parcels.find((p) => p.platform_order_id === 'DEMO-2');
      const key = a?.placements[0]?.item_key;
      if (!a || !b || !key) throw new Error('thiếu dữ liệu');
      await expect(
        service.moveItem(
          groupId,
          a.parcel_no,
          { item_key: key, to_parcel_no: b.parcel_no, reason: 'OTHER', note: 'x', expected_version: plan.version },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.MOVE_ACROSS_ORDERS });
    });

    it('không chỉnh tay được sau khi đã duyệt', async () => {
      const plan = await computed();
      const approved = await service.approve(groupId, plan.version, userId);
      await expect(
        service.changeBox(
          groupId,
          1,
          { box_code: 'SAMPLE-L', reason: 'OTHER', note: 'x', expected_version: approved.version },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });
    });
  });

  describe('đóng gói', () => {
    async function approvedPlan(): Promise<PackingPlanDocument> {
      const plan = await computed();
      return service.approve(groupId, plan.version, userId);
    }

    it('cân đủ mọi kiện → packed, trừ 1 thùng/kiện, đánh dấu kiện lệch > 20%, nhóm packed', async () => {
      const plan = await approvedPlan();
      const weights = plan.parcels.map((p, i) => ({
        parcel_no: p.parcel_no,
        // kiện đầu cân lệch gấp đôi để thành bất thường
        weight_kg: i === 0 ? (p.estimated_weight_g / 1000) * 2 : p.estimated_weight_g / 1000,
      }));
      const packed = await service.pack(groupId, { parcels: weights, expected_version: plan.version }, userId);
      expect(packed.status).toBe('packed');
      expect(packed.parcels[0]?.is_abnormal).toBe(true);
      expect(packed.parcels.slice(1).every((p) => !p.is_abnormal)).toBe(true);
      const consumed = boxService.consumeForPack.mock.calls[0] as unknown as [unknown, { parcelNo: number }[]];
      expect(consumed[1].map((c) => c.parcelNo)).toEqual(plan.parcels.map((p) => p.parcel_no));
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PACKED);
    });

    it('thiếu cân 1 kiện hoặc gửi trùng → PACKING_PACK_WEIGHTS_MISMATCH', async () => {
      const plan = await approvedPlan();
      const [first] = plan.parcels;
      if (!first) throw new Error('thiếu kiện');
      await expect(
        service.pack(groupId, { parcels: [{ parcel_no: first.parcel_no, weight_kg: 1 }], expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PACK_WEIGHTS_MISMATCH });
      await expect(
        service.pack(
          groupId,
          {
            parcels: [
              { parcel_no: first.parcel_no, weight_kg: 1 },
              { parcel_no: first.parcel_no, weight_kg: 1 },
            ],
            expected_version: plan.version,
          },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PACK_WEIGHTS_MISMATCH });
    });

    it('chưa duyệt thì không đóng được', async () => {
      const plan = await computed();
      await expect(
        service.pack(groupId, { parcels: [{ parcel_no: 1, weight_kg: 1 }], expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });
    });
  });

  describe('hướng dẫn', () => {
    it('tạo hướng dẫn cho 1 kiện, lưu lại, lần sau không gọi AI nữa (trừ khi viết lại)', async () => {
      await computed();
      await service.getOrCreateGuide(groupId, 1, false);
      await service.getOrCreateGuide(groupId, 1, false);
      expect(guideAi.writeGuide).toHaveBeenCalledTimes(1);
      await service.getOrCreateGuide(groupId, 1, true);
      expect(guideAi.writeGuide).toHaveBeenCalledTimes(2);
    });
  });

  describe('CP-SAT nền', () => {
    it('không có service CP-SAT → đánh dấu unavailable, không đổi phương án', async () => {
      const plan = await computed();
      const doc = planModel.docs[0];
      if (!doc) throw new Error('thiếu kế hoạch');
      const orders = doc.orders as Record<string, unknown>[];
      const first = orders[0];
      if (!first) throw new Error('thiếu đơn');
      first.cp_sat = 'pending';
      const task = {
        planId: plan._id,
        revision: plan.revision,
        orderId: String(first.order_id),
        units: [],
        result: { parcels: [] },
        availability: new Map(),
      } as unknown as CpSatTask;
      await service.runCpSat([task]);
      expect((planModel.docs[0]?.orders as Record<string, unknown>[])[0]?.cp_sat).toBe('unavailable');
      expect(planModel.docs[0]?.version).toBe(plan.version);
    });
  });

  describe('PackingJobService (tự tính khi lấy hàng xong)', () => {
    it('tính cho nhóm picked chưa có kế hoạch; bỏ qua nhóm đã có', async () => {
      const groupModel = {
        find: jest.fn(() => ({
          select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([{ _id: group._id }]) }) }) }),
        })),
      };
      const job = new PackingJobService(groupModel as never, planModel as never, service);
      expect(await job.computePending()).toBe(1);
      group.fulfillment_status = GroupFulfillmentStatus.PICKED; // giả lập: vẫn picked nhưng đã có kế hoạch
      expect(await job.computePending()).toBe(0);
    });
  });
});
