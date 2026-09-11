import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationDocument } from './schemas/notification.schema';
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
  @ApiOperation({ summary: 'Danh sách thông báo của user hiện tại (đích danh + theo role), tối đa 50 gần nhất.' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('is_read') isRead?: string,
  ): Promise<NotificationDocument[]> {
    const isReadBool = isRead === undefined ? undefined : isRead === 'true';
    return this.notificationsService.listForUser(user.userId, user.role, isReadBool);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc — FE gọi định kỳ (polling) để cập nhật chuông thông báo.' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.notificationsService.unreadCount(user.userId, user.role);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc.' })
  async markAsRead(@Param('id') id: string): Promise<NotificationDocument> {
    return this.notificationsService.markAsRead(id);
  }
}
