import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PackagingBoxService } from './packaging-box.service';
import { CreatePackagingBoxDto } from './dto/packaging-box.dto';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { PackingPlan } from '../packing/schemas/packing-plan.schema';
// Kho vật tư CHUNG (gộp main + thi_dev 04/10/2026)
import {
  PackagingMaterial,
  PackagingMaterialSchema,
} from '../packaging-materials/schemas/packaging-material.schema';
import {
  PackagingMovement,
  PackagingMovementSchema,
} from '../packaging-materials/schemas/packaging-movement.schema';
import { PackagingMaterialsService } from '../packaging-materials/packaging-materials.service';

describe('PackagingBoxService', () => {
  let service: PackagingBoxService;
  let boxModel: {
    find: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let movementModel: { create: jest.Mock };
  let planModel: { aggregate: jest.Mock };
  let materialsService: { stockInById: jest.Mock; consumeForParcels: jest.Mock };

  const validDto: CreatePackagingBoxDto = {
    code: 'CARTON-M',
    name: 'Thùng M',
    inner: { length_mm: 350, width_mm: 250, height_mm: 200 },
    outer: { length_mm: 356, width_mm: 256, height_mm: 206 },
    tare_g: 200,
    max_load_g: 10000,
    price_vnd: 4500,
  };

  beforeEach(async () => {
    boxModel = {
      find: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    movementModel = { create: jest.fn().mockResolvedValue([]) };
    planModel = { aggregate: jest.fn().mockResolvedValue([]) };
    materialsService = { stockInById: jest.fn(), consumeForParcels: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingBoxService,
        { provide: getModelToken(PackagingMaterial.name), useValue: boxModel },
        { provide: getModelToken(PackagingMovement.name), useValue: movementModel },
        { provide: getModelToken(PackingPlan.name), useValue: planModel },
        { provide: PackagingMaterialsService, useValue: materialsService },
      ],
    }).compile();
    service = module.get(PackagingBoxService);
  });

  it('schema khởi tạo được (Rule #23 — field union có type tường minh)', () => {
    expect(PackagingMaterialSchema.path('inner')).toBeDefined();
    expect(PackagingMaterialSchema.path('max_load_g')).toBeDefined();
  });

  it('tạo thùng hợp lệ → is_sample=false, is_active=true', async () => {
    boxModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    await service.create(validDto);
    const [payload] = boxModel.create.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(payload.is_sample).toBe(false);
    expect(payload.is_active).toBe(true);
    // Kho chung: kind box, giá = unit_cost_vnd, giữ length/width/height_cm theo số đo ngoài.
    expect(payload).toMatchObject({ kind: 'box', unit_cost_vnd: 4500, length_cm: 35.6, width_cm: 25.6, height_cm: 20.6 });
  });

  it('kích thước ngoài nhỏ hơn lòng thùng → PKG_BOX_INVALID_DIMENSIONS', async () => {
    await expect(
      service.create(
        Object.assign(new CreatePackagingBoxDto(), validDto, {
          outer: { length_mm: 340, width_mm: 256, height_mm: 206 },
        }),
      ),
    ).rejects.toMatchObject({
      errorCode: PACKAGING_ERROR_CODES.BOX_INVALID_DIMENSIONS,
    });
    expect(boxModel.create).not.toHaveBeenCalled();
  });

  it('trùng mã thùng (E11000) → PKG_BOX_CODE_IN_USE thay vì 500', async () => {
    boxModel.create.mockRejectedValue({ code: 11000 });
    await expect(service.create(validDto)).rejects.toMatchObject({
      errorCode: PACKAGING_ERROR_CODES.BOX_CODE_IN_USE,
    });
  });

  it('update id sai định dạng → PKG_INVALID_BOX_ID', async () => {
    await expect(service.update('abc', { name: 'x' })).rejects.toMatchObject({
      errorCode: PACKAGING_ERROR_CODES.INVALID_BOX_ID,
    });
  });

  it('schema sổ xuất/nhập khởi tạo được (Rule #23)', () => {
    expect(PackagingMovementSchema.path('parcel_no')).toBeDefined();
    expect(PackagingMaterialSchema.path('storage_location')).toBeDefined();
  });

  it('tạo thùng mới luôn có tồn 0 (chỉ nhập qua stock-in để có dòng sổ)', async () => {
    boxModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    await service.create(validDto);
    const [payload] = boxModel.create.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(payload.qty_new).toBe(0);
    expect(payload.qty_reused).toBe(0);
    expect(payload.reorder_level).toBe(10);
  });

  it('stock-in nhập hàng MỚI qua kho chung (stockInById), đúng thùng', async () => {
    const id = new Types.ObjectId();
    boxModel.findOne.mockResolvedValue({ _id: id, code: 'M', kind: 'box' });
    materialsService.stockInById.mockResolvedValue({ _id: id, code: 'M', qty_new: 55 });

    await service.stockIn(id.toString(), 50, 'u1', ' PO-1 ');

    expect(boxModel.findOne).toHaveBeenCalledWith({ _id: id.toString(), kind: 'box' });
    expect(materialsService.stockInById).toHaveBeenCalledWith(id, 50, 'u1', ' PO-1 ');
  });

  it('còn trống = tồn − số kiện của kế hoạch chưa đóng đang giữ chỗ; loại trừ nhóm đang tính lại', async () => {
    const groupId = new Types.ObjectId().toString();
    boxModel.find.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            // Tồn dùng được = mới + tái sử dụng (kho chung).
            { code: 'M', qty_new: 2, qty_reused: 1, reorder_level: 2 },
            { code: 'L', qty_new: 1, qty_reused: 0, reorder_level: 2 },
          ]),
      }),
    });
    planModel.aggregate.mockResolvedValue([
      { _id: 'M', count: 2 },
      { _id: 'L', count: 4 },
    ]);

    const availability = await service.listAvailability({ groupId });

    expect(availability.get('M')).toEqual({
      onHand: 3,
      reserved: 2,
      available: 1,
      reorderLevel: 2,
    });
    expect(availability.get('L')?.available).toBe(0);
    const [pipeline] = planModel.aggregate.mock.calls[0] as [
      { $match?: Record<string, unknown> }[],
    ];
    expect(
      String((pipeline[0]?.$match?.order_group_id as { $ne: unknown }).$ne),
    ).toBe(groupId);
  });

  it('giữ chỗ tính theo KIỆN của kế hoạch ready/approved đang hoạt động (04/10/2026)', async () => {
    boxModel.find.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    planModel.aggregate.mockResolvedValue([]);

    await service.listAvailability();

    const [pipeline] = planModel.aggregate.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    const match = (pipeline[0] as { $match: { is_active: boolean; status: { $in: string[] } } }).$match;
    expect(match.is_active).toBe(true);
    expect(match.status.$in).toEqual(['ready', 'approved', 'packing']);
    expect(pipeline.some((stage) => stage.$unwind === '$parcels')).toBe(true);
    // (05/10/2026) kiện đã niêm phong (đã trừ tồn thật) và kiện đang/đã tháo không giữ chỗ nữa.
    expect(JSON.stringify(pipeline)).toContain('parcels.box_consumed');
    expect(pipeline.some((stage) => JSON.stringify(stage).includes('$parcels.box.code'))).toBe(true);
  });

  it('pack trừ 1 thùng/kiện qua kho chung ở chế độ strict', async () => {
    materialsService.consumeForParcels.mockResolvedValue({
      consumed: [{ code: 'M', name: 'M', before: 3, after: 1, reorderLevel: 2, savingVnd: 0 }],
      shortfalls: [],
    });
    const planId = new Types.ObjectId();
    const result = await service.consumeForPack(
      {} as never,
      [
        { boxCode: 'M', planId, parcelNo: 1 },
        { boxCode: 'M', planId, parcelNo: 2 },
      ],
      new Types.ObjectId(),
      'u1',
    );
    const [, needs, , , options] = materialsService.consumeForParcels.mock.calls[0] as [
      unknown,
      { code: string; quantity: number; parcelNo: number }[],
      unknown,
      unknown,
      { strict: boolean },
    ];
    expect(needs.map((n) => [n.code, n.quantity, n.parcelNo])).toEqual([['M', 1, 1], ['M', 1, 2]]);
    expect(options.strict).toBe(true);
    expect(result).toEqual([{ code: 'M', before: 3, after: 1, reorderLevel: 2 }]);
  });

  it('pack khi kho đã hết thùng → PKG_BOX_OUT_OF_STOCK', async () => {
    materialsService.consumeForParcels.mockImplementation(
      (_s: unknown, needs: { code: string; parcelNo: number }[], _g: unknown, _u: unknown, options: { onShortage: (n: unknown, a: number) => never }) => {
        options.onShortage(needs[0], 0);
      },
    );
    await expect(
      service.consumeForPack(
        {} as never,
        [{ boxCode: 'M', planId: new Types.ObjectId(), parcelNo: 1 }],
        new Types.ObjectId(),
        new Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({
      errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
    });
  });
});
