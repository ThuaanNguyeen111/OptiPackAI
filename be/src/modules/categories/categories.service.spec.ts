import { CategoriesService } from './categories.service';
import { CATEGORY_ERROR_CODES } from './categories.errors';

describe('CategoriesService (K2)', () => {
  let categoryModel: { findOne: jest.Mock; create: jest.Mock; countDocuments: jest.Mock; updateOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let binModel: { countDocuments: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    categoryModel = { findOne: jest.fn(), create: jest.fn().mockResolvedValue({}), countDocuments: jest.fn(), updateOne: jest.fn(), findOneAndUpdate: jest.fn() };
    binModel = { countDocuments: jest.fn() };
    service = new CategoriesService(categoryModel as never, binModel as never);
  });

  it('cấp 2 không có thang size -> CAT_SIZE_SCALE_REQUIRED', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'AO', level: 1, is_active: true });
    await expect(service.create({ code: 'ATHUN', name: 'Áo thun', parent_code: 'AO' })).rejects.toMatchObject({
      errorCode: CATEGORY_ERROR_CODES.SIZE_SCALE_REQUIRED,
    });
  });

  it('cấp 1 có thang size -> CAT_SIZE_SCALE_NOT_ALLOWED', async () => {
    await expect(service.create({ code: 'AO', name: 'Áo', size_scale: ['S'] })).rejects.toMatchObject({
      errorCode: CATEGORY_ERROR_CODES.SIZE_SCALE_NOT_ALLOWED,
    });
  });

  it('cha là cấp 2 (định tạo cấp 3) -> CAT_PARENT_NOT_LEVEL_1', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'ATHUN', level: 2, is_active: true });
    await expect(service.create({ code: 'ATHUNX', name: 'X', parent_code: 'ATHUN', size_scale: ['S'] })).rejects.toMatchObject({
      errorCode: CATEGORY_ERROR_CODES.PARENT_NOT_LEVEL_1,
    });
  });

  it('tạo cấp 2 hợp lệ -> level 2', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'AO', level: 1, is_active: true });
    await service.create({ code: 'ATHUN', name: 'Áo thun', parent_code: 'AO', size_scale: ['S', 'M'] });
    expect(categoryModel.create).toHaveBeenCalledWith(expect.objectContaining({ level: 2, parent_code: 'AO' }));
  });

  it('bỏ size đang có ô kệ đăng ký -> CAT_SIZE_IN_USE, không ghi', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'ATHUN', level: 2, size_scale: ['S', 'M', 'L'], is_active: true });
    binModel.countDocuments.mockResolvedValue(3);
    await expect(service.update('ATHUN', { size_scale: ['S', 'M'] })).rejects.toMatchObject({ errorCode: CATEGORY_ERROR_CODES.SIZE_IN_USE });
    expect(categoryModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('tắt cấp 1 còn con đang bật -> CAT_HAS_ACTIVE_CHILDREN', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'AO', level: 1, is_active: true });
    categoryModel.countDocuments.mockResolvedValue(2);
    await expect(service.deactivate('AO')).rejects.toMatchObject({ errorCode: CATEGORY_ERROR_CODES.HAS_ACTIVE_CHILDREN });
  });

  it('gắn danh mục cấp 1 vào kệ -> CAT_NOT_LEVEL_2', async () => {
    categoryModel.findOne.mockResolvedValue({ code: 'AO', level: 1, is_active: true });
    await expect(service.getActiveLevel2('AO')).rejects.toMatchObject({ errorCode: CATEGORY_ERROR_CODES.NOT_LEVEL_2 });
  });
});
