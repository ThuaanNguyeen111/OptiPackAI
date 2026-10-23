import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * 23/10/2026 — Tách 1 đơn ra khỏi nhóm gộp (gộp nhầm: cùng SĐT + địa chỉ nhưng là 2
 * khách khác nhau muốn giao riêng). Bắt buộc lý do để tra lại trong lịch sử.
 */
export class SplitOrderFromGroupDto {
  @ApiProperty({ example: 3, description: 'Giá trị "version" của nhóm đơn đang xem (chống 2 người sửa cùng lúc).' })
  @IsInt()
  @Min(0)
  expected_version!: number;

  @ApiProperty({ example: 'Khách gọi báo 2 đơn của 2 người khác nhau, muốn giao riêng' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}

/** 23/10/2026 — Gộp nhóm `source_group_id` VÀO nhóm trên URL (cùng sàn + cùng shop). */
export class MergeOrderGroupsDto {
  @ApiProperty({ example: '66f0a1b2c3d4e5f678905678', description: 'Nhóm sẽ bị gộp (đơn chuyển sang nhóm trên URL, nhóm này → canceled).' })
  @IsMongoId()
  source_group_id!: string;

  @ApiProperty({ example: 3, description: 'Giá trị "version" của nhóm trên URL.' })
  @IsInt()
  @Min(0)
  expected_version!: number;

  @ApiProperty({ example: 'Cùng khách, đơn Lazada bị che SĐT nên không tự gộp — đã gọi xác nhận' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}
