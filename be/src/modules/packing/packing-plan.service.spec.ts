import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { item, jean, sampleBoxes, shoebox, tee } from '../packaging/engine/scenarios/order-scenarios';
import type { PackableItem } from '../../common/interfaces/packaging.interface';
import { PackingPlanService, type CpSatTask } from './packing-plan.service';
import { PackingJobService } from './packing-job.service';
import { PackingSessionService } from './packing-session.service';
import { DEFAULT_PACKING_SETTINGS, type ActivePackingSettings } from './packing-settings.service';
import { sunglasses } from '../packaging/engine/scenarios/order-scenarios';
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
      if (v && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).map(String).includes(String(actual));
      if (v && typeof v === 'object' && '$ne' in v) return actual !== v.$ne;
      if (actual instanceof Types.ObjectId) return String(actual) === String(v);
      return actual === v;
    });
  const copyParcel = (p: Doc): Doc => ({
    ...p,
    scans: [...((p.scans as unknown[] | undefined) ?? [])],
    weighings: [...((p.weighings as unknown[] | undefined) ?? [])],
    reviews: [...((p.reviews as unknown[] | undefined) ?? [])],
  });
  const hydrate = (d: Doc): Doc => {
    const plain = (): Doc => ({
      ...d,
      orders: (d.orders as Doc[] | undefined)?.map((o) => ({ ...o })) ?? [],
      parcels: (d.parcels as Doc[] | undefined)?.map(copyParcel) ?? [],
      issues: [...((d.issues as unknown[] | undefined) ?? [])],
      activity: [...((d.activity as unknown[] | undefined) ?? [])],
    });
    return Object.assign(plain(), { toObject: plain });
  };
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
  const createOne = (data: Record<string, unknown>): Promise<Doc> => {
    if (data.is_active && docs.some((d) => d.is_active && String(d.order_group_id) === String(data.order_group_id)))
      return Promise.reject(Object.assign(new Error('dup'), { code: 11000 }));
    const doc = {
      _id: new Types.ObjectId(),
      orders: [],
      parcels: [],
      adjustments: [],
      issues: [],
      activity: [],
      assigned_packer_id: null,
      ...data,
    } as Doc;
    docs.push(doc);
    return Promise.resolve(hydrate(doc));
  };
  const model = {
    docs,
    distinct: jest.fn((field: string, f: Record<string, unknown>) =>
      Promise.resolve([...new Map(docs.filter((d) => matches(d, f)).map((d) => [String(d[field]), d[field]])).values()]),
    ),
    create: jest.fn((input: Record<string, unknown> | Record<string, unknown>[]) =>
      Array.isArray(input) ? Promise.all(input.map(createOne)) : createOne(input),
    ),
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
    adjustPickedUnits: jest.Mock;
    takeReplacementUnit: jest.Mock;
    reconcileReservation: jest.Mock;
  };
  let boxService: {
    listActiveSpecs: jest.Mock;
    findActiveSpecByCode: jest.Mock;
    listAvailability: jest.Mock;
    consumeForPack: jest.Mock;
    recordWaste: jest.Mock;
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
  let session: PackingSessionService;
  let settings: ActivePackingSettings;
  let materialsService: { recoverFromUnpack: jest.Mock };
  let bagService: { consumeForParcels: jest.Mock };
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
      adjustPickedUnits: jest.fn(() => Promise.resolve({ restocked: 1, withoutLocation: 0 })),
      takeReplacementUnit: jest.fn(() => Promise.resolve({ binLocationId: 'b', remainingStock: 4 })),
      reconcileReservation: jest.fn(() => Promise.resolve()),
    };
    settings = { ...DEFAULT_PACKING_SETTINGS };
    bagService = { consumeForParcels: jest.fn(() => Promise.resolve({ consumed: [], shortfalls: [] })) };
    materialsService = {
      recoverFromUnpack: jest.fn((lines: { code: string; quantity: number }[]) =>
        Promise.resolve(lines.map((l) => ({ code: l.code, quantity: l.quantity, outcome: 'reused' }))),
      ),
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
      recordWaste: jest.fn(() => Promise.resolve({ taken: 1, unitCostVnd: 3000 })),
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
      { get: () => Promise.resolve(settings) } as never,
      { assignOnReady: jest.fn(() => Promise.resolve(null)) } as never,
    );
    session = new PackingSessionService(
      planModel as never,
      { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) } as never, // chưa nối SKU nội bộ
      connection as never,
      service,
      orderGroupsService as never,
      boxService as never,
      materialService as never,
      materialsService as never,
      { get: () => Promise.resolve(settings) } as never,
      notificationsService as never,
      bagService as never,
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

    it('reject: lý do theo mã, có hạn xử lý, kế hoạch rejected vẫn hoạt động, nhóm về picked, báo Admin + Store Owner', async () => {
      const plan = await computed();
      const rejected = await service.reject(groupId, plan.version, 'BOX_TOO_TIGHT', 'Thùng chật hơn dự kiến', userId);
      expect(rejected.status).toBe('rejected');
      expect(rejected.is_active).toBe(true);
      expect(rejected.rejection_reason_code).toBe('BOX_TOO_TIGHT');
      expect(rejected.rejection_reason).toBe('BOX_TOO_TIGHT: Thùng chật hơn dự kiến');
      expect(rejected.rejection_due_at).toBeInstanceOf(Date);
      expect(rejected.rejection_owner_id).toBeNull();
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);
      expect(notificationsService.notify).toHaveBeenCalledTimes(3); // chờ duyệt + Admin + Store Owner
    });

    it('reject: giao đích danh người xử lý thì chỉ báo người đó', async () => {
      const plan = await computed();
      const owner = new Types.ObjectId().toString();
      const rejected = await service.reject(groupId, plan.version, 'ITEM_DAMAGED', undefined, userId, owner);
      expect(rejected.rejection_owner_id?.toString()).toBe(owner);
      expect(notificationsService.notify).toHaveBeenCalledTimes(2); // chờ duyệt + người xử lý
    });

    it('reject: lý do OTHER bắt buộc ghi chú', async () => {
      const plan = await computed();
      await expect(service.reject(groupId, plan.version, 'OTHER', undefined, userId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.NOTE_REQUIRED,
      });
    });

    it('recompute từ kế hoạch bị từ chối: ghi cách xử lý là recompute', async () => {
      const plan = await computed();
      const rejected = await service.reject(groupId, plan.version, 'TOO_MANY_PARCELS', undefined, userId);
      await service.recompute(groupId, { expected_version: rejected.version });
      expect(planModel.docs[0]?.rejection_resolution).toBe('recompute');
      expect(planModel.docs[0]?.rejection_resolved_at).toBeInstanceOf(Date);
    });

    describe('trả về lấy hàng sau khi từ chối', () => {
      async function rejectedPlan(): Promise<PackingPlanDocument> {
        const plan = await computed();
        return service.reject(groupId, plan.version, 'ITEM_DAMAGED', undefined, userId);
      }
      function firstSku(): string {
        const sku = allocations[0]?.items[0]?.sku;
        if (sku === undefined) throw new Error('fixture không có món');
        return sku;
      }

      it('rút món hỏng + món lấy nhầm, kế hoạch superseded, nhóm picked → picking, giữ chỗ được tính lại', async () => {
        const rejected = await rejectedPlan();
        const sku = firstSku();
        const result = await service.backToPicking(
          groupId,
          { expected_version: rejected.version, items: [{ sku, quantity: 1 }, { sku, quantity: 1, restock: true }], note: 'áo bẩn' },
          userId,
        );
        expect(result.status).toBe('superseded');
        expect(result.is_active).toBe(false);
        expect(result.rejection_resolution).toBe('back_to_picking');
        expect(result.adjustments.at(-1)?.kind).toBe('back_to_picking');
        expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKING);
        expect(orderGroupsService.adjustPickedUnits).toHaveBeenCalledWith(
          groupId,
          [{ sku, quantity: 1 }],
          expect.objectContaining({ restock: false, kind: 'pack_issue' }),
        );
        expect(orderGroupsService.adjustPickedUnits).toHaveBeenCalledWith(
          groupId,
          [{ sku, quantity: 1 }],
          expect.objectContaining({ restock: true, kind: 'reject_return' }),
        );
        expect(orderGroupsService.reconcileReservation).toHaveBeenCalledWith(groupId);
      });

      it('SKU không có trong hàng đã lấy → BACK_TO_PICKING_INVALID', async () => {
        const rejected = await rejectedPlan();
        await expect(
          service.backToPicking(groupId, { expected_version: rejected.version, items: [{ sku: 'KHONG-CO', quantity: 1 }] }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.BACK_TO_PICKING_INVALID });
      });

      it('khai vượt số đã lấy → BACK_TO_PICKING_INVALID', async () => {
        const rejected = await rejectedPlan();
        await expect(
          service.backToPicking(groupId, { expected_version: rejected.version, items: [{ sku: firstSku(), quantity: 999 }] }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.BACK_TO_PICKING_INVALID });
      });

      it('chỉ dùng được khi kế hoạch đang bị từ chối', async () => {
        const plan = await computed();
        await expect(
          service.backToPicking(groupId, { expected_version: plan.version, items: [{ sku: firstSku(), quantity: 1 }] }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });
      });
    });

    describe('đóng gói thủ công sau khi từ chối', () => {
      async function rejectedPlan(): Promise<PackingPlanDocument> {
        const plan = await computed();
        return service.reject(groupId, plan.version, 'SPECIAL_PACKING_NEEDED', undefined, userId);
      }

      /** Mỗi đơn gói tất cả món vào 1 kiện thùng `box` (cho dễ kiểm). */
      function onePerOrder(plan: PackingPlanDocument, box: string): { order_id: string; box_code: string; item_keys: string[] }[] {
        return plan.orders.map((o) => ({
          order_id: o.order_id.toString(),
          box_code: box,
          item_keys: plan.parcels
            .filter((p) => p.order_id.equals(o.order_id))
            .flatMap((p) => p.placements.map((q) => q.item_key)),
        }));
      }

      it('nhập đủ món + thùng còn tồn → kế hoạch mới source=manual, ready, nhóm pending_approval, kế hoạch cũ superseded', async () => {
        const rejected = await rejectedPlan();
        const created = await service.manualPack(
          groupId,
          { expected_version: rejected.version, parcels: onePerOrder(rejected, 'SAMPLE-L'), note: 'Khách yêu cầu gói chung' },
          userId,
        );
        expect(created.source).toBe('manual');
        expect(created.status).toBe('ready');
        expect(created.revision).toBe(rejected.revision + 1);
        expect(created.parcels).toHaveLength(2);
        expect(created.adjustments[0]?.kind).toBe('manual_pack');
        expect(created.adjustments[0]?.box_codes).toEqual(['SAMPLE-L']);
        expect(created.orders.every((o) => o.status === 'ok' && o.proof === 'heuristic')).toBe(true);
        expect(planModel.docs[0]?.status).toBe('superseded');
        expect(planModel.docs[0]?.rejection_resolution).toBe('manual');
        expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PENDING_APPROVAL);
      });

      it('chỉ dùng được khi kế hoạch đang bị từ chối', async () => {
        const plan = await computed();
        await expect(
          service.manualPack(groupId, { expected_version: plan.version, parcels: onePerOrder(plan, 'SAMPLE-L'), note: 'x y z' }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });
      });

      it('thiếu món → MANUAL_PACK_INVALID', async () => {
        const rejected = await rejectedPlan();
        const parcels = onePerOrder(rejected, 'SAMPLE-L');
        parcels[0]?.item_keys.pop();
        await expect(
          service.manualPack(groupId, { expected_version: rejected.version, parcels, note: 'thiếu món' }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.MANUAL_PACK_INVALID });
      });

      it('món trùng ở 2 kiện → MANUAL_PACK_INVALID', async () => {
        const rejected = await rejectedPlan();
        const parcels = onePerOrder(rejected, 'SAMPLE-L');
        const first = parcels[0];
        if (!first) throw new Error('thiếu dữ liệu test');
        const dup = first.item_keys[0];
        if (!dup) throw new Error('thiếu dữ liệu test');
        parcels.push({ ...first, item_keys: [dup] });
        await expect(
          service.manualPack(groupId, { expected_version: rejected.version, parcels, note: 'trùng món' }, userId),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.MANUAL_PACK_INVALID });
      });

      it('thùng hết tồn → PKG_BOX_OUT_OF_STOCK', async () => {
        const rejected = await rejectedPlan();
        stock.set('SAMPLE-L', 1); // cần 2 kiện thùng L
        await expect(
          service.manualPack(
            groupId,
            { expected_version: rejected.version, parcels: onePerOrder(rejected, 'SAMPLE-L'), note: 'hết thùng' },
            userId,
          ),
        ).rejects.toMatchObject({ errorCode: 'PKG_BOX_OUT_OF_STOCK' });
      });

      it('version cũ → xung đột', async () => {
        const rejected = await rejectedPlan();
        await expect(
          service.manualPack(
            groupId,
            { expected_version: rejected.version - 1, parcels: onePerOrder(rejected, 'SAMPLE-L'), note: 'cũ rồi' },
            userId,
          ),
        ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.VERSION_CONFLICT });
      });
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

  describe('cài đặt khi tính + duyệt', () => {
    it('chụp đệm dễ vỡ vào kế hoạch; đánh dấu kiện có hàng dễ vỡ', async () => {
      settings = { ...settings, fragileCushionMm: 8 };
      allocations = [{ order_id: new Types.ObjectId().toString(), platform_order_id: 'F-1', items: [sunglasses(1)] }];
      const plan = await computed();
      expect(plan.solver.options.fragile_cushion_mm).toBe(8);
      expect(plan.parcels.every((p) => p.has_fragile)).toBe(true);
    });

    it('vượt số kiện tối đa → duyệt phải có override_reason', async () => {
      settings = { ...settings, maxParcelsPerOrder: 1 };
      allocations = [{ order_id: new Types.ObjectId().toString(), platform_order_id: 'BIG', items: [shoebox(6)] }];
      const plan = await computed();
      expect(plan.parcels.length).toBeGreaterThan(1);
      expect(plan.orders[0]?.over_parcel_limit).toBe(true);
      await expect(service.approve(groupId, plan.version, userId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.PARCEL_LIMIT_EXCEEDED,
      });
      const approved = await service.approve(groupId, plan.version, userId, 'Khách đặt sỉ, chấp nhận nhiều kiện');
      expect(approved.status).toBe('approved');
      expect(approved.approve_override_reason).toBe('Khách đặt sỉ, chấp nhận nhiều kiện');
    });
  });

  describe('phiên đóng gói (quét + niêm phong)', () => {
    const other = new Types.ObjectId().toString();

    async function approvedPlan(): Promise<PackingPlanDocument> {
      const plan = await computed();
      return service.approve(groupId, plan.version, userId);
    }

    /** Quét đủ mọi món của 1 kiện. */
    async function scanAll(parcelNo: number): Promise<PackingPlanDocument> {
      let plan = await service.requireActivePlan(groupId);
      const parcel = plan.parcels.find((p) => p.parcel_no === parcelNo);
      if (!parcel) throw new Error('thiếu kiện');
      for (const q of parcel.placements) {
        plan = (await session.scan(groupId, parcelNo, { code: q.sku.toLowerCase(), scan_method: 'barcode' }, userId)).plan;
      }
      return plan;
    }

    const weightOf = (plan: PackingPlanDocument, parcelNo: number, factor = 1): number =>
      ((plan.parcels.find((p) => p.parcel_no === parcelNo)?.estimated_weight_g ?? 0) / 1000) * factor;

    it('quét món đầu tiên tự bắt đầu phiên (approved → packing, ghi người + giờ)', async () => {
      const plan = await approvedPlan();
      const sku = plan.parcels[0]?.placements[0]?.sku ?? '';
      const { plan: after, scan } = await session.scan(groupId, 1, { code: sku, scan_method: 'barcode' }, userId);
      expect(after.status).toBe('packing');
      expect(String(after.packing_started_by)).toBe(userId);
      expect(scan.itemKeys).toHaveLength(1);
      expect(scan.duplicate).toBe(false);
    });

    it('quét sai kiện → chỉ ra kiện đúng; mã lạ → không thuộc kế hoạch; quét thừa → bị chặn', async () => {
      const plan = await approvedPlan();
      const shoeParcel = plan.parcels.find((p) => p.placements.some((q) => q.sku === 'SHOE'));
      const otherParcel = plan.parcels.find((p) => !p.placements.some((q) => q.sku === 'SHOE'));
      if (!shoeParcel || !otherParcel) throw new Error('thiếu kiện');
      await expect(
        session.scan(groupId, otherParcel.parcel_no, { code: 'SHOE', scan_method: 'barcode' }, userId),
      ).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.SCAN_WRONG_PARCEL,
        details: { belongsToParcels: expect.arrayContaining([shoeParcel.parcel_no]) as unknown },
      });
      await expect(
        session.scan(groupId, 1, { code: 'KHONG-CO', scan_method: 'manual' }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.SCAN_NOT_IN_PLAN });
      const shoes = shoeParcel.placements.filter((q) => q.sku === 'SHOE').length;
      await expect(
        session.scan(groupId, shoeParcel.parcel_no, { code: 'SHOE', quantity: shoes + 1, scan_method: 'barcode' }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.SCAN_OVER });
    });

    it('gửi lại cùng client_event_id không đếm 2 lần', async () => {
      const plan = await approvedPlan();
      const sku = plan.parcels[0]?.placements[0]?.sku ?? '';
      const dto = { code: sku, scan_method: 'barcode' as const, client_event_id: 'ev-1' };
      await session.scan(groupId, 1, dto, userId);
      const again = await session.scan(groupId, 1, dto, userId);
      expect(again.scan.duplicate).toBe(true);
      expect(again.plan.parcels[0]?.scans).toHaveLength(1);
    });

    it('niêm phong khi chưa quét đủ → bị chặn', async () => {
      const plan = await approvedPlan();
      await expect(
        session.seal(groupId, 1, { weight_kg: weightOf(plan, 1), expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PARCEL_NOT_FULLY_SCANNED });
    });

    it('quét đủ + niêm phong từng kiện → kiện cuối chuyển cả nhóm packed, chế độ "scan", trừ thùng từng kiện', async () => {
      let plan = await approvedPlan();
      const nos = plan.parcels.map((p) => p.parcel_no);
      let completed = false;
      for (const no of nos) {
        plan = await scanAll(no);
        const result = await session.seal(groupId, no, { weight_kg: weightOf(plan, no), expected_version: plan.version }, userId);
        plan = result.plan;
        completed = result.completed;
      }
      expect(completed).toBe(true);
      expect(plan.status).toBe('packed');
      expect(plan.pack_mode).toBe('scan');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PACKED);
      expect(boxService.consumeForPack).toHaveBeenCalledTimes(nos.length);
    });

    it('lệch cân → kiện bị giữ; người niêm phong không tự chấp nhận được; người khác chấp nhận → hoàn tất', async () => {
      let plan = await approvedPlan();
      const nos = plan.parcels.map((p) => p.parcel_no);
      for (const [i, no] of nos.entries()) {
        plan = await scanAll(no);
        plan = (
          await session.seal(groupId, no, { weight_kg: weightOf(plan, no, i === 0 ? 2 : 1), expected_version: plan.version }, userId)
        ).plan;
      }
      const first = nos[0] ?? 1;
      expect(plan.status).toBe('packing');
      expect(plan.parcels.find((p) => p.parcel_no === first)?.status).toBe('held');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      await expect(
        session.review(groupId, first, { action: 'accept', reason: 'SCALE_ERROR', expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.SELF_REVIEW_FORBIDDEN });
      const done = await session.review(
        groupId,
        first,
        { action: 'accept', reason: 'MATERIALS_HEAVIER', expected_version: plan.version },
        other,
      );
      expect(done.completed).toBe(true);
      expect(done.plan.status).toBe('packed');
    });

    it('mở kiện ra đóng lại không trừ thùng lần 2', async () => {
      let plan = await approvedPlan();
      const [no] = plan.parcels.map((p) => p.parcel_no);
      if (no === undefined) throw new Error('thiếu kiện');
      plan = await scanAll(no);
      plan = (await session.seal(groupId, no, { weight_kg: weightOf(plan, no, 3), expected_version: plan.version }, userId)).plan;
      plan = (
        await session.review(groupId, no, { action: 'reopen', reason: 'WRONG_ITEM_INSIDE', expected_version: plan.version }, other)
      ).plan;
      expect(plan.parcels.find((p) => p.parcel_no === no)?.status).toBe('pending');
      plan = (await session.seal(groupId, no, { weight_kg: weightOf(plan, no), expected_version: plan.version }, userId)).plan;
      expect(plan.parcels.find((p) => p.parcel_no === no)?.status).toBe('sealed');
      const consumedParcels = boxService.consumeForPack.mock.calls.flatMap(
        (c) => (c as unknown as [unknown, { parcelNo: number }[]])[1],
      );
      expect(consumedParcels.filter((c) => c.parcelNo === no)).toHaveLength(1);
    });

    describe('túi zip trừ lúc niêm phong (08/10/2026)', () => {
      /** Gắn túi ZIP-M cho mọi SKU trong kế hoạch (hồ sơ SKU đã chụp vào item_profiles). */
      function bagEverything(): void {
        const stored = planModel.docs[0] as unknown as { parcels: { placements: { sku: string }[] }[]; item_profiles: unknown[] };
        const skus = new Set(stored.parcels.flatMap((p) => p.placements.map((q) => q.sku)));
        stored.item_profiles = [...skus].map((sku) => ({ sku, product_category: null, zip_bag_code: 'ZIP-M', zip_bag_folded: false }));
      }

      it('mỗi món có túi = 1 túi, gom theo kiện + mã túi; chỉ trừ ở lần niêm phong đầu', async () => {
        let plan = await approvedPlan();
        bagEverything();
        const parcel = plan.parcels[0];
        if (!parcel) throw new Error('thiếu kiện');
        plan = await scanAll(parcel.parcel_no);
        plan = (await session.seal(groupId, parcel.parcel_no, { weight_kg: weightOf(plan, parcel.parcel_no), expected_version: plan.version }, userId)).plan;
        expect(bagService.consumeForParcels).toHaveBeenCalledTimes(1);
        const needs = (bagService.consumeForParcels.mock.calls[0] as unknown as [unknown, { code: string; quantity: number; parcelNo: number }[]])[1];
        expect(needs).toEqual([{ code: 'ZIP-M', quantity: parcel.placements.length, parcelNo: parcel.parcel_no }]);

        // mở ra đóng lại bằng thùng cũ (reusable) → không trừ túi lần 2
        plan = (
          await session.unseal(groupId, parcel.parcel_no, { expected_version: plan.version, reason: 'OTHER', note: 'x', box_condition: 'reusable' } as never, userId, UserRole.ADMIN)
        ).plan;
        plan = (await session.seal(groupId, parcel.parcel_no, { weight_kg: weightOf(plan, parcel.parcel_no), expected_version: plan.version }, userId)).plan;
        expect(bagService.consumeForParcels).toHaveBeenCalledTimes(1);
      });

      it('thiếu túi không chặn niêm phong: phần thiếu ghi vào materials_shortfall của kiện + báo Admin/Store Owner', async () => {
        let plan = await approvedPlan();
        bagEverything();
        const parcel = plan.parcels[0];
        if (!parcel) throw new Error('thiếu kiện');
        bagService.consumeForParcels.mockResolvedValueOnce({
          consumed: [],
          shortfalls: [{ parcelNo: parcel.parcel_no, code: 'ZIP-M', missing: 2 }],
        });
        plan = await scanAll(parcel.parcel_no);
        plan = (await session.seal(groupId, parcel.parcel_no, { weight_kg: weightOf(plan, parcel.parcel_no), expected_version: plan.version }, userId)).plan;
        const sealed = plan.parcels.find((p) => p.parcel_no === parcel.parcel_no);
        expect(sealed?.status).toBe('sealed');
        expect(sealed?.materials_shortfall).toEqual([{ code: 'ZIP-M', missing: 2 }]);
        expect(
          notificationsService.notify.mock.calls.some((c) => ((c as unknown[])[0] as { title: string }).title.includes('Thiếu vật tư ZIP-M')),
        ).toBe(true);
      });

      it('kho không có hồ sơ túi (item_profiles không có zip_bag_code) → không gọi trừ túi', async () => {
        let plan = await approvedPlan();
        const parcel = plan.parcels[0];
        if (!parcel) throw new Error('thiếu kiện');
        plan = await scanAll(parcel.parcel_no);
        await session.seal(groupId, parcel.parcel_no, { weight_kg: weightOf(plan, parcel.parcel_no), expected_version: plan.version }, userId);
        expect(bagService.consumeForParcels).not.toHaveBeenCalled();
      });
    });

    describe('hoàn tác niêm phong (08/10/2026)', () => {
      const STAFF = UserRole.WAREHOUSE_STAFF;
      const ADMIN = UserRole.ADMIN;
      const OWNER = UserRole.STORE_OWNER;
      const unsealDto = (version: number, extra: Record<string, unknown> = {}): never =>
        ({ expected_version: version, reason: 'BOX_TOO_TIGHT', box_condition: 'reusable', ...extra }) as never;

      async function sealOne(no: number): Promise<PackingPlanDocument> {
        let plan = await scanAll(no);
        plan = (await session.seal(groupId, no, { weight_kg: weightOf(plan, no), expected_version: plan.version }, userId)).plan;
        return plan;
      }

      async function sealEverything(): Promise<PackingPlanDocument> {
        let plan = await approvedPlan();
        for (const no of plan.parcels.map((p) => p.parcel_no)) plan = await sealOne(no);
        return plan;
      }

      const consumedFor = (no: number): number =>
        boxService.consumeForPack.mock.calls
          .flatMap((c) => (c as unknown as [unknown, { parcelNo: number }[]])[1])
          .filter((c) => c.parcelNo === no).length;

      it('đang đóng, thùng còn tốt: kiện về pending, giữ box_consumed → niêm phong lại KHÔNG trừ thùng lần 2', async () => {
        await approvedPlan();
        let plan = await sealOne(1);
        const { plan: after, wasPacked } = await unsealParcel(1, unsealDto(plan.version), STAFF);
        plan = after;
        expect(wasPacked).toBe(false);
        const parcel = plan.parcels.find((p) => p.parcel_no === 1);
        expect(parcel?.status).toBe('pending');
        expect(parcel?.box_consumed).toBe(true);
        expect(parcel?.actual_weight_kg).toBeNull();
        expect(plan.adjustments.at(-1)).toMatchObject({ kind: 'unseal', old_box_outcome: 'unused', waste_cost_vnd: 0 });
        expect(plan.activity.at(-1)).toMatchObject({ kind: 'unseal', parcel_no: 1 });
        plan = (await session.seal(groupId, 1, { weight_kg: weightOf(plan, 1), expected_version: plan.version }, userId)).plan;
        expect(plan.parcels.find((p) => p.parcel_no === 1)?.status).toBe('sealed');
        expect(consumedFor(1)).toBe(1);
      });

      it('thùng hỏng: box_consumed về false → niêm phong lại trừ thùng MỚI; ghi hao hụt theo giá thùng', async () => {
        await approvedPlan();
        let plan = await sealOne(1);
        const price = plan.parcels.find((p) => p.parcel_no === 1)?.box.price_vnd ?? 0;
        plan = (await unsealParcel(1, unsealDto(plan.version, { box_condition: 'damaged', rescan: true }), STAFF)).plan;
        const parcel = plan.parcels.find((p) => p.parcel_no === 1);
        expect(parcel?.box_consumed).toBe(false);
        expect(parcel?.scans).toHaveLength(0); // rescan: true
        expect(plan.adjustments.at(-1)).toMatchObject({ old_box_outcome: 'damaged', waste_cost_vnd: price });
        plan = await sealOne(1);
        expect(consumedFor(1)).toBe(2);
      });

      it('nhóm đã packed: nhân viên bị chặn (403); Admin/Store Owner hoàn tác → plan packing, nhóm approved_for_packing, đóng lại thì packed', async () => {
        let plan = await sealEverything();
        expect(plan.status).toBe('packed');
        await expect(unsealParcel(1, unsealDto(plan.version), STAFF)).rejects.toMatchObject({
          errorCode: PACKING_ERROR_CODES.UNSEAL_NOT_ALLOWED,
        });
        for (const role of [ADMIN, OWNER]) {
          const probe = await unsealParcel(1, unsealDto(plan.version), role);
          expect(probe.wasPacked).toBe(true);
          expect(probe.plan.status).toBe('packing');
          expect(probe.plan.packed_at).toBeNull();
          expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
          plan = (
            await session.seal(groupId, 1, { weight_kg: weightOf(probe.plan, 1), expected_version: probe.plan.version }, userId)
          ).plan;
          expect(plan.status).toBe('packed');
          expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PACKED);
        }
      });

      it('đã giao (nhóm shipped) → không hoàn tác; kiện chưa niêm phong → PARCEL_WRONG_STATUS; OTHER cần ghi chú', async () => {
        let plan = await sealEverything();
        await expect(unsealParcel(1, unsealDto(plan.version, { reason: 'OTHER' }), ADMIN)).rejects.toMatchObject({
          errorCode: PACKING_ERROR_CODES.NOTE_REQUIRED,
        });
        group = { ...group, fulfillment_status: GroupFulfillmentStatus.SHIPPED };
        await expect(unsealParcel(1, unsealDto(plan.version), ADMIN)).rejects.toMatchObject({
          errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS,
        });
        group = { ...group, fulfillment_status: GroupFulfillmentStatus.PACKED };
        const probe = await unsealParcel(1, unsealDto(plan.version), ADMIN);
        plan = probe.plan;
        await expect(unsealParcel(1, unsealDto(plan.version), ADMIN)).rejects.toMatchObject({
          errorCode: PACKING_ERROR_CODES.PARCEL_WRONG_STATUS,
        });
      });

      function unsealParcel(no: number, dto: never, role: UserRole): ReturnType<PackingSessionService['unseal']> {
        return session.unseal(groupId, no, dto, userId, role);
      }
    });

    it('lối tắt pack: ghi quét "bypass", kiện lệch vẫn bị giữ; cài đặt bắt buộc quét thì chặn', async () => {
      const plan = await approvedPlan();
      const weights = plan.parcels.map((p, i) => ({ parcel_no: p.parcel_no, weight_kg: weightOf(plan, p.parcel_no, i === 0 ? 2 : 1) }));
      settings = { ...settings, requireScan: true };
      await expect(session.quickPack(groupId, { parcels: weights, expected_version: plan.version }, userId)).rejects.toMatchObject({
        errorCode: PACKING_ERROR_CODES.SCAN_REQUIRED,
      });
      settings = { ...settings, requireScan: false };
      const result = await session.quickPack(groupId, { parcels: weights, expected_version: plan.version }, userId);
      expect(result.completed).toBe(false);
      expect(result.plan.status).toBe('packing');
      expect(result.plan.parcels.every((p) => p.scans.length === p.placements.length)).toBe(true);
      expect(result.plan.parcels[0]?.scans.every((x) => x.method === 'bypass')).toBe(true);
      await expect(
        session.quickPack(groupId, { parcels: [{ parcel_no: 1, weight_kg: 1 }, { parcel_no: 1, weight_kg: 1 }], expected_version: result.plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PACK_WEIGHTS_MISMATCH });
    });

    it('kiện có hàng dễ vỡ chỉ lấy thùng mới (allowReused = false) theo cài đặt mặc định', async () => {
      allocations = [{ order_id: new Types.ObjectId().toString(), platform_order_id: 'F-1', items: [sunglasses(1)] }];
      const plan = await approvedPlan();
      await session.quickPack(
        groupId,
        { parcels: plan.parcels.map((p) => ({ parcel_no: p.parcel_no, weight_kg: weightOf(plan, p.parcel_no) })), expected_version: plan.version },
        userId,
      );
      const packages = (boxService.consumeForPack.mock.calls[0] as unknown as [unknown, { allowReused?: boolean }[]])[1];
      expect(packages.every((p) => p.allowReused === false)).toBe(true);
    });

    it('chưa duyệt thì không quét/đóng được', async () => {
      const plan = await computed();
      await expect(
        session.quickPack(groupId, { parcels: [{ parcel_no: 1, weight_kg: 1 }], expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });
    });
  });

  describe('sự cố lúc đóng + tháo kiện', () => {
    async function approvedPlan(): Promise<PackingPlanDocument> {
      const plan = await computed();
      return service.approve(groupId, plan.version, userId);
    }

    it('món hỏng → lấy món thay: bớt món cũ khỏi "đã lấy", lấy món mới từ kệ, phải quét lại món đó', async () => {
      let plan = await approvedPlan();
      const q = plan.parcels[0]?.placements[0];
      if (!q) throw new Error('thiếu món');
      plan = (await session.scan(groupId, 1, { code: q.sku, scan_method: 'barcode' }, userId)).plan;
      const after = await session.reportIssue(
        groupId,
        { parcel_no: 1, item_key: plan.parcels[0]?.scans[0]?.item_key ?? q.item_key, issue: 'damaged', resolution: 'replace', warehouse_id: new Types.ObjectId().toString(), expected_version: plan.version },
        userId,
      );
      expect(orderGroupsService.adjustPickedUnits).toHaveBeenCalledWith(groupId, [{ sku: q.sku, quantity: 1 }], expect.objectContaining({ restock: false, kind: 'pack_issue' }));
      expect(orderGroupsService.takeReplacementUnit).toHaveBeenCalled();
      expect(after.issues).toHaveLength(1);
      expect(after.parcels[0]?.scans).toHaveLength(0);
    });

    it('trả về lấy hàng: thay kế hoạch + nhóm về picking; đã có kiện niêm phong thì bị chặn', async () => {
      const plan = await approvedPlan();
      const q = plan.parcels[0]?.placements[0];
      if (!q) throw new Error('thiếu món');
      const superseded = await session.reportIssue(
        groupId,
        { parcel_no: 1, item_key: q.item_key, issue: 'missing', resolution: 'back_to_picking', expected_version: plan.version },
        userId,
      );
      expect(superseded.status).toBe('superseded');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKING);
      expect(orderGroupsService.reconcileReservation).toHaveBeenCalledWith(groupId);
    });

    it('chặn trả về lấy hàng khi đã có kiện niêm phong', async () => {
      let plan = await approvedPlan();
      const [no, second] = plan.parcels.map((p) => p.parcel_no);
      if (no === undefined || second === undefined) throw new Error('cần 2 kiện');
      plan = await service.requireActivePlan(groupId);
      const parcel = plan.parcels.find((p) => p.parcel_no === no);
      for (const q of parcel?.placements ?? [])
        plan = (await session.scan(groupId, no, { code: q.sku, scan_method: 'barcode' }, userId)).plan;
      const w = (plan.parcels.find((p) => p.parcel_no === no)?.estimated_weight_g ?? 0) / 1000;
      plan = (await session.seal(groupId, no, { weight_kg: w, expected_version: plan.version }, userId)).plan;
      const q = plan.parcels.find((p) => p.parcel_no === second)?.placements[0];
      if (!q) throw new Error('thiếu món');
      await expect(
        session.reportIssue(groupId, { parcel_no: second, item_key: q.item_key, issue: 'damaged', resolution: 'back_to_picking', expected_version: plan.version }, userId),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.ISSUE_HAS_SEALED_PARCELS });
    });

    it('tháo kiện của đơn hủy: trả hàng về kệ, thu hồi thùng, kiện thành voided', async () => {
      const plan = await approvedPlan();
      const doc = planModel.docs[0];
      if (!doc) throw new Error('thiếu kế hoạch');
      const parcels = doc.parcels as Record<string, unknown>[];
      const target = parcels[0];
      if (!target) throw new Error('thiếu kiện');
      Object.assign(target, {
        status: 'to_unpack',
        box_consumed: true,
        unpack: { reason: 'Đơn hủy', requested_at: new Date(), box_condition: null, units_restocked: 0, note: null, by: null, done_at: null },
      });
      doc.status = 'packing';
      const result = await session.unpack(groupId, target.parcel_no as number, { box_condition: 'reusable', expected_version: plan.version }, userId);
      expect(orderGroupsService.adjustPickedUnits).toHaveBeenCalledWith(groupId, expect.any(Array), expect.objectContaining({ restock: true, kind: 'unpack' }));
      expect(materialsService.recoverFromUnpack).toHaveBeenCalled();
      expect(result.plan.parcels.find((p) => p.parcel_no === target.parcel_no)?.status).toBe('voided');
      expect(result.box).toBe('reused');
    });

    describe('thu hồi vật tư chèn khi tháo kiện', () => {
      async function parcelToUnpack(): Promise<{ plan: PackingPlanDocument; no: number }> {
        const plan = await approvedPlan();
        const doc = planModel.docs[0];
        const target = (doc?.parcels as Record<string, unknown>[] | undefined)?.[0];
        if (!doc || !target) throw new Error('thiếu kiện');
        Object.assign(target, {
          status: 'to_unpack',
          box_consumed: true,
          materials: [{ type: 'foam_corner', code: 'FOAM', name: 'Góc xốp', unit: 'cái', quantity: 4, weight_g: 20, cost_vnd: 800 }],
          unpack: { reason: 'Đơn hủy', requested_at: new Date(), box_condition: null, units_restocked: 0, recovered_materials: [], note: null, by: null, done_at: null },
        });
        doc.status = 'packing';
        return { plan, no: target.parcel_no as number };
      }

      it('khai thu hồi 3 góc xốp → gửi kèm thùng, lưu kết quả vào kiện', async () => {
        const { plan, no } = await parcelToUnpack();
        const result = await session.unpack(
          groupId,
          no,
          { box_condition: 'reusable', recovered_materials: [{ code: 'FOAM', quantity: 3 }], expected_version: plan.version },
          userId,
        );
        const [lines] = materialsService.recoverFromUnpack.mock.calls[0] as unknown as [{ code: string; quantity: number; strict?: boolean }[]];
        expect(lines).toEqual([
          expect.objectContaining({ quantity: 1, condition: 'reusable' }),
          { code: 'FOAM', quantity: 3, condition: 'reusable', strict: true },
        ]);
        expect(result.materials).toEqual([{ code: 'FOAM', quantity: 3, outcome: 'reused' }]);
        const saved = result.plan.parcels.find((p) => p.parcel_no === no);
        expect(saved?.unpack?.recovered_materials.map((m) => m.code)).toContain('FOAM');
      });

      it('vật tư không có trong kiện hoặc vượt số lượng → PACKING_RECOVER_MATERIAL_INVALID', async () => {
        const { plan, no } = await parcelToUnpack();
        for (const bad of [{ code: 'AIR', quantity: 1 }, { code: 'FOAM', quantity: 5 }]) {
          await expect(
            session.unpack(groupId, no, { box_condition: 'reusable', recovered_materials: [bad], expected_version: plan.version }, userId),
          ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.RECOVER_MATERIAL_INVALID });
        }
        expect(materialsService.recoverFromUnpack).not.toHaveBeenCalled();
      });
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

  describe('đổi thùng khi đang đóng (08/10/2026)', () => {
    async function approved(): Promise<PackingPlanDocument> {
      const plan = await computed();
      return service.approve(groupId, plan.version, userId);
    }

    /** Kiện chưa dùng thùng L + thùng L làm đích (L chứa vừa mọi kiện trong test). */
    function pendingParcel(plan: PackingPlanDocument): PackingPlanDocument['parcels'][number] {
      const found = plan.parcels.find((p) => p.box.code !== 'SAMPLE-L');
      if (!found) throw new Error('thiếu kiện không dùng thùng L để test');
      return found;
    }

    it('thùng cũ chưa dùng: đổi thùng, không ghi hao hụt, giữ lần quét đã có, version tăng, ghi lịch sử', async () => {
      const plan = await approved();
      const parcel = pendingParcel(plan);
      const stored = planModel.docs[0] as unknown as { parcels: { parcel_no: number; scans: unknown[] }[] };
      const mark = { item_key: 'x#1', sku: 'x', method: 'barcode', by: null, at: new Date(), client_event_id: null };
      stored.parcels.find((p) => p.parcel_no === parcel.parcel_no)?.scans.push(mark);

      const next = await service.changeBoxInSession(
        groupId,
        parcel.parcel_no,
        {
          expected_version: plan.version,
          box_code: 'SAMPLE-L',
          reason: 'BOX_TOO_TIGHT',
          old_box_outcome: 'unused',
        },
        userId,
      );
      const changed = next.parcels.find((p) => p.parcel_no === parcel.parcel_no);
      expect(changed?.box.code).toBe('SAMPLE-L');
      expect(changed?.status).toBe('pending');
      expect(changed?.scans).toHaveLength(1);
      expect(next.version).toBe(plan.version + 1);
      expect(boxService.recordWaste).not.toHaveBeenCalled();
      const adj = next.adjustments.at(-1);
      expect(adj).toMatchObject({ kind: 'change_box_in_session', old_box_outcome: 'unused', waste_cost_vnd: 0 });
      expect(adj?.box_codes).toEqual([parcel.box.code, 'SAMPLE-L']);
    });

    it('thùng cũ đã hỏng: trừ tồn + ghi hao hụt thùng CŨ, lưu chi phí hao hụt', async () => {
      const plan = await approved();
      const parcel = pendingParcel(plan);
      const next = await service.changeBoxInSession(
        groupId,
        parcel.parcel_no,
        { expected_version: plan.version, box_code: 'SAMPLE-L', reason: 'OTHER', note: 'Thùng bị rách đáy', old_box_outcome: 'damaged' },
        userId,
      );
      expect(boxService.recordWaste).toHaveBeenCalledTimes(1);
      expect((boxService.recordWaste.mock.calls[0] as unknown[] | undefined)?.[1]).toBe(parcel.box.code);
      const adj = next.adjustments.at(-1);
      expect(adj).toMatchObject({ old_box_outcome: 'damaged', waste_cost_vnd: 3000 });
    });

    it('thùng mới trùng thùng cũ mà khai chưa dùng → SAME_BOX; khai hỏng thì cho (thay cái mới cùng loại)', async () => {
      const plan = await approved();
      const parcel = pendingParcel(plan);
      await expect(
        service.changeBoxInSession(
          groupId,
          parcel.parcel_no,
          { expected_version: plan.version, box_code: parcel.box.code, reason: 'OTHER', note: 'x', old_box_outcome: 'unused' },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.SAME_BOX });
      const next = await service.changeBoxInSession(
        groupId,
        parcel.parcel_no,
        { expected_version: plan.version, box_code: parcel.box.code, reason: 'OTHER', note: 'rách', old_box_outcome: 'damaged' },
        userId,
      );
      expect(next.parcels.find((p) => p.parcel_no === parcel.parcel_no)?.box.code).toBe(parcel.box.code);
      expect(boxService.recordWaste).toHaveBeenCalledTimes(1);
    });

    it('kiện đã niêm phong → PARCEL_WRONG_STATUS; kế hoạch chưa duyệt (ready) → WRONG_PLAN_STATUS', async () => {
      const ready = await computed();
      await expect(
        service.changeBoxInSession(
          groupId,
          1,
          { expected_version: ready.version, box_code: 'SAMPLE-L', reason: 'BOX_TOO_TIGHT', old_box_outcome: 'unused' },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.WRONG_PLAN_STATUS });

      const plan = await service.approve(groupId, ready.version, userId);
      const stored = planModel.docs[0] as unknown as { parcels: { parcel_no: number; status: string }[] };
      const target = stored.parcels[0];
      if (!target) throw new Error('thiếu kiện');
      target.status = 'sealed';
      await expect(
        service.changeBoxInSession(
          groupId,
          target.parcel_no,
          { expected_version: plan.version, box_code: 'SAMPLE-L', reason: 'BOX_TOO_TIGHT', old_box_outcome: 'unused' },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PARCEL_WRONG_STATUS });
    });

    it('thùng mới không còn tồn → PKG_BOX_OUT_OF_STOCK; version cũ → xung đột', async () => {
      const plan = await approved();
      const parcel = pendingParcel(plan);
      stock.set('SAMPLE-L', 0);
      await expect(
        service.changeBoxInSession(
          groupId,
          parcel.parcel_no,
          { expected_version: plan.version, box_code: 'SAMPLE-L', reason: 'BOX_TOO_TIGHT', old_box_outcome: 'unused' },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: 'PKG_BOX_OUT_OF_STOCK' });
      stock.set('SAMPLE-L', 50);
      await expect(
        service.changeBoxInSession(
          groupId,
          parcel.parcel_no,
          { expected_version: plan.version - 1, box_code: 'SAMPLE-L', reason: 'BOX_TOO_TIGHT', old_box_outcome: 'unused' },
          userId,
        ),
      ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.VERSION_CONFLICT });
    });
  });

  describe('PackingJobService (tự tính khi lấy hàng xong)', () => {
    it('tính cho nhóm picked chưa có kế hoạch; bỏ qua nhóm đã có', async () => {
      const groupModel = {
        find: jest.fn(() => ({
          select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([{ _id: group._id }]) }) }) }),
        })),
      };
      const job = new PackingJobService(groupModel as never, planModel as never, service, notificationsService as never);
      expect(await job.computePending()).toBe(1);
      group.fulfillment_status = GroupFulfillmentStatus.PICKED; // giả lập: vẫn picked nhưng đã có kế hoạch
      expect(await job.computePending()).toBe(0);
    });

    it('nhóm có kế hoạch failed/rejected bị loại khỏi lô trước khi lấy (không chiếm chỗ nhóm mới)', async () => {
      const plan = await computed();
      await service.reject(groupId, plan.version, 'ITEM_DAMAGED', undefined, userId);
      const find = jest.fn(() => ({
        select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }),
      }));
      const job = new PackingJobService({ find } as never, planModel as never, service, notificationsService as never);
      await job.computePending();
      const filter = (find.mock.calls[0] as unknown as [{ _id: { $nin: unknown[] } }])[0];
      expect(filter._id.$nin.map(String)).toContain(groupId);
    });

    it('kế hoạch kẹt computing quá 5 phút bị đánh failed', async () => {
      const updateMany = jest.fn(() => Promise.resolve({ modifiedCount: 2 }));
      const job = new PackingJobService({} as never, { updateMany } as never, service, notificationsService as never);
      const now = new Date('2026-10-09T10:00:00Z');
      expect(await job.failStaleComputing(now)).toBe(2);
      const [filter, update] = (updateMany.mock.calls[0] as unknown as [
        { status: string; created_at: { $lt: Date } },
        { $set: { status: string } },
      ]);
      expect(filter.status).toBe('computing');
      expect(filter.created_at.$lt.getTime()).toBe(now.getTime() - 5 * 60 * 1000);
      expect(update.$set.status).toBe('failed');
    });

    it('nhắc kế hoạch bị từ chối quá hạn: Admin + Store Owner + người được giao, mỗi kế hoạch đúng 1 lần', async () => {
      const owner = new Types.ObjectId();
      const overdue = [
        { _id: new Types.ObjectId(), order_group_id: group._id, rejection_owner_id: owner, rejection_reason: 'BOX_TOO_TIGHT' },
        { _id: new Types.ObjectId(), order_group_id: group._id, rejection_owner_id: null, rejection_reason: 'OTHER: x' },
      ];
      const claimed = new Set<string>();
      const overduePlanModel = {
        find: jest.fn(() => ({ select: () => ({ limit: () => ({ lean: () => Promise.resolve(overdue) }) }) })),
        updateOne: jest.fn((f: { _id: Types.ObjectId }) => {
          const first = !claimed.has(f._id.toString());
          claimed.add(f._id.toString());
          return Promise.resolve({ matchedCount: first ? 1 : 0 });
        }),
      };
      const job = new PackingJobService({} as never, overduePlanModel as never, service, notificationsService as never);
      expect(await job.remindOverdueRejections()).toBe(2);
      // kế hoạch 1: Admin + Store Owner + owner = 3; kế hoạch 2: Admin + Store Owner = 2
      expect(notificationsService.notify).toHaveBeenCalledTimes(5);
      notificationsService.notify.mockClear();
      expect(await job.remindOverdueRejections()).toBe(0); // đã nhắc rồi → không nhắc lại
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });
});
