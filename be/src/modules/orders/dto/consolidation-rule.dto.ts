import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CONSOLIDATION_RULE_FIELDS,
  CONSOLIDATION_RULE_MATCHES,
  MAX_CONSOLIDATION_RULES,
  SYNC_PLATFORMS,
} from '../order-sync-policy';
import type { ConsolidationRuleField, ConsolidationRuleMatch } from '../order-sync-policy';

/** 31/10/2026 — 1 trường của quy tắc gộp bổ sung. */
export class ConsolidationRuleFieldDto {
  @ApiProperty({ enum: CONSOLIDATION_RULE_FIELDS, example: 'phone' })
  @IsIn(CONSOLIDATION_RULE_FIELDS)
  field!: ConsolidationRuleField;

  @ApiProperty({ enum: CONSOLIDATION_RULE_MATCHES, example: 'normalized', description: 'normalized = bỏ dấu, không phân biệt hoa thường; exact = giữ nguyên. SĐT luôn chuẩn hoá số.' })
  @IsIn(CONSOLIDATION_RULE_MATCHES)
  match!: ConsolidationRuleMatch;
}

/** Nội dung 1 quy tắc (dùng cho thêm, sửa và xem trước). */
export class ConsolidationRuleBodyDto {
  @ApiProperty({ example: 'Cùng SĐT + phường', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Câu Admin gõ (lưu để tra lại). null khi dựng bằng form.', nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  source_text?: string | null;

  @ApiProperty({ type: [ConsolidationRuleFieldDto], description: 'Trường phải TRÙNG để gộp. Bắt buộc có phone hoặc address_line1.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONSOLIDATION_RULE_FIELDS.length)
  @ValidateNested({ each: true })
  @Type(() => ConsolidationRuleFieldDto)
  fields!: ConsolidationRuleFieldDto[];

  @ApiPropertyOptional({ enum: SYNC_PLATFORMS, isArray: true, description: 'Rỗng / không gửi = mọi sàn.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(SYNC_PLATFORMS, { each: true })
  platforms?: string[];

  @ApiPropertyOptional({ description: 'Giới hạn thời gian riêng (giờ). null = dùng giới hạn chung.', nullable: true, minimum: 1, maximum: 720 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  max_window_hours?: number | null;

  @ApiPropertyOptional({ description: 'Mặc định true.', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Thêm / sửa quy tắc: kèm version cấu hình đang xem để chặn 2 người lưu đè nhau. */
export class SaveConsolidationRuleDto extends ConsolidationRuleBodyDto {
  @ApiProperty({ description: 'Version cấu hình đang xem (null = đang dùng mặc định). Lệch → 409 ORD_SYNC_SETTINGS_CONFLICT.', nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  expected_version!: number | null;
}

export class DeleteConsolidationRuleQueryDto {
  @ApiProperty({ description: 'Version cấu hình đang xem. Lệch → 409.' })
  @Type(() => Number)
  @IsInt()
  expected_version!: number;
}

/** Xem trước: danh sách quy tắc NHÁP thay cho bộ đang lưu. */
export class PreviewConsolidationRulesDto {
  @ApiProperty({ type: [ConsolidationRuleBodyDto], description: `Bộ quy tắc muốn thử (tối đa ${String(MAX_CONSOLIDATION_RULES)}). Gửi [] để xem khi không có quy tắc.` })
  @IsArray()
  @ArrayMaxSize(MAX_CONSOLIDATION_RULES)
  @ValidateNested({ each: true })
  @Type(() => ConsolidationRuleBodyDto)
  rules!: ConsolidationRuleBodyDto[];
}

export class TranslateConsolidationRuleDto {
  @ApiProperty({ example: 'Gộp đơn cùng SĐT và cùng phường, khác tên vẫn gộp', maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  text!: string;
}
