import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import {
  type AiConnectionTestResult,
  AiSettingsService,
  type AiSettingsView,
  type RevealedAiKey,
} from './ai-settings.service';
import { RevealAiKeyDto, TestAiSettingsDto, UpdateAiSettingsDto } from './dto/ai-settings.dto';

@ApiTags('AI settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('ai-settings')
export class AiSettingsController {
  constructor(private readonly service: AiSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Cấu hình AI đang dùng (Admin). Không bao giờ trả API key, chỉ 4 ký tự cuối.' })
  async get(): Promise<{ settings: AiSettingsView }> {
    return { settings: await this.service.view() };
  }

  @Put()
  @ApiOperation({ summary: 'Lưu nhà cung cấp / model / API key. api_key không gửi = giữ, null = xoá (quay về .env).' })
  async update(
    @Body() dto: UpdateAiSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ settings: AiSettingsView }> {
    return { settings: await this.service.update(dto, user.userId) };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thử kết nối bằng giá trị đang nhập (chưa lưu) và lấy danh sách model của nhà cung cấp.' })
  async test(@Body() dto: TestAiSettingsDto): Promise<{ result: AiConnectionTestResult }> {
    return { result: await this.service.test(dto) };
  }

  @Post('reveal-key')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Xem API key thật đang dùng (web hoặc .env). Bắt nhập lại mật khẩu; mọi lần thử đều ghi lịch sử thao tác.' })
  async revealKey(
    @Body() dto: RevealAiKeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ key: RevealedAiKey }> {
    return { key: await this.service.revealKey(dto, user.userId) };
  }
}
