import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';

describe('WarehouseService — bố cục kho mới K2', () => {
  const warehouseId = new Types.ObjectId();
  const zoneId = new Types.ObjectId();
  const activeWarehouse = { _id: warehouseId, warehouse_code: 'WH-01', is_active: true };
  const category = { code: 'ATHUN', level: 2, size_scale: ['S', 'M', 'L'], is_active: true };

  let warehouseModel: { findById: jest.Mock };
  let zoneModel: { findById: jest.Mock; find: jest.Mock };
  let binModel: { countDocuments: jest.Mock; insertMany: jest.Mock; find: jest.Mock; findById: jest.Mock };
  let assignmentModel: { aggregate: jest.Mock; findOne: jest.Mock; findOneAndUpdate: jest.Mock; find: jest.Mock };
  let categoriesService: { getActiveLevel2: jest.Mock };
  let orderGroupsService: { getPickableItemsForGroup: jest.Mock; findOrderGroupById: jest.Mock };
  let service: WarehouseService;

  const zone = (code: string): { _id: Types.ObjectId; warehouse_id: Types.ObjectId; zone_code: string } => ({ _id: zoneId, warehouse_id: warehouseId, zone_code: code });
  const rackDto = { aisle: 'D1', side: 'P' as const, bay: 2, category_code: 'ATHUN', tiers: [{ tier: 1, size: 'L' }, { tier: 2, size: 'M' }], cells_per_tier: 3, cell_colors: ['DEN', 'TRANG', 'VANG'], capacity_per_cell: 30 };

  beforeEach(() => {
    warehouseModel = { findById: jest.fn().mockResolvedValue(activeWarehouse) };
    zoneModel = { findById: jest.fn(), find: jest.fn() };
    binModel = { countDocuments: jest.fn().mockResolvedValue(0), insertMany: jest.fn().mockResolvedValue([]), find: jest.fn(), findById: jest.fn() };
    assignmentModel = { aggregate: jest.fn().mockResolvedValue([]), findOne: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn() };
    categoriesService = { getActiveLevel2: jest.fn().mockResolvedValue(category) };
    orderGroupsService = { getPickableItemsForGroup: jest.fn(), findOrderGroupById: jest.fn().mockResolvedValue({ platform: 'lazada', shop_id: 's1' }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new WarehouseService(
      warehouseModel as never, zoneModel as never, binModel as never, assignmentModel as never,
      {} as never, orderGroupsService as never, { startSession: jest.fn().mockResolvedValue(session) } as never, categoriesService as never,
      { create: jest.fn().mockResolvedValue([{}]), find: jest.fn() } as never, // K3 movementModel
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never, // K4b mappingModel (chưa nối gì -> đường lùi)
    );
  });

  describe('createRack', () => {
    it('sinh đủ số tầng × số ô, đúng mã 5 phần, mỗi ô mang size của tầng + màu của ô', async () => {
      zoneModel.findById.mockResolvedValue(zone('KA'));
      binModel.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

      await service.createRack(zoneId.toString(), rackDto);

      const [docs] = binModel.insertMany.mock.calls[0] as [{ bin_code: string; designated: { size: string; color_code: string }; capacity: number; layout_version: number }[]];
      expect(docs).toHaveLength(6);
      expect(docs[0]).toMatchObject({ bin_code: 'KA-D1-P02-T01-1', designated: { size: 'L', color_code: 'DEN' }, capacity: 30, layout_version: 2 });
      expect(docs[5]).toMatchObject({ bin_code: 'KA-D1-P02-T02-3', designated: { size: 'M', color_code: 'VANG' } });
    });

    it('khu mã chuẩn cũ ("A") -> 409 WH_ZONE_LEGACY_FORMAT, không tạo ô nào', async () => {
      zoneModel.findById.mockResolvedValue(zone('A'));
      await expect(service.createRack(zoneId.toString(), rackDto)).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.ZONE_LEGACY_FORMAT });
      expect(binModel.insertMany).not.toHaveBeenCalled();
    });

    it('size tầng không thuộc thang size danh mục -> WH_SIZE_NOT_IN_SCALE', async () => {
      zoneModel.findById.mockResolvedValue(zone('KA'));
      await expect(service.createRack(zoneId.toString(), { ...rackDto, tiers: [{ tier: 1, size: 'XXL' }] })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.SIZE_NOT_IN_SCALE,
      });
    });

    it('số màu khác số ô -> WH_INVALID_RACK_LAYOUT', async () => {
      zoneModel.findById.mockResolvedValue(zone('KA'));
      await expect(service.createRack(zoneId.toString(), { ...rackDto, cell_colors: ['DEN'] })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT,
      });
    });

    it('kệ đã tồn tại -> 409 WH_RACK_EXISTS (không trộn đăng ký cũ/mới)', async () => {
      zoneModel.findById.mockResolvedValue(zone('KA'));
      binModel.countDocuments.mockResolvedValue(6);
      await expect(service.createRack(zoneId.toString(), rackDto)).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.RACK_EXISTS });
    });
  });

  describe('sức chứa khi nhập hàng', () => {
    const assignmentId = new Types.ObjectId().toString();
    const binId = new Types.ObjectId();

    beforeEach(() => {
      assignmentModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: assignmentId, bin_location_id: binId, quantity_on_hand: 25 }) });
      binModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: binId, bin_code: 'KA-D1-P02-T01-1', capacity: 30 }) });
      assignmentModel.aggregate.mockResolvedValue([{ total: 25 }]);
    });

    it('25 + 10 > 30 -> 409 WH_BIN_OVER_CAPACITY, không cộng', async () => {
      await expect(service.restockSku(warehouseId.toString(), assignmentId, 10)).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.BIN_OVER_CAPACITY,
      });
      expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('force=true -> cho cộng dù vượt', async () => {
      assignmentModel.findOneAndUpdate.mockResolvedValue({ _id: assignmentId });
      await expect(service.restockSku(warehouseId.toString(), assignmentId, 10, true)).resolves.toBeDefined();
    });
  });

  it('Picking List kho đang chuyển đổi: kệ mới theo lộ trình đi trước, kệ cũ + chưa gán đi sau', async () => {
    const binNew1 = { _id: new Types.ObjectId(), zone_id: zoneId, bin_code: 'KA-D2-T01-T01-1', pick_sequence: 500 };
    const binNew2 = { _id: new Types.ObjectId(), zone_id: zoneId, bin_code: 'KA-D1-T05-T01-1', pick_sequence: 100 };
    const binOld = { _id: new Types.ObjectId(), zone_id: zoneId, bin_code: 'A-01-01-01' };
    orderGroupsService.getPickableItemsForGroup.mockResolvedValue({
      items: ['OLD', 'NEW-500', 'NONE', 'NEW-100'].map((sku) => ({ sku, quantity: 1 })),
    });
    assignmentModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { seller_sku: 'OLD', bin_location_id: binOld._id },
      { seller_sku: 'NEW-500', bin_location_id: binNew1._id },
      { seller_sku: 'NEW-100', bin_location_id: binNew2._id },
    ]) });
    binModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([binNew1, binNew2, binOld]) });
    zoneModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: zoneId, zone_code: 'KA' }]) });

    const list = await service.getEnrichedPickingList(warehouseId.toString(), new Types.ObjectId().toString());

    expect(list.map((i) => i.sku)).toEqual(['NEW-100', 'NEW-500', 'OLD', 'NONE']);
  });
});
