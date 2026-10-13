import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

/** 13/10/2026 — Coordinator liên kết tay 2 nhóm đơn cùng người nhận (giao chung chuyến). */
export class LinkOrderGroupDto {
  @ApiProperty({
    example: '66f0a1b2c3d4e5f678905678',
    description: 'Nhóm đơn cần liên kết với nhóm trên URL',
  })
  @IsMongoId()
  target_group_id!: string;

  @ApiPropertyOptional({
    example: 'Cùng khách — đơn Lazada bị che tên, đã gọi xác nhận',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
