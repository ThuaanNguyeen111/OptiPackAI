import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';

//!=============================================
// 13/10/2026 — giao chung chuyến (POST /shipments/batch) nhận nhóm cùng
// recipient_key HOẶC cùng manual_link_id (Coordinator liên kết tay).
//!=============================================
describe('ShipmentsService.createBatch — kiểm tra cùng người nhận (13/10/2026)', () => {
  const STOP = new Error('stop-after-recipient-check');
  const idA = new Types.ObjectId();
  const idB = new Types.ObjectId();
  let groups: Record<string, Record<string, unknown>>;
  let shippingService: {
    countParcelsToUnpack: jest.Mock;
    quoteChosenService: jest.Mock;
  };
  let service: ShipmentsService;

  const group = (
    id: Types.ObjectId,
    extra: Record<string, unknown>,
  ): Record<string, unknown> => ({
    _id: id,
    fulfillment_status: GroupFulfillmentStatus.PACKED,
    recipient_key: null,
    manual_link_id: null,
    ...extra,
  });

  beforeEach(() => {
    shippingService = {
      countParcelsToUnpack: jest.fn().mockResolvedValue(0),
      quoteChosenService: jest.fn().mockRejectedValue(STOP), // qua được bước kiểm người nhận thì dừng ở đây
    };
    service = new ShipmentsService(
      { exists: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {
        findOrderGroupById: jest.fn((id: string) =>
          Promise.resolve(groups[id]),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      shippingService as never,
    );
  });

  const run = (): Promise<unknown> =>
    service.createBatch(
      [idA.toString(), idB.toString()],
      { carrierCode: 'ghn', serviceCode: 'std' },
      undefined,
      {
        userId: 'coord-1',
      } as never,
    );

  it('khác recipient_key nhưng cùng manual_link_id → qua kiểm tra người nhận', async () => {
    const linkId = new Types.ObjectId();
    groups = {
      [idA.toString()]: group(idA, {
        recipient_key: 'lazada-masked',
        manual_link_id: linkId,
      }),
      [idB.toString()]: group(idB, {
        recipient_key: 'aurelle-real',
        manual_link_id: new Types.ObjectId(linkId.toString()),
      }),
    };
    await expect(run()).rejects.toBe(STOP);
  });

  it('cùng recipient_key, không liên kết tay → qua kiểm tra như trước', async () => {
    groups = {
      [idA.toString()]: group(idA, { recipient_key: 'rk' }),
      [idB.toString()]: group(idB, { recipient_key: 'rk' }),
    };
    await expect(run()).rejects.toBe(STOP);
  });

  it('khác recipient_key và không cùng liên kết tay → 400 RECIPIENT_MISMATCH', async () => {
    groups = {
      [idA.toString()]: group(idA, {
        recipient_key: 'a',
        manual_link_id: new Types.ObjectId(),
      }),
      [idB.toString()]: group(idB, { recipient_key: 'b' }),
    };
    await expect(run()).rejects.toMatchObject({
      errorCode: SHIPMENT_ERROR_CODES.RECIPIENT_MISMATCH,
    });
    expect(shippingService.quoteChosenService).not.toHaveBeenCalled();
  });
});
