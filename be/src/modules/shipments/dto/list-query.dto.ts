import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ReturnStatus } from '../enums/return.enums';

/** (09/10/2026) Phân trang chung — trước đây đọc chuỗi trần, id sai định dạng lọt thành 500. */
class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page phải ≥ 1' })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit phải ≥ 1' })
  @Max(100, { message: 'limit tối đa 100' })
  limit?: number;
}

export class ListShipmentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus, { message: 'status không hợp lệ' })
  status?: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'order_group_id phải là ObjectId hợp lệ' })
  order_group_id?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'true = chỉ vận đơn quá hạn giao' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'overdue chỉ nhận true/false' })
  overdue?: 'true' | 'false';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier_code?: string;

  /** 10/11/2026 — App mobile: "Việc của tôi" của shipper. Nhận `me` (người đang đăng nhập) hoặc id người dùng. */
  @ApiPropertyOptional({ example: 'me', description: 'Lọc vận đơn được gán cho shipper: `me` = người đang đăng nhập, hoặc id người dùng.' })
  @IsOptional()
  @Matches(/^(me|[a-f0-9]{24})$/i, { message: 'shipper_id phải là "me" hoặc ObjectId hợp lệ' })
  shipper_id?: string;

  /** 10/11/2026 — Phân trang kiểu con trỏ cho app: truyền `updatedAt` của vận đơn cuối trang trước. */
  @ApiPropertyOptional({ description: 'Con trỏ phân trang: `updatedAt` của vận đơn cuối trang trước (ISO). Có `before` thì bỏ qua `page`.' })
  @IsOptional()
  @IsISO8601({}, { message: 'before phải là thời điểm ISO' })
  before?: string;
}

export class ListReturnsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ReturnStatus })
  @IsOptional()
  @IsEnum(ReturnStatus, { message: 'status không hợp lệ' })
  status?: ReturnStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'order_group_id phải là ObjectId hợp lệ' })
  order_group_id?: string;
}
