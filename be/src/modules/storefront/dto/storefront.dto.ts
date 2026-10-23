import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class RegisterCustomerDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
}
export class LoginCustomerDto { @IsEmail() email!: string; @IsString() password!: string; }
export class AddCartItemDto { @IsString() @IsNotEmpty() variant_id!: string; @IsInt() @Min(1) quantity!: number; }
export class SyncCartDto { @ValidateNested({ each: true }) @Type(() => AddCartItemDto) items!: AddCartItemDto[]; }
export class CheckoutItemDto { @IsString() @IsNotEmpty() variant_id!: string; @IsInt() @Min(1) quantity!: number; }
// 22/10/2026 — khớp yêu cầu GHN (tạo vận đơn): tên ≤ 100 ký tự, SĐT di động VN 10 số bắt đầu bằng 0,
// địa chỉ ≤ 255 ký tự. Website chỉ còn địa chỉ MỚI 2 cấp (tỉnh + phường) — GHN nhận `is_new_to_address`.
export class ShippingAddressDto {
  @IsString() @IsNotEmpty() @MaxLength(100) recipient_name!: string;
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0 (VD 0912345678).' }) phone!: string;
  @IsString() @IsNotEmpty() province!: string;
  // Hệ thống mới sau sáp nhập bỏ cấp quận/huyện; địa chỉ cũ vẫn gửi field này.
  @IsOptional() @IsString() district?: string;
  @IsString() @IsNotEmpty() ward!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) address_line!: string;
}
export class CheckoutDto {
  @ValidateNested({ each: true }) @Type(() => CheckoutItemDto) items!: CheckoutItemDto[];
  @ValidateNested() @Type(() => ShippingAddressDto) shipping_address!: ShippingAddressDto;
  @IsIn(['cod']) payment_method!: 'cod';
  @IsOptional() @IsString() customer_note?: string;
  @IsOptional() @IsString() @IsNotEmpty() client_order_id?: string;
}

export class CancelOrderDto { @IsOptional() @IsString() @MaxLength(300) reason?: string; }

export class StorefrontReturnItemDto {
  @IsString() @IsNotEmpty() sku!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsIn(['defective', 'wrong_item', 'not_as_described', 'size_not_fit', 'changed_mind', 'other']) reason_code!: string;
}
/** 21/10/2026 — biến thể khách muốn đổi sang (chỉ khi type = exchange). */
export class StorefrontExchangeItemDto {
  @IsString() @IsNotEmpty() sku!: string;
  @IsInt() @Min(1) quantity!: number;
}
export class CreateStorefrontReturnDto {
  @IsIn(['return_refund', 'refund_only', 'exchange']) type!: 'return_refund' | 'refund_only' | 'exchange';
  @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StorefrontReturnItemDto) items!: StorefrontReturnItemDto[];
  @IsOptional() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StorefrontExchangeItemDto) exchange_items?: StorefrontExchangeItemDto[];
  @IsOptional() @IsString() @MaxLength(500) customer_note?: string;
}
