import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartonMaterial, CartonMaterialSchema } from './schemas/carton-material.schema';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CartonMaterial.name, schema: CartonMaterialSchema }])],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
