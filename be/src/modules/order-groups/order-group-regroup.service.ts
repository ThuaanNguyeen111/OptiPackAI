import { Injectable, Logger, HttpStatus, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  ActivityLog,
  ActivityLogDocument,
} from '../activity-log/schemas/activity-log.schema';
import {
  GROUP_STATUS_LABELS,
  recordActivity,
} from '../activity-log/activity-log.util';
import { notPackableStatuses } from '../orders/order-sync-policy';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  computeRecipientKey,
  normalizePhoneNumber,
} from '../orders/utils/consolidation-key.util';
import { isMaskedValue } from '../orders/utils/vn-administrative-area.util';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { PickEvent, PickEventDocument } from './schemas/pick-event.schema';
import { OrderGroupsService } from './order-groups.service';

// 13/10/2026 — nhóm "đã xong" không còn tính là liên kết; nhóm đã giao thì khoá liên kết tay.
const LINK_CLOSED_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.DELIVERED,
  GroupFulfillmentStatus.RETURNING,
  GroupFulfillmentStatus.RETURNED,
  GroupFulfillmentStatus.CANCELED,
];
const LINK_LOCKED_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.SHIPPED,
  ...LINK_CLOSED_STATUSES,
];

/**
 * 13/11/2026 — tách từ OrderGroupsService: liên kết tay, tách đơn, gộp nhóm.
 * Dùng chung trạng thái/giữ chỗ/đếm đơn qua OrderGroupsService (core) để mọi
 * thay đổi trạng thái vẫn đi một cổng.
 */
@Injectable()
export class OrderGroupRegroupService {
  private readonly logger = new Logger(OrderGroupRegroupService.name);

  constructor(
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(PickEvent.name)
    private readonly pickEventModel: Model<PickEventDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly core: OrderGroupsService,
    @Optional()
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel?: Model<ActivityLogDocument>,
  ) {}

  /**
   * MỚI (29/09/2026, Mục 9.5) — các nhóm đơn KHÁC (có thể khác sàn) cùng
   * `recipient_key` với `groupId`, "chưa giao xong" (chưa DELIVERED/RETURNED/
   * CANCELED). Dùng cho `GET :id/linked`, `linkedGroupCount`, và cảnh báo
   * "lệch nhịp" (linkedPending) khi ship 1 group còn sibling chưa packed.
   */
  async findLinkedGroups(groupId: string): Promise<OrderGroupDocument[]> {
    const group = await this.core.findOrderGroupById(groupId);
    // 13/10/2026 — liên kết = cùng recipient_key (tự động) HOẶC cùng manual_link_id (tay).
    const linkConditions: Record<string, unknown>[] = [];
    if (group.recipient_key)
      linkConditions.push({ recipient_key: group.recipient_key });
    if (group.manual_link_id)
      linkConditions.push({ manual_link_id: group.manual_link_id });
    if (linkConditions.length === 0) return [];

    return this.orderGroupModel
      .find({
        ...(linkConditions.length === 1
          ? linkConditions[0]
          : { $or: linkConditions }),
        _id: { $ne: group._id },
        fulfillment_status: { $nin: LINK_CLOSED_STATUSES },
      })
      .lean();
  }

  /**
   * 13/10/2026 — Coordinator LIÊN KẾT TAY 2 nhóm đơn mà hệ thống không tự nhận
   * ra là cùng người nhận (VD đơn Lazada bị che dữ liệu + đơn AURELLE). Cả 2
   * nhóm phải chưa giao (chưa shipped/delivered/returned/canceled). Nhóm đã có
   * liên kết tay thì nối vào bộ đó; 2 bộ khác nhau thì gộp thành 1 bộ.
   */
  async linkGroupsManually(
    groupId: string,
    targetGroupId: string,
    note: string | undefined,
    actorId: string,
  ): Promise<OrderGroupDocument[]> {
    if (groupId === targetGroupId) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.LINK_SELF,
        'Không thể liên kết một nhóm đơn với chính nó.',
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }
    const [group, target] = await Promise.all([
      this.core.findOrderGroupById(groupId),
      this.core.findOrderGroupById(targetGroupId),
    ]);
    for (const g of [group, target]) this.assertLinkable(g);

    const linkId =
      group.manual_link_id ?? target.manual_link_id ?? new Types.ObjectId();
    const now = new Date();
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // 2 bộ liên kết tay khác nhau → gộp bộ của target vào bộ của group.
        if (
          group.manual_link_id &&
          target.manual_link_id &&
          !group.manual_link_id.equals(target.manual_link_id)
        ) {
          await this.orderGroupModel.updateMany(
            { manual_link_id: target.manual_link_id },
            { $set: { manual_link_id: linkId } },
            { session },
          );
        }
        await this.orderGroupModel.updateMany(
          { _id: { $in: [group._id, target._id] } },
          {
            $set: {
              manual_link_id: linkId,
              manual_linked_by: actorId,
              manual_linked_at: now,
              manual_link_note: note?.trim() ? note.trim() : null,
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    this.logger.log(
      `Liên kết tay nhóm ${groupId} với ${targetGroupId} (bộ ${linkId.toString()}) bởi ${actorId}.`,
    );
    return this.findLinkedGroups(groupId);
  }

  /** 13/10/2026 — bỏ liên kết tay của 1 nhóm. Bộ chỉ còn 1 nhóm → xoá luôn liên kết của nhóm đó. */
  async unlinkGroupManually(groupId: string): Promise<void> {
    const group = await this.core.findOrderGroupById(groupId);
    if (!group.manual_link_id) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.NOT_MANUALLY_LINKED,
        'Nhóm đơn này không có liên kết tay để bỏ.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    this.assertLinkable(group);
    const linkId = group.manual_link_id;
    const cleared = {
      manual_link_id: null,
      manual_linked_by: null,
      manual_linked_at: null,
      manual_link_note: null,
    };
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.orderGroupModel.updateOne(
          { _id: group._id },
          { $set: cleared },
          { session },
        );
        const remaining = await this.orderGroupModel
          .countDocuments({ manual_link_id: linkId })
          .session(session);
        if (remaining <= 1) {
          await this.orderGroupModel.updateMany(
            { manual_link_id: linkId },
            { $set: cleared },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
  }

  // ===================================================================
  // 23/10/2026 — TÁCH / GỘP NHÓM ĐƠN TAY
  // ===================================================================
  //
  // Chỉ cho phép khi nhóm còn `awaiting_packaging` / `picking` VÀ CHƯA quét món nào
  // trong lượt lấy hiện tại. Lý do: hàng đã quét được tính theo NHÓM (pick_events gắn
  // order_group_id, không gắn đơn) — chuyển đơn đi khi đã quét sẽ làm hàng thật trên
  // tay nhân viên lệch với số "đã lấy" của cả 2 nhóm, giữ chỗ tồn cũng lệch theo.
  // Đã quét rồi thì cứ lấy + đóng theo nhóm hiện tại: mỗi đơn vẫn ra kiện + vận đơn
  // riêng mang đúng người nhận của đơn đó (packing_plans.parcels[].order_id).

  /** Đơn cần tách → nhóm mới riêng (đóng, không tự gom thêm). Trả nhóm gốc + nhóm mới. */
  async splitOrderFromGroup(
    groupId: string,
    orderId: string,
    expectedVersion: number,
    note: string,
    actorId: string,
  ): Promise<{
    sourceGroup: OrderGroupDocument;
    newGroup: OrderGroupDocument;
  }> {
    const group = await this.core.loadGroupOrThrow(groupId);
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ORDER_NOT_FOUND,
        `Không tìm thấy đơn "${orderId}".`,
        HttpStatus.NOT_FOUND,
        { orderId },
      );
    }
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      consolidated_group_id: group._id,
    });
    if (!order) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ORDER_NOT_FOUND,
        `Đơn "${orderId}" không thuộc nhóm đơn "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId, orderId },
      );
    }
    if ((notPackableStatuses() as string[]).includes(order.status)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
        `Đơn ${order.platform_order_id} đã ở trạng thái "${order.status}" (hủy/sự cố) — không còn gì để tách.`,
        HttpStatus.CONFLICT,
        { groupId, orderId, orderStatus: order.status },
      );
    }
    if (group.__v !== expectedVersion)
      throw this.regroupVersionConflict(groupId, expectedVersion, group.__v);
    await this.assertRegroupable(group, 'tách đơn');
    const active = await this.orderModel.countDocuments({
      consolidated_group_id: group._id,
      status: { $nin: notPackableStatuses() },
    });
    if (active < 2) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
        'Nhóm chỉ còn 1 đơn còn hiệu lực — không có gì để tách.',
        HttpStatus.CONFLICT,
        { groupId, activeOrderCount: active },
      );
    }

    const newGroupId = new Types.ObjectId();
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.assertNoPicks(group, 'tách đơn', session);
        const bumped = await this.orderGroupModel.updateOne(
          {
            _id: group._id,
            __v: expectedVersion,
            fulfillment_status: group.fulfillment_status,
          },
          { $inc: { __v: 1, order_count: -1 } },
          { session },
        );
        if (bumped.matchedCount === 0)
          throw this.regroupVersionConflict(groupId, expectedVersion, null);
        await this.orderGroupModel.create(
          [
            {
              _id: newGroupId,
              platform: group.platform,
              shop_id: group.shop_id,
              order_count: 1,
              shop_name_snapshot: group.shop_name_snapshot,
              recipient_key: computeRecipientKey(
                order.recipient.full_name,
                order.recipient.phone,
                order.recipient.address_line1,
                order.recipient.city,
              ),
              order_priority: group.order_priority,
              packaging_deadline: group.packaging_deadline,
              split_from_group_id: group._id,
              consolidation_closed: true,
            },
          ],
          { session },
        );
        const moved = await this.orderModel.updateOne(
          { _id: order._id, consolidated_group_id: group._id },
          {
            $set: { consolidated_group_id: newGroupId, is_consolidated: false },
          },
          { session },
        );
        if (moved.modifiedCount !== 1)
          throw this.regroupVersionConflict(groupId, expectedVersion, null);
        // Nhóm gốc còn đúng 1 đơn → đơn đó không còn là "đơn gộp".
        const left = await this.orderModel
          .countDocuments({ consolidated_group_id: group._id })
          .session(session);
        if (left === 1) {
          await this.orderModel.updateMany(
            { consolidated_group_id: group._id },
            { $set: { is_consolidated: false } },
            { session },
          );
        }
        const summary = `Tách đơn ${order.platform_order_id} (${order.recipient.full_name}) ra nhóm riêng ${newGroupId.toString()}`;
        for (const [gid, entityCode] of [
          [group._id, order.platform_order_id],
          [newGroupId, order.platform_order_id],
        ] as const) {
          await recordActivity(
            this.activityLogModel,
            {
              category: 'orders',
              action: 'order_group.split',
              summary,
              actorId,
              orderGroupId: gid,
              entityType: 'order',
              entityId: order._id,
              entityCode,
              note,
            },
            session,
          );
        }
      });
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Nhóm ${groupId}: tách đơn ${order.platform_order_id} sang nhóm ${newGroupId.toString()} (bởi ${actorId}).`,
    );
    await Promise.all([
      this.core.refreshOrderCounts(group._id),
      this.core.refreshOrderCounts(newGroupId),
    ]);
    await this.core.reconcileReservation(groupId); // nhu cầu nhóm gốc giảm → trả bớt giữ chỗ
    const created = await this.core.loadGroupOrThrow(newGroupId.toString());
    // Gán nhân viên kho + giữ chỗ + chuyển picking như mọi nhóm mới.
    const newGroup = await this.core.startPickingPhase(created);
    return { sourceGroup: await this.core.loadGroupOrThrow(groupId), newGroup };
  }

  /** Gộp nhóm `sourceGroupId` VÀO nhóm `groupId`: chuyển hết đơn, nhóm nguồn → canceled. */
  async mergeGroups(
    groupId: string,
    sourceGroupId: string,
    expectedVersion: number,
    note: string,
    actorId: string,
  ): Promise<OrderGroupDocument> {
    if (groupId === sourceGroupId) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.MERGE_SELF,
        'Không thể gộp một nhóm đơn với chính nó.',
        HttpStatus.BAD_REQUEST,
        {
          groupId,
        },
      );
    }
    const [target, source] = await Promise.all([
      this.core.loadGroupOrThrow(groupId),
      this.core.loadGroupOrThrow(sourceGroupId),
    ]);
    // 29/10/2026 — nhóm giao hỏa tốc (khách AURELLE trả phí, shop tự giao trong 3 giờ) luôn đi riêng.
    if (target.requires_self_delivery || source.requires_self_delivery) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.MERGE_EXPRESS,
        'Nhóm giao hỏa tốc luôn đi riêng (shop tự giao trong 3 giờ) — không gộp với nhóm khác.',
        HttpStatus.CONFLICT,
        { groupId, sourceGroupId },
      );
    }
    if (
      target.platform !== source.platform ||
      target.shop_id !== source.shop_id
    ) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.MERGE_SCOPE_MISMATCH,
        'Hai nhóm khác sàn hoặc khác shop — không gộp chung được (tồn kho và hồ sơ SKU tính theo từng shop). ' +
          'Nếu là cùng 1 khách, dùng "Liên kết" (POST /order-groups/:id/link) để giao chung chuyến.',
        HttpStatus.CONFLICT,
        {
          groupId,
          sourceGroupId,
          target: [target.platform, target.shop_id],
          source: [source.platform, source.shop_id],
        },
      );
    }
    if (target.__v !== expectedVersion)
      throw this.regroupVersionConflict(groupId, expectedVersion, target.__v);
    await this.assertRegroupable(target, 'gộp nhóm');
    await this.assertRegroupable(source, 'gộp nhóm');
    const sourceOrders = await this.orderModel
      .find({ consolidated_group_id: source._id })
      .select('_id platform_order_id status')
      .lean();
    if (
      !sourceOrders.some(
        (o) => !(notPackableStatuses() as string[]).includes(o.status),
      )
    ) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
        'Nhóm nguồn không còn đơn nào còn hiệu lực — không có gì để gộp.',
        HttpStatus.CONFLICT,
        { sourceGroupId },
      );
    }

    // Vận đơn của 1 nhóm dùng CHUNG 1 địa chỉ sửa tay (shipments.to_location, Coordinator bổ
    // sung cho đơn bị che) → không được gộp 2 khách có SĐT thật KHÁC nhau vào 1 nhóm, nếu không
    // địa chỉ sửa cho người này sẽ đè lên kiện của người kia. Khác SĐT → dùng "Liên kết".
    const phones = new Set(
      (
        await this.orderModel
          .find({
            consolidated_group_id: { $in: [target._id, source._id] },
            status: { $nin: notPackableStatuses() },
          })
          .select('recipient.phone')
          .lean()
      )
        .map(
          (o) =>
            (o.recipient as { phone?: string } | undefined)?.phone?.trim() ??
            '',
        )
        .filter((p) => p !== '' && !isMaskedValue(p))
        .map((p) => normalizePhoneNumber(p)),
    );
    if (phones.size > 1) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.MERGE_RECIPIENT_MISMATCH,
        'Hai nhóm có số điện thoại người nhận khác nhau — không gộp chung 1 nhóm được (vận đơn của nhóm dùng chung địa chỉ giao). ' +
          'Nếu vẫn muốn lấy hàng/giao cùng chuyến, dùng "Liên kết" (POST /order-groups/:id/link).',
        HttpStatus.CONFLICT,
        { groupId, sourceGroupId, distinctPhones: phones.size },
      );
    }

    const codes = sourceOrders.map((o) => o.platform_order_id).join(', ');
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.assertNoPicks(target, 'gộp nhóm', session);
        await this.assertNoPicks(source, 'gộp nhóm', session);
        const closed = await this.orderGroupModel.updateOne(
          {
            _id: source._id,
            __v: source.__v,
            fulfillment_status: source.fulfillment_status,
          },
          {
            $set: {
              fulfillment_status: GroupFulfillmentStatus.CANCELED,
              merged_into_group_id: target._id,
              order_count: 0,
            },
            $inc: { __v: 1 },
          },
          { session },
        );
        if (closed.matchedCount === 0)
          throw this.regroupVersionConflict(sourceGroupId, source.__v, null);
        const bumped = await this.orderGroupModel.updateOne(
          {
            _id: target._id,
            __v: expectedVersion,
            fulfillment_status: target.fulfillment_status,
          },
          { $inc: { __v: 1, order_count: sourceOrders.length } },
          { session },
        );
        if (bumped.matchedCount === 0)
          throw this.regroupVersionConflict(groupId, expectedVersion, null);
        await this.orderModel.updateMany(
          { consolidated_group_id: source._id },
          { $set: { consolidated_group_id: target._id } },
          { session },
        );
        await this.orderModel.updateMany(
          { consolidated_group_id: target._id },
          { $set: { is_consolidated: true } },
          { session },
        );
        for (const gid of [target._id, source._id]) {
          await recordActivity(
            this.activityLogModel,
            {
              category: 'orders',
              action: 'order_group.merged',
              summary: `Gộp nhóm ${sourceGroupId} (đơn ${codes}) vào nhóm ${groupId}`,
              actorId,
              orderGroupId: gid,
              entityType: 'order_group',
              entityId: source._id,
              fromStatus: gid.equals(source._id)
                ? source.fulfillment_status
                : null,
              toStatus: gid.equals(source._id)
                ? GroupFulfillmentStatus.CANCELED
                : null,
              note,
            },
            session,
          );
        }
      });
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Gộp nhóm ${sourceGroupId} vào ${groupId} (đơn ${codes}, bởi ${actorId}).`,
    );
    await this.core.releaseReservation(sourceGroupId);
    await this.core.reconcileReservation(groupId);
    await Promise.all([
      this.core.refreshOrderCounts(target._id),
      this.core.refreshOrderCounts(source._id),
    ]);
    const merged = await this.core.loadGroupOrThrow(groupId);
    await this.core.warnIfRecipientNamesDiffer(merged, null);
    return merged;
  }

  private async assertRegroupable(
    group: OrderGroupDocument,
    action: string,
  ): Promise<void> {
    const open = [
      GroupFulfillmentStatus.AWAITING_PACKAGING,
      GroupFulfillmentStatus.PICKING,
    ];
    if (!open.includes(group.fulfillment_status)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.REGROUP_NOT_ALLOWED,
        `Nhóm đơn ${group._id.toString()} đang "${GROUP_STATUS_LABELS[group.fulfillment_status] ?? group.fulfillment_status}" — chỉ ${action} khi nhóm đang chờ/đang lấy hàng và chưa quét món nào.`,
        HttpStatus.CONFLICT,
        {
          groupId: group._id.toString(),
          fulfillmentStatus: group.fulfillment_status,
        },
      );
    }
    await this.assertNoPicks(group, action);
  }

  private async assertNoPicks(
    group: OrderGroupDocument,
    action: string,
    session?: ClientSession,
  ): Promise<void> {
    const query = this.pickEventModel.exists({
      order_group_id: group._id,
      ...this.core.roundFilter(group.pick_round),
    });
    const picked = session ? await query.session(session) : await query;
    if (picked) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.REGROUP_HAS_PICKS,
        `Nhóm đơn ${group._id.toString()} đã quét lấy hàng ở lượt hiện tại — không ${action} được nữa (hàng đã lấy tính chung cho cả nhóm). ` +
          'Cứ lấy + đóng theo nhóm hiện tại: mỗi đơn vẫn có kiện và vận đơn riêng đúng người nhận.',
        HttpStatus.CONFLICT,
        { groupId: group._id.toString(), pickRound: group.pick_round },
      );
    }
  }

  private regroupVersionConflict(
    groupId: string,
    expected: number,
    actual: number | null | undefined,
  ): AppException {
    return new AppException(
      ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      `Nhóm đơn ${groupId} vừa được người khác cập nhật — tải lại rồi thử lại.`,
      HttpStatus.CONFLICT,
      { groupId, expectedVersion: expected, currentVersion: actual ?? null },
    );
  }

  /** Chỉ liên kết / bỏ liên kết khi nhóm CHƯA giao — đã có vận đơn thì chuyến đã chốt. */
  private assertLinkable(group: OrderGroupDocument): void {
    if (LINK_LOCKED_STATUSES.includes(group.fulfillment_status)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.LINK_NOT_ALLOWED,
        `Nhóm đơn ${group._id.toString()} đang ở trạng thái "${group.fulfillment_status}" — chỉ liên kết/bỏ liên kết khi nhóm chưa giao.`,
        HttpStatus.CONFLICT,
        {
          groupId: group._id.toString(),
          fulfillmentStatus: group.fulfillment_status,
        },
      );
    }
  }
}
