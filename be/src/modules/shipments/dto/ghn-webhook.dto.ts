import { IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * AOFP-324 — body Order Status Callback của GHN. Chỉ kiểm kiểu các trường OptiPack dùng;
 * GHN gửi thêm nhiều trường khác (Fee, Weight, CODAmount…) nên route này dùng pipe riêng
 * không `forbidNonWhitelisted` (xem CarrierWebhookController). Sai kiểu → 400 thay vì 500.
 */
export class GhnWebhookDto {
  /** GHN gửi số; chấp nhận cả chuỗi. */
  @IsOptional()
  @ValidateIf((_o, v) => typeof v !== 'number')
  @IsString({ message: 'ShopID phải là số hoặc chuỗi' })
  ShopID?: number | string;

  @IsOptional() @IsString({ message: 'OrderCode phải là chuỗi' }) OrderCode?: string;
  @IsOptional() @IsString({ message: 'ClientOrderCode phải là chuỗi' }) ClientOrderCode?: string;
  @IsOptional() @IsString({ message: 'Type phải là chuỗi' }) Type?: string;
  @IsOptional() @IsString({ message: 'Status phải là chuỗi' }) Status?: string;
  @IsOptional() @IsString({ message: 'Time phải là chuỗi' }) Time?: string;
  @IsOptional() @IsString({ message: 'Reason phải là chuỗi' }) Reason?: string;
  @IsOptional() @IsString({ message: 'ReasonCode phải là chuỗi' }) ReasonCode?: string;
}
