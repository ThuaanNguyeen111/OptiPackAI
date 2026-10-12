import { MasterSkusService } from './master-skus.service';
import { MASTER_SKU_ERROR_CODES as E } from './master-skus.errors';

//!=============================================
// 10/10/2026 — xoá hẳn SKU nội bộ tạo nhầm (báo cáo Hải Phượng): chỉ khi chưa
// nối SKU sàn, chưa nằm trên ô, chưa có nhập–xuất.
//!=============================================
describe('MasterSkusService.purge (10/10/2026)', () => {
  let skuModel: { findOne: jest.Mock; deleteOne: jest.Mock };
  let mappingModel: { countDocuments: jest.Mock };
  let assignmentModel: { exists: jest.Mock };
  let movementModel: { exists: jest.Mock };
  let service: MasterSkusService;

  beforeEach(() => {
    skuModel = {
      findOne: jest.fn().mockResolvedValue({ master_sku: 'POLO-001-DEN-M', is_active: true }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    mappingModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    assignmentModel = { exists: jest.fn().mockResolvedValue(null) };
    movementModel = { exists: jest.fn().mockResolvedValue(null) };
    service = new MasterSkusService(
      {} as never,
      skuModel as never,
      mappingModel as never,
      {} as never,
      {} as never,
      {} as never,
      assignmentModel as never,
      movementModel as never,
    );
  });

  it('chưa từng dùng → xoá hẳn', async () => {
    await expect(service.purge('POLO-001-DEN-M')).resolves.toEqual({ deleted: true, masterSku: 'POLO-001-DEN-M' });
    expect(skuModel.deleteOne).toHaveBeenCalledWith({ master_sku: 'POLO-001-DEN-M' });
  });

  it.each([
    ['còn SKU sàn nối vào', (): void => { mappingModel.countDocuments.mockResolvedValue(2); }, E.HAS_MAPPINGS],
    ['còn nằm trên ô', (): void => { assignmentModel.exists.mockResolvedValue({ _id: 1 }); }, E.HAS_STOCK],
    ['đã có nhập–xuất', (): void => { movementModel.exists.mockResolvedValue({ _id: 1 }); }, E.HAS_HISTORY],
  ])('%s → 409 %s, không xoá', async (_label, arrange, code) => {
    arrange();
    await expect(service.purge('POLO-001-DEN-M')).rejects.toMatchObject({ errorCode: code });
    expect(skuModel.deleteOne).not.toHaveBeenCalled();
  });

  it('SKU không tồn tại → 404 MSKU_NOT_FOUND', async () => {
    skuModel.findOne.mockResolvedValue(null);
    await expect(service.purge('KHONG-CO')).rejects.toMatchObject({ errorCode: E.NOT_FOUND });
  });
});
