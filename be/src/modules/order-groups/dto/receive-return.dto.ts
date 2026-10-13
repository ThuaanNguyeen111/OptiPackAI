import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReceiveReturnLineDto {
  @ApiProperty({ example: 'AO-THUN-M' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 2, description: 'Số sản phẩm đạt chất lượng — được nhập lại tồn kho' })
  @IsInt({ message: 'good_quantity phải là số nguyên' })
  @Min(0)
  good_quantity!: number;

  @ApiProperty({ example: 1, description: 'Số sản phẩm hư hỏng — chỉ ghi nhận, KHÔNG nhập lại tồn' })
  @IsInt({ message: 'damaged_quantity phải là số nguyên' })
  @Min(0)
  damaged_quantity!: number;

  @ApiProperty({ required: false, example: 'Rách túi zip' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/** Nhận hàng hoàn về kho (group phải đang `returned`). */
export class ReceiveReturnDto {
  @ApiProperty({ description: 'Kho nhận hàng hoàn' })
  @IsMongoId({ message: 'warehouse_id không đúng định dạng' })
  warehouse_id!: string;

  @ApiProperty({ type: [ReceiveReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 dòng' })
  @ValidateNested({ each: true })
  @Type(() => ReceiveReturnLineDto)
  lines!: ReceiveReturnLineDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
