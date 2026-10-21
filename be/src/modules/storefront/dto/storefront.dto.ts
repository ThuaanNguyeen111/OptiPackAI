import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

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
export class ShippingAddressDto {
  @IsString() @IsNotEmpty() recipient_name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsString() @IsNotEmpty() province!: string;
  // Hệ thống mới sau sáp nhập bỏ cấp quận/huyện; địa chỉ cũ vẫn gửi field này.
  @IsOptional() @IsString() district?: string;
  @IsString() @IsNotEmpty() ward!: string;
  @IsString() @IsNotEmpty() address_line!: string;
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
export class CreateStorefrontReturnDto {
  @IsIn(['return_refund', 'refund_only']) type!: 'return_refund' | 'refund_only';
  @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StorefrontReturnItemDto) items!: StorefrontReturnItemDto[];
  @IsOptional() @IsString() @MaxLength(500) customer_note?: string;
}
