import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum';
import { ToLocationDto } from '../../shipping/dto/shipping.dto';

export class StartShipmentDto {
  @ApiProperty({ example: '66f0...' })
  @IsMongoId()
  order_group_id!: string;

  @ApiPropertyOptional({ example: 'Giao buổi chiều' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  // Gộp thi_dev (04/10/2026) — chọn hãng + dịch vụ để ghi cước/ETA lên vận đơn
  // (GET /shipping/quote/:groupId). Tùy chọn: bỏ trống = giao bằng đội xe nhà.
  @ApiPropertyOptional({ example: 'SAMPLE-EXPRESS' })
  @IsOptional() @IsString() @MaxLength(30)
  carrier_code?: string;

  @ApiPropertyOptional({ example: 'STANDARD' })
  @IsOptional() @IsString() @MaxLength(30)
  service_code?: string;

  @ApiPropertyOptional({ example: '2026-10-05T09:00:00+07:00', description: 'Lịch hãng đến lấy hàng' })
  @IsOptional() @IsDateString()
  pickup_at?: string;

  // C4 (14/10/2026) — chỉ dùng khi hãng là API (GHN): sửa/bổ sung địa chỉ gửi hãng cho đơn bị che.
  @ApiPropertyOptional({ type: () => ToLocationDto })
  @IsOptional() @ValidateNested() @Type(() => ToLocationDto)
  to_location?: ToLocationDto;
}

/** C4 (14/10/2026) — PATCH /shipments/:id/to-location. */
export class UpdateToLocationDto extends ToLocationDto {}

/** C4 — POST /shipments/:id/carrier/cancel. */
export class CancelCarrierDto {
  @ApiPropertyOptional({ example: 'GHN-CO001', description: 'Mã lý do huỷ của GHN (GHN-CO001/CO002/CO003/GHN-CANCEL-OTHER). Bỏ trống = không gửi.' })
  @IsOptional() @IsString() @MaxLength(40)
  reason_code?: string;

  @ApiPropertyOptional({ example: 'Khách đổi địa chỉ, tạo lại vận đơn' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

/** C5 (14/10/2026) — POST /shipments/:id/carrier/simulate (chỉ môi trường demo). */
export class SimulateCarrierStatusDto {
  @ApiProperty({ example: 'picked', description: 'Trạng thái GHN muốn mô phỏng: picked, storing, transporting, delivering, delivered, delivery_fail, returning, returned, lost, damage... (không gồm cancel / ready_to_pick)' })
  @IsString() @MaxLength(40)
  status!: string;

  @ApiPropertyOptional({ example: 'GHN-DFC1A4', description: 'Mã lý do của GHN (giao thất bại: GHN-DFC1A4 không nghe máy, GHN-DCD0A8 khách đổi ý...)' })
  @IsOptional() @IsString() @MaxLength(40)
  reason_code?: string;

  @ApiPropertyOptional({ example: 'Khách không nghe máy' })
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

export class SchedulePickupDto {
  @ApiProperty({ example: '2026-10-05T09:00:00+07:00' })
  @IsDateString()
  pickup_at!: string;
}

/** Mọi nút đổi trạng thái vận đơn đều gửi version đọc được lần gần nhất. */
export class ShipmentActionDto {
  @ApiProperty({ example: 0, description: 'Field "version" của vận đơn đọc được lần gần nhất' })
  @IsInt() @Min(0)
  expected_version!: number;

  @ApiPropertyOptional({ example: 'Khách nhận tại bảo vệ tòa nhà' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class FailShipmentDto extends ShipmentActionDto {
  @ApiProperty({ enum: DeliveryFailureReason, example: DeliveryFailureReason.CUSTOMER_UNREACHABLE })
  @IsEnum(DeliveryFailureReason)
  reason_code!: DeliveryFailureReason;

  @ApiPropertyOptional({ example: '2026-09-28T17:00:00+07:00', description: 'Giờ khách hẹn giao lại (dùng với customer_rescheduled). Nút "Giao lại" mở đúng giờ này.' })
  @IsOptional() @IsDateString()
  reschedule_at?: string;
}

export class RetryShipmentDto extends ShipmentActionDto {
  @ApiPropertyOptional({ example: 'Khách gọi lại, đang ở nhà', description: 'Bắt buộc nếu giao lại SỚM hơn giờ cho phép — ghi vào lịch sử.' })
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300)
  override_reason?: string;
}
