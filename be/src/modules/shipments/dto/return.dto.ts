import { PackagingInspectionLineDto } from '../../packaging-materials/dto/packaging-material.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { InspectionResult, ReturnReason, ReturnType } from '../enums/return.enums';

export class ReturnItemDto {
  @ApiProperty({ example: 'ATD-M-01' }) @IsString() @MaxLength(100) seller_sku!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
  @ApiProperty({ enum: ReturnReason }) @IsEnum(ReturnReason) reason_code!: ReturnReason;
}

/** [Admin — đóng vai khách] Giả lập khách yêu cầu trả hàng. */
export class CreateReturnDto {
  @ApiProperty() @IsMongoId() order_group_id!: string;

  @ApiProperty({ enum: [ReturnType.RETURN_REFUND, ReturnType.REFUND_ONLY] })
  @IsIn([ReturnType.RETURN_REFUND, ReturnType.REFUND_ONLY])
  type!: ReturnType.RETURN_REFUND | ReturnType.REFUND_ONLY;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  @ApiPropertyOptional({ example: 'Áo bị lỗi đường may' }) @IsOptional() @IsString() @MaxLength(1000)
  customer_note?: string;
}

export class ReturnActionDto {
  @ApiProperty({ example: 0 }) @IsInt() @Min(0) expected_version!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class InspectionLineDto {
  @ApiProperty() @IsString() @MaxLength(100) seller_sku!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
  @ApiProperty({ enum: InspectionResult }) @IsEnum(InspectionResult) result!: InspectionResult;
  @ApiPropertyOptional({ description: 'Bắt buộc khi result = restock' }) @IsOptional() @IsMongoId() warehouse_id?: string;
  @ApiPropertyOptional({ description: 'Bắt buộc khi result = restock — ô nhập lại' }) @IsOptional() @IsMongoId() bin_location_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class InspectReturnDto {
  @ApiProperty({ example: 2 }) @IsInt() @Min(0) expected_version!: number;

  @ApiProperty({ type: [InspectionLineDto], description: 'Tổng số lượng các dòng của mỗi SKU PHẢI bằng số lượng trả của SKU đó' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InspectionLineDto)
  lines!: InspectionLineDto[];

  @ApiPropertyOptional({ type: [PackagingInspectionLineDto], description: 'G4 — kiểm luôn thùng/xốp đi kèm hàng hoàn' })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PackagingInspectionLineDto)
  packaging?: PackagingInspectionLineDto[];
}
