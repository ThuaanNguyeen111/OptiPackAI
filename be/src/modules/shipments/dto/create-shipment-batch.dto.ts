import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Body của POST /shipments/batch (Mục 9.5, hàng #4). 🔄 30/09/2026: BẮT BUỘC chọn
 * hãng + dịch vụ (lấy từ GET /shipping/quote/:groupId). Gửi mảng 1 phần tử vẫn
 * hợp lệ — tạo vận đơn cho ĐÚNG 1 group.
 */
export class CreateShipmentBatchDto {
  @ApiProperty({
    description:
      'Danh sách Order Group ID cần tạo vận đơn — mỗi group PHẢI đang ở fulfillment_status = "packed".',
    example: ['66f0a1b2c3d4e5f678901234'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 Order Group.' })
  @IsMongoId({
    each: true,
    message: 'Mỗi order_group_id phải đúng định dạng ObjectId.',
  })
  order_group_ids!: string[];

  @ApiProperty({
    example: 'SAMPLE-EXPRESS',
    description: 'Mã hãng vận chuyển (GET /shipping/carriers)',
  })
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'carrier_code không hợp lệ' })
  carrier_code!: string;

  @ApiProperty({ example: 'STANDARD', description: 'Mã dịch vụ của hãng' })
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'service_code không hợp lệ' })
  service_code!: string;

  @ApiProperty({
    description:
      'Ghi chú tùy chọn cho lần giao này (VD hướng dẫn cho shipper).',
    required: false,
    example: 'Giao giờ hành chính, gọi trước khi tới.',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    example: '2026-10-01T02:00:00.000Z',
    description:
      'Lịch hãng đến lấy hàng (ISO 8601, không ở quá khứ). Bỏ trống = chưa hẹn.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'pickup_at phải là ngày giờ ISO 8601' })
  pickup_at?: string;
}

export class SchedulePickupDto {
  @ApiProperty({ example: '2026-10-01T02:00:00.000Z' })
  @IsDateString({}, { message: 'pickup_at phải là ngày giờ ISO 8601' })
  pickup_at!: string;
}
