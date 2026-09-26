import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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
}
