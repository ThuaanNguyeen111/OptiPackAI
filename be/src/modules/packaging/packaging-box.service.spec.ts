import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingBox, PackagingBoxSchema } from './schemas/packaging-box.schema';
import { CreatePackagingBoxDto } from './dto/packaging-box.dto';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { PackagingStockMovement, PackagingStockMovementSchema } from './schemas/packaging-stock-movement.schema';
import { PackagingRecommendationDoc } from './schemas/packaging-recommendation.schema';

describe('PackagingBoxService', () => {
  let service: PackagingBoxService;
  let boxModel: {
    find: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let movementModel: { create: jest.Mock };
  let recommendationModel: { aggregate: jest.Mock };

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
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    movementModel = { create: jest.fn().mockResolvedValue([]) };
    recommendationModel = { aggregate: jest.fn().mockResolvedValue([]) };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingBoxService,
        { provide: getModelToken(PackagingBox.name), useValue: boxModel },
        { provide: getModelToken(PackagingStockMovement.name), useValue: movementModel },
        { provide: getModelToken(PackagingRecommendationDoc.name), useValue: recommendationModel },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn().mockResolvedValue(session) } },
      ],
    }).compile();
    service = module.get(PackagingBoxService);
  });

  it('schema khởi tạo được (Rule #23 — field union có type tường minh)', () => {
    expect(PackagingBoxSchema.path('price_vnd')).toBeDefined();
  });

  it('tạo thùng hợp lệ → is_sample=false, is_active=true', async () => {
    boxModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    await service.create(validDto);
    const [payload] = boxModel.create.mock.calls[0] as [Record<string, unknown>];
    expect(payload.is_sample).toBe(false);
    expect(payload.is_active).toBe(true);
  });

  it('kích thước ngoài nhỏ hơn lòng thùng → PKG_BOX_INVALID_DIMENSIONS', async () => {
    await expect(
      service.create(
        Object.assign(new CreatePackagingBoxDto(), validDto, {
          outer: { length_mm: 340, width_mm: 256, height_mm: 206 },
        }),
      ),
    ).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.BOX_INVALID_DIMENSIONS });
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
    expect(PackagingStockMovementSchema.path('note')).toBeDefined();
    expect(PackagingBoxSchema.path('storage_location')).toBeDefined();
  });

  it('tạo thùng mới luôn có tồn 0 (chỉ nhập qua stock-in để có dòng sổ)', async () => {
    boxModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    await service.create(validDto);
    const [payload] = boxModel.create.mock.calls[0] as [Record<string, unknown>];
    expect(payload.quantity_on_hand).toBe(0);
    expect(payload.reorder_level).toBe(10);
  });

  it('stock-in cộng tồn và ghi 1 dòng sổ với số dư sau khi nhập', async () => {
    const id = new Types.ObjectId();
    boxModel.findById.mockResolvedValue({ _id: id, code: 'M' });
    boxModel.findOneAndUpdate.mockResolvedValue({ _id: id, code: 'M', quantity_on_hand: 55 });

    await service.stockIn(id.toString(), 50, new Types.ObjectId().toString(), ' PO-1 ');

    const [, update] = boxModel.findOneAndUpdate.mock.calls[0] as [unknown, { $inc: { quantity_on_hand: number } }];
    expect(update.$inc.quantity_on_hand).toBe(50);
    const [rows] = movementModel.create.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({ box_code: 'M', delta: 50, reason: 'stock_in', balance_after: 55, note: 'PO-1' });
  });

  it('còn trống = tồn − số phương án chưa đóng đang giữ chỗ; loại trừ group đang tính lại', async () => {
    const groupId = new Types.ObjectId().toString();
    boxModel.find.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            { code: 'M', quantity_on_hand: 3, reorder_level: 2 },
            { code: 'L', quantity_on_hand: 1, reorder_level: 2 },
          ]),
      }),
    });
    recommendationModel.aggregate.mockResolvedValue([
      { _id: 'M', count: 2 },
      { _id: 'L', count: 4 },
    ]);

    const availability = await service.listAvailability({ groupId });

    expect(availability.get('M')).toEqual({ onHand: 3, reserved: 2, available: 1, reorderLevel: 2 });
    expect(availability.get('L')?.available).toBe(0);
    const [pipeline] = recommendationModel.aggregate.mock.calls[0] as [{ $match?: Record<string, unknown> }[]];
    expect(String((pipeline[0]?.$match?.order_group_id as { $ne: unknown }).$ne)).toBe(groupId);
  });

  it('pack khi kho đã hết thùng → PKG_BOX_OUT_OF_STOCK, không ghi sổ', async () => {
    boxModel.findOneAndUpdate.mockResolvedValue(null);
    await expect(
      service.consumeForPack(
        {} as never,
        [{ boxCode: 'M', recommendationId: new Types.ObjectId() }],
        new Types.ObjectId(),
        new Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK });
    expect(movementModel.create.mock.calls).toHaveLength(0);
  });
});
