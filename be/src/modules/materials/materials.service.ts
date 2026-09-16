import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { CreateCartonMaterialDto } from './dto/create-carton-material.dto';
import { ListCartonMaterialsDto } from './dto/list-carton-materials.dto';
import { CartonMaterial, CartonMaterialDocument } from './schemas/carton-material.schema';
import { MATERIAL_ERROR_CODES } from './materials.errors';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(CartonMaterial.name)
    private readonly cartonModel: Model<CartonMaterialDocument>,
  ) {}

  async createCarton(dto: CreateCartonMaterialDto): Promise<CartonMaterialDocument> {
    const code = dto.material_code.toUpperCase();
    const existing = await this.cartonModel.exists({ material_code: code });
    if (existing) {
      throw new AppException(
        MATERIAL_ERROR_CODES.CARTON_CODE_ALREADY_EXISTS,
        `Mã thùng "${code}" đã tồn tại.`,
        HttpStatus.CONFLICT,
        { materialCode: code },
      );
    }

    return this.cartonModel.create({
      material_code: code,
      material_name: dto.material_name,
      length_mm: dto.length_mm,
      width_mm: dto.width_mm,
      height_mm: dto.height_mm,
      board_type: dto.board_type,
      storage_location: dto.storage_location,
      quantity_on_hand: dto.quantity_on_hand ?? 0,
      reorder_level: dto.reorder_level ?? 10,
      unit_cost_vnd: dto.unit_cost_vnd ?? 0,
    });
  }

  async listCartons(query: ListCartonMaterialsDto): Promise<CartonMaterialDocument[]> {
    const filter: Record<string, unknown> = { is_active: true };
    const search = query.search?.trim();
    if (search) {
      filter.$or = [
        { material_code: { $regex: search, $options: 'i' } },
        { material_name: { $regex: search, $options: 'i' } },
        { storage_location: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.stock === 'out_of_stock') {
      filter.quantity_on_hand = 0;
    } else if (query.stock === 'low_stock') {
      filter.$expr = { $and: [{ $gt: ['$quantity_on_hand', 0] }, { $lte: ['$quantity_on_hand', '$reorder_level'] }] };
    } else if (query.stock === 'in_stock') {
      filter.$expr = { $gt: ['$quantity_on_hand', '$reorder_level'] };
    }

    return this.cartonModel.find(filter).sort({ material_name: 1 }).lean();
  }

  async getSummary(): Promise<{ total: number; inStock: number; lowStock: number; outOfStock: number }> {
    const cartons = await this.cartonModel.find({ is_active: true }).select('quantity_on_hand reorder_level').lean();
    return cartons.reduce(
      (summary, carton) => {
        summary.total += 1;
        if (carton.quantity_on_hand === 0) summary.outOfStock += 1;
        else if (carton.quantity_on_hand <= carton.reorder_level) summary.lowStock += 1;
        else summary.inStock += 1;
        return summary;
      },
      { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
    );
  }

  async stockIn(cartonId: string, quantity: number): Promise<CartonMaterialDocument> {
    if (!Types.ObjectId.isValid(cartonId)) {
      throw this.notFound(cartonId);
    }
    const carton = await this.cartonModel.findOneAndUpdate(
      { _id: cartonId, is_active: true },
      { $inc: { quantity_on_hand: quantity } },
      { new: true, runValidators: true },
    );
    if (!carton) throw this.notFound(cartonId);
    return carton;
  }

  private notFound(cartonId: string): AppException {
    return new AppException(
      MATERIAL_ERROR_CODES.CARTON_NOT_FOUND,
      `Không tìm thấy thùng carton với id "${cartonId}".`,
      HttpStatus.NOT_FOUND,
      { cartonId },
    );
  }
}
