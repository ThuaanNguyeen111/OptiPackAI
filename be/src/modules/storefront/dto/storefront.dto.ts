import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

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
