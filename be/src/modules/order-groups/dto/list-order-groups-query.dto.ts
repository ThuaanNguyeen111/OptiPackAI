import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GroupFulfillmentStatus } from '../enums/group-fulfillment-status.enum';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class ListOrderGroupsQueryDto {
  @ApiPropertyOptional({
    enum: GroupFulfillmentStatus,
    description:
      'Lọc theo trạng thái xử lý nội bộ — VD Warehouse Staff lọc "picking" để xem hàng đợi cần lấy, Packaging Staff lọc "pending_approval".',
  })
  @IsOptional()
  @IsEnum(GroupFulfillmentStatus)
  fulfillment_status?: GroupFulfillmentStatus;

  @ApiPropertyOptional({ enum: MarketplacePlatform, description: 'Lọc theo sàn' })
  @IsOptional()
  @IsEnum(MarketplacePlatform)
  platform?: MarketplacePlatform;

  @ApiPropertyOptional({
    enum: ['normal', 'express'],
    description: 'Lọc theo loại đơn — VD Store Owner xem riêng danh sách đơn Hỏa Tốc cần ưu tiên.',
  })
  @IsOptional()
  @IsIn(['normal', 'express'])
  order_priority?: 'normal' | 'express';

  @ApiPropertyOptional({ description: '(09/10/2026) Nhóm giao cho 1 nhân viên lấy hàng — "việc của tôi".' })
  @IsOptional()
  @IsMongoId({ message: 'assigned_staff_id phải là ObjectId hợp lệ' })
  assigned_staff_id?: string;

  @ApiPropertyOptional({ description: 'Nhóm giao cho 1 người đóng gói trên kế hoạch đang hoạt động; khác assigned_staff_id (người lấy hàng).' })
  @IsOptional()
  @IsMongoId({ message: 'assigned_packer_id phải là ObjectId hợp lệ' })
  assigned_packer_id?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: '(09/10/2026) true = chỉ nhóm đang thiếu hàng (K5).' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'stock_shortage chỉ nhận true/false' })
  stock_shortage?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: '22/10/2026 — true = chỉ nhóm đã lấy xong nhưng kẹt đóng gói vì SKU chưa đo (packingBlocked khác null).',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'packing_blocked chỉ nhận true/false' })
  packing_blocked?: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      '22/10/2026 — tìm nhóm: mã nhóm đủ 24 ký tự, ĐUÔI mã nhóm (4–23 ký tự hex, như màn kho/đóng gói hiện) hoặc mã đơn sàn / mã đơn AURELLE (khớp chính xác).',
  })
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  @MaxLength(64, { message: 'q tối đa 64 ký tự' })
  q?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: '(09/10/2026) true = chỉ đơn hỏa tốc đã quá hạn.' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'is_overdue chỉ nhận true/false' })
  is_overdue?: 'true' | 'false';

  @ApiPropertyOptional({
    description: '(09/10/2026) Con trỏ trang kế: createdAt (ISO) của dòng CUỐI trang trước. Danh sách luôn mới nhất trước.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'before phải là thời điểm ISO' })
  before?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit phải ≥ 1' })
  @Max(200, { message: 'limit tối đa 200' })
  limit?: number;
}
