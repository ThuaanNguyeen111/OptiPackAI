import {
  Controller,
  HttpStatus,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService, type NotificationView } from './notifications.service';
import { AppException } from '../../common/exceptions/app-exception';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiQuery({ name: 'is_read', required: false, type: Boolean })
  @ApiQuery({ name: 'before', required: false, description: 'ISO created_at của dòng cuối trang trước (trang kế tiếp).' })
  @ApiQuery({ name: 'limit', required: false, description: '1–100, mặc định 50.' })
  @ApiOperation({
    summary:
      'Danh sách thông báo của user hiện tại (đích danh + theo role), mới nhất trước. is_read là trạng thái của CHÍNH người gọi. Trang kế: ?before=<created_at dòng cuối>.',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('is_read') isRead?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<NotificationView[]> {
    const isReadBool = isRead === undefined ? undefined : isRead === 'true';
    let beforeDate: Date | undefined;
    if (before !== undefined) {
      beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) {
        throw new AppException('VALIDATION_ERROR', 'before phải là thời điểm ISO hợp lệ.', HttpStatus.BAD_REQUEST);
      }
    }
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    return this.notificationsService.listForUser(user.userId, user.role, isReadBool, {
      before: beforeDate,
      limit: parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('unread-count')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Số thông báo chưa đọc — FE gọi định kỳ (polling) để cập nhật chuông thông báo.',
  })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    const count = await this.notificationsService.unreadCount(
      user.userId,
      user.role,
    );
    return { count };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu TẤT CẢ thông báo của người gọi là đã đọc (theo role: chỉ với người gọi).' })
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return { updated: await this.notificationsService.markAllAsRead(user.userId, user.role) };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Đánh dấu 1 thông báo đã đọc (chỉ thông báo của chính mình).',
  })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationView> {
    return this.notificationsService.markAsRead(id, user.userId, user.role);
  }
}
