import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class RestockSkuDto {
  @ApiProperty({ description: 'Số lượng NHẬP THÊM (cộng dồn, không phải set lại toàn bộ)', example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;

  // K2 — vượt sức chứa ô thì bị chặn 409 WH_BIN_OVER_CAPACITY; gửi force=true
  // để xác nhận vẫn nhập (VD hàng về gấp, xếp tạm chồng lên).
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
