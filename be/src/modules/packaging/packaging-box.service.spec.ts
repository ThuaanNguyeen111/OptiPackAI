import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingBox, PackagingBoxSchema } from './schemas/packaging-box.schema';
import { CreatePackagingBoxDto } from './dto/packaging-box.dto';
import { PACKAGING_ERROR_CODES } from './packaging.errors';

describe('PackagingBoxService', () => {
  let service: PackagingBoxService;
  let boxModel: { find: jest.Mock; create: jest.Mock; findById: jest.Mock; findByIdAndUpdate: jest.Mock };

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
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingBoxService,
        { provide: getModelToken(PackagingBox.name), useValue: boxModel },
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
});
