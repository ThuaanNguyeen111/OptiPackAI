import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum';

export class StartShipmentDto {
  @ApiProperty({ example: '66f0...' })
  @IsMongoId()
  order_group_id!: string;

  @ApiPropertyOptional({ example: 'Giao buổi chiều' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
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
