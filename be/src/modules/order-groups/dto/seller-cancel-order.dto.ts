import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 22/10/2026 — Người bán hủy 1 đơn AURELLE; lý do hiện cho khách trên website. */
export class SellerCancelOrderDto {
  @ApiProperty({ description: 'Lý do hủy (khách thấy trên trang đơn hàng)', example: 'Sản phẩm đã hết hàng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
