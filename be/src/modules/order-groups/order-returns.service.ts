import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SkuBinAssignment,
  SkuBinAssignmentDocument,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { OrderGroupsService } from './order-groups.service';
import { ReceiveReturnDto } from './dto/receive-return.dto';
import {
  ReturnReceipt,
  ReturnReceiptDocument,
} from './schemas/return-receipt.schema';

/**
 * ===================================================================
 * order-returns.service.ts — MỚI (30/09/2026): nhận hàng hoàn về kho
 * ===================================================================
 * Bước còn thiếu sau `returned`: nhận hàng, kiểm chất lượng từng SKU, nhập lại
 * tồn phần đạt. Toàn bộ trong 1 transaction: cộng tồn (atomic `$inc`, đúng
 * kho + sàn + shop + SKU) và ghi biên nhận cùng lúc — lỗi ở đâu thì hoàn tác hết.
 * ===================================================================
 */
@Injectable()
export class OrderReturnsService {
  private readonly logger = new Logger(OrderReturnsService.name);

  constructor(
    @InjectModel(ReturnReceipt.name)
    private readonly receiptModel: Model<ReturnReceiptDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getReceipt(groupId: string): Promise<ReturnReceiptDocument | null> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    return this.receiptModel.findOne({ order_group_id: group._id });
  }

  async receiveReturn(
    groupId: string,
    userId: string,
    dto: ReceiveReturnDto,
  ): Promise<ReturnReceiptDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    if (group.fulfillment_status !== GroupFulfillmentStatus.RETURNED) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.RETURN_NOT_RETURNED,
        `Chỉ nhận hàng hoàn khi nhóm ở trạng thái "returned" (hiện là "${group.fulfillment_status}").`,
        HttpStatus.CONFLICT,
        { groupId, status: group.fulfillment_status },
      );
    }

    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.sku)) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.RETURN_DUPLICATE_LINE,
          `SKU "${line.sku}" xuất hiện ở nhiều dòng — gộp thành 1 dòng.`,
          HttpStatus.BAD_REQUEST,
          { sku: line.sku },
        );
      }
      seen.add(line.sku);
    }

    // Không nhận nhiều hơn số đã giao đi (chống nhập khống tồn kho).
    const ordered =
      await this.orderGroupsService.getOrderedQuantitiesForGroup(groupId);
    for (const line of dto.lines) {
      const shipped = ordered.get(line.sku);
      if (shipped === undefined) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
          `SKU "${line.sku}" không thuộc Order Group "${groupId}".`,
          HttpStatus.NOT_FOUND,
          { groupId, sku: line.sku },
        );
      }
      if (line.good_quantity + line.damaged_quantity > shipped) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.RETURN_EXCEEDS_SHIPPED,
          `SKU "${line.sku}" chỉ đã giao ${String(shipped)}, không thể nhận hoàn ${String(line.good_quantity + line.damaged_quantity)}.`,
          HttpStatus.CONFLICT,
          {
            sku: line.sku,
            shipped,
            received: line.good_quantity + line.damaged_quantity,
          },
        );
      }
    }

    const totalGood = dto.lines.reduce((sum, l) => sum + l.good_quantity, 0);
    const totalDamaged = dto.lines.reduce(
      (sum, l) => sum + l.damaged_quantity,
      0,
    );
    const warehouseId = new Types.ObjectId(dto.warehouse_id);

    const session = await this.connection.startSession();
    let receipt: ReturnReceiptDocument | undefined;
    try {
      await session.withTransaction(async () => {
        for (const line of dto.lines) {
          if (line.good_quantity === 0) continue;
          const restored = await this.assignmentModel.updateOne(
            {
              warehouse_id: warehouseId,
              platform: group.platform,
              shop_id: group.shop_id,
              seller_sku: line.sku,
            },
            { $inc: { quantity_on_hand: line.good_quantity } },
            { session },
          );
          if (restored.matchedCount === 0) {
            throw new AppException(
              ORD_GROUP_ERROR_CODES.RETURN_SKU_NOT_ASSIGNED,
              `SKU "${line.sku}" chưa được gán vị trí trong kho này — gán vị trí trước rồi nhận hoàn.`,
              HttpStatus.CONFLICT,
              { sku: line.sku, warehouseId: dto.warehouse_id },
            );
          }
        }
        const created = await this.receiptModel.create(
          [
            {
              order_group_id: group._id,
              warehouse_id: warehouseId,
              lines: dto.lines.map((l) => ({
                seller_sku: l.sku,
                good_quantity: l.good_quantity,
                damaged_quantity: l.damaged_quantity,
                note: l.note?.trim() ? l.note.trim() : null,
              })),
              total_good: totalGood,
              total_damaged: totalDamaged,
              received_by: new Types.ObjectId(userId),
              note: dto.note?.trim() ? dto.note.trim() : null,
            },
          ],
          { session },
        );
        receipt = created[0];
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.RETURN_ALREADY_RECEIVED,
          'Nhóm này đã được nhận hàng hoàn trước đó.',
          HttpStatus.CONFLICT,
          { groupId },
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (!receipt) throw new Error('Không tạo được biên nhận hàng hoàn.');

    this.logger.log(
      `Nhận hàng hoàn group ${groupId}: ${String(totalGood)} nhập lại tồn, ${String(totalDamaged)} hư hỏng.`,
    );
    try {
      const { title, message } =
        this.notificationsService.buildReturnReceivedMessage({
          groupId,
          goodUnits: totalGood,
          damagedUnits: totalDamaged,
        });
      await this.notificationsService.notify({
        recipientRole: UserRole.STORE_OWNER,
        type: NotificationType.RETURN_RECEIVED,
        severity: totalDamaged > 0 ? 'warning' : 'info',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Gửi thông báo nhận hàng hoàn thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return receipt;
  }
}
