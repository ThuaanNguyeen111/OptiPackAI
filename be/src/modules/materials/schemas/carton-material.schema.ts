import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const CARTON_BOARD_TYPES = ['3PLY', '5PLY', '7PLY'] as const;
export type CartonBoardType = (typeof CARTON_BOARD_TYPES)[number];

@Schema({ collection: 'carton_materials', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class CartonMaterial {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  material_code!: string;

  @Prop({ required: true, trim: true })
  material_name!: string;

  @Prop({ required: true, min: 1 })
  length_mm!: number;

  @Prop({ required: true, min: 1 })
  width_mm!: number;

  @Prop({ required: true, min: 1 })
  height_mm!: number;

  @Prop({ required: true, enum: CARTON_BOARD_TYPES })
  board_type!: CartonBoardType;

  @Prop({ required: true, min: 0, default: 0 })
  quantity_on_hand!: number;

  @Prop({ required: true, min: 0, default: 10 })
  reorder_level!: number;

  @Prop({ required: true, min: 0, default: 0 })
  unit_cost_vnd!: number;

  @Prop({ required: true, trim: true })
  storage_location!: string;

  @Prop({ default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type CartonMaterialDocument = HydratedDocument<CartonMaterial>;
export const CartonMaterialSchema = SchemaFactory.createForClass(CartonMaterial);

CartonMaterialSchema.index({ material_name: 'text', material_code: 'text' });
CartonMaterialSchema.index({ quantity_on_hand: 1, reorder_level: 1 });
