import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  CreateCarrierDto,
  PackagingOptionsQueryDto,
  QuoteQueryDto,
  type ToLocationDto,
  UpdateCarrierDto,
  UpdateShippingSettingsDto,
} from './dto/shipping.dto';
import type { ShippingCarrierDocument } from './schemas/shipping-carrier.schema';
import { ShippingService, type GroupQuote, type PackagingOptionsResult, type ShippingSettingsView } from './shipping.service';
import type { ToLocationInput } from './live-carrier.service';

/** Query địa chỉ → ToLocationInput (bỏ field không gửi). */
function toLocationOf(q: ToLocationDto): ToLocationInput | null {
  const out: ToLocationInput = {};
  if (q.street !== undefined) out.street = q.street;
  if (q.ward_name) out.ward_name = q.ward_name;
  if (q.province_name) out.province_name = q.province_name;
  if (q.phone) out.phone = q.phone;
  return Object.keys(out).length > 0 ? out : null;
}

export interface CarrierResponse {
  id: string;
  code: string;
  name: string;
  volumetricDivisor: number;
  isSample: boolean;
  isActive: boolean;
  /** C4 (14/10/2026) — 'table' = bảng cước; 'live' = cước + vận đơn từ API hãng (GHN). */
  kind: 'table' | 'live';
  services: {
    code: string;
    name: string;
    serviceTypeId: number | null;
    etaMinDays: number;
    etaMaxDays: number;
    bands: { upToG: number; priceVnd: number }[];
    extraPriceVndPer500g: number;
  }[];
}

function toCarrierResponse(doc: ShippingCarrierDocument): CarrierResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    volumetricDivisor: doc.volumetric_divisor,
    isSample: doc.is_sample,
    isActive: doc.is_active,
    kind: doc.kind,
    services: doc.services.map((s) => ({
      code: s.code,
      name: s.name,
      serviceTypeId: s.carrier_service_type_id ?? null,
      etaMinDays: s.eta_min_days,
      etaMaxDays: s.eta_max_days,
      bands: s.bands.map((b) => ({ upToG: b.up_to_g, priceVnd: b.price_vnd })),
      extraPriceVndPer500g: s.extra_price_vnd_per_500g,
    })),
  };
}

@ApiTags('Shipping')
@ApiBearerAuth('JWT-auth')
@Controller('shipping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('carriers')
  @Roles(
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.WAREHOUSE_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Danh mục hãng vận chuyển + bảng cước (mặc định chỉ hãng đang dùng).',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    description: '"false" để lấy cả hãng đã ngừng dùng',
  })
  async listCarriers(
    @Query('active') active?: string,
  ): Promise<CarrierResponse[]> {
    return (await this.shippingService.listCarriers(active !== 'false')).map(
      toCarrierResponse,
    );
  }

  @Post('carriers')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Thêm hãng vận chuyển + dịch vụ + bảng cước theo bậc khối lượng.',
  })
  async createCarrier(
    @Body() body: CreateCarrierDto,
  ): Promise<CarrierResponse> {
    return toCarrierResponse(await this.shippingService.createCarrier(body));
  }

  @Patch('carriers/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Sửa hãng/bảng cước hoặc ngừng dùng (`is_active: false`). Không đổi được mã.',
  })
  async updateCarrier(
    @Param('id') id: string,
    @Body() body: UpdateCarrierDto,
  ): Promise<CarrierResponse> {
    return toCarrierResponse(
      await this.shippingService.updateCarrier(id, body),
    );
  }

  @Get('quote/:groupId')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Báo giá vận chuyển cho nhóm đơn: mỗi (hãng, dịch vụ) một dòng — cước từng kiện, tổng cước, thời gian giao dự kiến — kèm dịch vụ ĐỀ XUẤT theo tùy chọn của Store Owner.',
  })
  async quote(@Param('groupId') groupId: string, @Query() q: QuoteQueryDto): Promise<GroupQuote> {
    // C4 (14/10/2026) — query địa chỉ (street/ward_name/province_name/phone) chỉ dùng cho hãng API.
    return this.shippingService.quoteForGroup(groupId, toLocationOf(q));
  }

  @Get('packaging-options/:groupId')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'C6 — So TỔNG chi phí (thùng + vật tư chèn + phí ship của hãng/dịch vụ chọn) cho mọi thùng xếp vừa từng kiện; chỉ ra phương án rẻ nhất và số tiền tiết kiệm. Chỉ đọc — áp dụng bằng route đổi thùng của kế hoạch đóng gói.',
  })
  async packagingOptions(
    @Param('groupId') groupId: string,
    @Query() q: PackagingOptionsQueryDto,
  ): Promise<PackagingOptionsResult> {
    return this.shippingService.packagingOptions(groupId, q.carrier_code, q.service_code, toLocationOf(q));
  }

  @Get('settings')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tùy chọn vận chuyển của Store Owner (chiến lược đề xuất, dịch vụ mặc định).',
  })
  async getSettings(): Promise<ShippingSettingsView> {
    return this.shippingService.getSettings();
  }

  @Put('settings')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Cấu hình tùy chọn vận chuyển: cheapest / fastest / fixed (+ dịch vụ mặc định) và người gửi in trên nhãn vận đơn (sender_*).',
  })
  async updateSettings(
    @Body() body: UpdateShippingSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShippingSettingsView> {
    return this.shippingService.updateSettings(body, user.userId);
  }
}
