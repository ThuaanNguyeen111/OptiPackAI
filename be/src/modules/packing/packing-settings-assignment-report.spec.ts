import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { PackingSettingsService, DEFAULT_PACKING_SETTINGS } from './packing-settings.service';
import { PackerAssignmentService } from './packer-assignment.service';
import { PackingReportService } from './packing-report.service';
import { PACKING_ERROR_CODES } from './packing.errors';

/** (05/10/2026) Luật đóng gói có phiên bản, giao người đóng, báo cáo hiệu suất. */
describe('PackingSettingsService', () => {
  const userId = new Types.ObjectId().toString();
  const connection = {
    startSession: () =>
      Promise.resolve({ withTransaction: (fn: () => Promise<unknown>) => fn(), endSession: () => Promise.resolve() }),
  };

  function model(active: Record<string, unknown> | null): {
    findOne: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  } {
    const chain = (doc: Record<string, unknown> | null): Record<string, unknown> => ({
      sort: () => ({ lean: () => Promise.resolve(doc), select: () => ({ lean: () => Promise.resolve(doc) }) }),
    });
    return {
      findOne: jest.fn(() => chain(active)),
      create: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    };
  }

  it('chưa ai lưu → mặc định trong code (version null, lệch cân 20%)', async () => {
    const service = new PackingSettingsService(model(null) as never, connection as never);
    const s = await service.get();
    expect(s.version).toBeNull();
    expect(s.abnormalWeightThreshold).toBe(0.2);
    expect(s.requireScan).toBe(false);
  });

  it('lưu: tạo version mới, giữ trường không gửi, tắt bản cũ', async () => {
    const m = model(null);
    const service = new PackingSettingsService(m as never, connection as never);
    await service.update({ abnormal_weight_threshold: 0.1, max_parcels_per_order: 3 }, userId);
    const [[created]] = m.create.mock.calls[0] as [[Record<string, unknown>]];
    expect(created).toMatchObject({
      version: 1,
      abnormal_weight_threshold: 0.1,
      max_parcels_per_order: 3,
      fragile_cushion_mm: DEFAULT_PACKING_SETTINGS.fragileCushionMm,
      require_scan: false,
    });
    expect(m.updateMany).toHaveBeenCalled();
  });

  it('expected_version lệch → PACKING_SETTINGS_CONFLICT', async () => {
    const service = new PackingSettingsService(model(null) as never, connection as never);
    await expect(service.update({ expected_version: 4 }, userId)).rejects.toMatchObject({
      errorCode: PACKING_ERROR_CODES.SETTINGS_CONFLICT,
    });
  });
});

describe('PackerAssignmentService', () => {
  const packerA = new Types.ObjectId();
  const packerB = new Types.ObjectId();
  const planId = new Types.ObjectId();
  let userModel: { exists: jest.Mock; find: jest.Mock };
  let planModel: { findOneAndUpdate: jest.Mock; aggregate: jest.Mock };
  let notify: jest.Mock;
  let service: PackerAssignmentService;

  beforeEach(() => {
    userModel = {
      exists: jest.fn().mockResolvedValue({ _id: packerA }),
      find: jest.fn().mockReturnValue({
        select: () => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: packerA }, { _id: packerB }]) }) }),
      }),
    };
    planModel = {
      findOneAndUpdate: jest.fn((_f: unknown, u: { $set: { assigned_packer_id: Types.ObjectId } }) =>
        Promise.resolve({ _id: planId, order_group_id: new Types.ObjectId(), parcels: [], assigned_packer_id: u.$set.assigned_packer_id }),
      ),
      aggregate: jest.fn().mockResolvedValue([{ _id: packerA, count: 3, last: new Date() }]),
    };
    notify = jest.fn().mockResolvedValue({});
    service = new PackerAssignmentService(planModel as never, userModel as never, { notify } as never);
  });

  it('tính lại: giữ người đóng của lần trước nếu còn là Packaging Staff hoạt động', async () => {
    const plan = await service.assignOnReady(planId, packerA);
    expect(String(plan?.assigned_packer_id)).toBe(String(packerA));
    expect(planModel.aggregate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: String(packerA) }));
  });

  it('lần đầu: chọn Packaging Staff ít kế hoạch đang mở nhất', async () => {
    const plan = await service.assignOnReady(planId, null);
    expect(String(plan?.assigned_packer_id)).toBe(String(packerB));
    const [filter] = userModel.find.mock.calls[0] as [{ role: UserRole }];
    expect(filter.role).toBe(UserRole.PACKAGING_STAFF);
  });

  it('không có Packaging Staff → để trống, không lỗi', async () => {
    userModel.find.mockReturnValue({ select: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }) });
    expect(await service.assignOnReady(planId, null)).toBeNull();
  });

  it('gán tay người không phải Packaging Staff → PACKING_PACKER_INVALID', async () => {
    userModel.exists.mockResolvedValue(null);
    await expect(
      service.assign({ _id: planId } as never, 'manual', new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ errorCode: PACKING_ERROR_CODES.PACKER_INVALID });
  });
});

describe('PackingReportService', () => {
  const staff = new Types.ObjectId();
  const orderA = new Types.ObjectId();
  const orderB = new Types.ObjectId();
  const t0 = new Date('2026-10-01T08:00:00Z').getTime();
  const at = (minutes: number): Date => new Date(t0 + minutes * 60_000);

  const parcel = (orderId: Types.ObjectId, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    order_id: orderId,
    status: 'sealed',
    box: { price_vnd: 5000 },
    materials_cost_vnd: 500,
    is_abnormal: false,
    weighings: [],
    reviews: [],
    ...extra,
  });

  const plans = [
    {
      approved_at: at(0),
      packing_started_at: at(10),
      packed_at: at(30),
      packed_by: staff,
      pack_mode: 'scan',
      adjustments: [],
      issues: [],
      orders: [{ order_id: orderA, status: 'ok', lower_bound_parcels: 1 }],
      parcels: [parcel(orderA)],
    },
    {
      approved_at: at(0),
      packing_started_at: at(20),
      packed_at: at(30),
      packed_by: staff,
      pack_mode: 'quick',
      adjustments: [{ kind: 'change_box' }],
      issues: [],
      orders: [{ order_id: orderB, status: 'ok', lower_bound_parcels: 1 }],
      parcels: [
        parcel(orderB, { is_abnormal: true, reviews: [{ action: 'accept' }] }),
        parcel(orderB),
        parcel(orderB, { status: 'voided' }),
      ],
    },
  ];

  function service(): PackingReportService {
    const issuePlans = [
      { issues: [{ issue: 'damaged', at: at(5), by: staff }, { issue: 'missing', at: new Date('2020-01-01'), by: staff }] },
    ];
    const planModel = {
      find: jest.fn().mockReturnValue({
        select: () => ({
          sort: () => ({ limit: () => ({ lean: () => Promise.resolve(plans) }) }),
          lean: () => Promise.resolve(issuePlans),
        }),
      }),
    };
    const userModel = {
      find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: staff, name: 'Lan' }]) }) }),
    };
    return new PackingReportService(planModel as never, userModel as never);
  }

  it('tính thời gian, tỷ lệ lệch cân, duyệt nguyên vẹn, đạt tối thiểu, quét kiểm, theo nhân viên', async () => {
    const r = await service().summary('2026-09-01T00:00:00Z', '2026-10-05T00:00:00Z');
    expect(r.groups).toBe(2);
    expect(r.parcels).toBe(3); // kiện đã tháo (voided) không tính
    expect(r.avgWaitMinutes).toBe(15);
    expect(r.avgPackMinutes).toBe(15);
    expect(r.heldRate).toBe(0.333);
    expect(r.acceptedDespiteDeviation).toBe(1);
    expect(r.approvedIntactRate).toBe(0.5);
    expect(r.minimalParcelRate).toBe(0.5);
    expect(r.scanRate).toBe(0.5);
    expect(r.packagingCostVnd).toBe(3 * 5500);
    expect(r.issues).toEqual({ damaged: 1, missing: 0, wrongItem: 0 }); // sự cố ngoài khoảng ngày không tính
    expect(r.byStaff).toEqual([
      expect.objectContaining({ name: 'Lan', groups: 2, parcels: 3, heldParcels: 1, quickPackGroups: 1 }),
    ]);
  });

  it('khoảng ngày sai → PACKING_INVALID_DATE_RANGE', async () => {
    await expect(service().summary('2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z')).rejects.toMatchObject({
      errorCode: PACKING_ERROR_CODES.INVALID_DATE_RANGE,
    });
  });
});
