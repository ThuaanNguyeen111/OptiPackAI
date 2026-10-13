import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt,
  IsMongoId, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class AdminVariantDto {
  @IsOptional() @IsMongoId() id?: string;
  @IsOptional() @IsString() @MaxLength(100) color?: string | null;
  @IsOptional() @IsString() @MaxLength(100) size?: string | null;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) quantityOnHand!: number;
}

export class SaveAdminProductDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsOptional() @IsMongoId() categoryId?: string | null;
  @IsString() @MaxLength(2048) thumbnailUrl!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(2048, { each: true })
  galleryImages!: string[];
  @IsIn(['draft', 'active', 'hidden']) status!: 'draft' | 'active' | 'hidden';
  @IsBoolean() isFeatured!: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => AdminVariantDto)
  variants!: AdminVariantDto[];
}
