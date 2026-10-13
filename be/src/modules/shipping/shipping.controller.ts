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
  UpdateCarrierDto,
  UpdateShippingSettingsDto,
} from './dto/shipping.dto';
import type { ShippingCarrierDocument } from './schemas/shipping-carrier.schema';
import { ShippingService, type GroupQuote } from './shipping.service';
import type { ShippingStrategy } from './utils/shipping-cost.util';

export interface CarrierResponse {
  id: string;
  code: string;
  name: string;
  volumetricDivisor: number;
  isSample: boolean;
  isActive: boolean;
  services: {
    code: string;
    name: string;
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
    services: doc.services.map((s) => ({
      code: s.code,
      name: s.name,
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
  async quote(@Param('groupId') groupId: string): Promise<GroupQuote> {
    return this.shippingService.quoteForGroup(groupId);
  }

  @Get('settings')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tùy chọn vận chuyển của Store Owner (chiến lược đề xuất, dịch vụ mặc định).',
  })
  async getSettings(): Promise<{
    strategy: ShippingStrategy;
    defaultCarrierCode: string | null;
    defaultServiceCode: string | null;
  }> {
    return this.shippingService.getSettings();
  }

  @Put('settings')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Cấu hình tùy chọn vận chuyển: cheapest / fastest / fixed (+ dịch vụ mặc định).',
  })
  async updateSettings(
    @Body() body: UpdateShippingSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    strategy: ShippingStrategy;
    defaultCarrierCode: string | null;
    defaultServiceCode: string | null;
  }> {
    return this.shippingService.updateSettings(body, user.userId);
  }
}
