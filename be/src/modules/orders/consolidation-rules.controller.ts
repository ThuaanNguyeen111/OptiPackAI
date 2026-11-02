import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  CONSOLIDATION_RULE_FIELDS,
  CONSOLIDATION_RULE_MATCHES,
  MAX_CONSOLIDATION_RULES,
  SYNC_PLATFORMS,
} from './order-sync-policy';
import { ConsolidationRulesPreview, ConsolidationRulesService, ConsolidationRulesState } from './consolidation-rules.service';
import {
  DeleteConsolidationRuleQueryDto,
  PreviewConsolidationRulesDto,
  SaveConsolidationRuleDto,
  TranslateConsolidationRuleDto,
} from './dto/consolidation-rule.dto';
import { ConsolidationRuleAiService, ConsolidationRuleTranslation } from './consolidation-rule-ai.service';

export const RULE_FIELD_LABELS: Record<string, string> = {
  phone: 'Số điện thoại',
  full_name: 'Tên người nhận',
  address_line1: 'Địa chỉ chi tiết (số nhà, đường)',
  city: 'Thành phố (theo sàn)',
  province_name: 'Tỉnh/thành',
  district_name: 'Quận/huyện',
  ward_name: 'Phường/xã',
};
const RULE_MATCH_LABELS: Record<string, string> = {
  normalized: 'Gần đúng (bỏ dấu, không phân biệt hoa thường)',
  exact: 'Chính xác từng ký tự',
};

interface Option {
  value: string;
  label: string;
}

export interface ConsolidationRulesResponse extends ConsolidationRulesState {
  limits: { maxRules: number; requiredOneOf: string[] };
  options: { fields: Option[]; matches: Option[]; platforms: Option[] };
}

function toResponse(state: ConsolidationRulesState): ConsolidationRulesResponse {
  return {
    ...state,
    limits: { maxRules: MAX_CONSOLIDATION_RULES, requiredOneOf: ['phone', 'address_line1'] },
    options: {
      fields: CONSOLIDATION_RULE_FIELDS.map((v) => ({ value: v, label: RULE_FIELD_LABELS[v] ?? v })),
      matches: CONSOLIDATION_RULE_MATCHES.map((v) => ({ value: v, label: RULE_MATCH_LABELS[v] ?? v })),
      platforms: SYNC_PLATFORMS.map((v) => ({ value: v, label: v === MarketplacePlatform.LAZADA ? 'Lazada' : 'AURELLE' })),
    },
  };
}

/**
 * 31/10/2026 — quy tắc gộp đơn bổ sung (GUIDE_DOC/CONSOLIDATION_RULES_DESIGN.md).
 * Admin sửa; Store Owner chỉ xem.
 */
@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('order-sync-settings/rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsolidationRulesController {
  constructor(
    private readonly rulesService: ConsolidationRulesService,
    private readonly ruleAiService: ConsolidationRuleAiService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Danh sách quy tắc gộp bổ sung + version cấu hình + lựa chọn có nhãn cho form.' })
  async list(): Promise<ConsolidationRulesResponse> {
    return toResponse(await this.rulesService.list());
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm quy tắc (tạo phiên bản cấu hình mới). Lệch expected_version → 409.' })
  async create(@Body() dto: SaveConsolidationRuleDto, @CurrentUser() user: AuthenticatedUser): Promise<ConsolidationRulesResponse> {
    return toResponse(await this.rulesService.create(dto, user.userId));
  }

  // Khai TRƯỚC ':ruleId' — route tĩnh phải đứng trước route có tham số.
  @Post('preview')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Xem trước bộ quy tắc nháp trên ≤ 5.000 đơn chưa xong: số nhóm hiện tại / không quy tắc / có quy tắc, số đơn bị bỏ qua do thiếu dữ liệu, ≤ 10 ví dụ. Không ghi DB.',
  })
  async preview(@Body() dto: PreviewConsolidationRulesDto): Promise<ConsolidationRulesPreview> {
    return this.rulesService.preview(dto);
  }

  @Post('translate')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Dịch câu chữ thành quy tắc nháp bằng AI (chỉ gửi câu chữ, không gửi dữ liệu khách). Không lưu — FE cho Admin xem trước rồi POST /rules. AI không dùng được → 503 ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE kèm details.suggestions.',
  })
  async translate(@Body() dto: TranslateConsolidationRuleDto): Promise<ConsolidationRuleTranslation> {
    return this.ruleAiService.translate(dto.text);
  }

  @Put(':ruleId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa toàn bộ 1 quy tắc (giữ nguyên id). Lệch expected_version → 409.' })
  async update(
    @Param('ruleId') ruleId: string,
    @Body() dto: SaveConsolidationRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConsolidationRulesResponse> {
    return toResponse(await this.rulesService.update(ruleId, dto, user.userId));
  }

  @Delete(':ruleId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xoá 1 quy tắc. Bắt buộc ?expected_version=N.' })
  async remove(
    @Param('ruleId') ruleId: string,
    @Query() query: DeleteConsolidationRuleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConsolidationRulesResponse> {
    return toResponse(await this.rulesService.remove(ruleId, query.expected_version, user.userId));
  }
}
