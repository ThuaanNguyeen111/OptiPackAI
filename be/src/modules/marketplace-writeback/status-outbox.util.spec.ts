import { Types } from 'mongoose';
import { ShipmentStatus } from '../shipments/enums/shipment-status.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import {
  enqueueStatusPush,
  writebackStatusForGroup,
  writebackStatusForShipment,
} from './status-outbox.util';

describe('writebackStatusForShipment', () => {
  it.each([
    [ShipmentStatus.AWAITING_PICKUP, 'shipped'],
    [ShipmentStatus.IN_TRANSIT, 'shipped'],
    [ShipmentStatus.OUT_FOR_DELIVERY, 'shipped'],
    [ShipmentStatus.DELIVERY_FAILED, 'failed_delivery'],
    [ShipmentStatus.RETURNING_TO_WAREHOUSE, 'shipped_back'],
    [ShipmentStatus.RETURNED_TO_WAREHOUSE, 'returned'],
    [ShipmentStatus.DELIVERED, 'delivered'],
  ])('%s -> %s', (status, expected) => {
    expect(writebackStatusForShipment(status)).toBe(expected);
  });

  it('huỷ ở hãng không gửi gì (nhóm đơn quay về packed sẽ tự có dòng packed)', () => {
    expect(writebackStatusForShipment(ShipmentStatus.CANCELLED)).toBeNull();
  });
});

describe('writebackStatusForGroup', () => {
  it('chỉ đóng gói xong mới gửi', () => {
    expect(writebackStatusForGroup(GroupFulfillmentStatus.PACKED)).toBe('packed');
    expect(writebackStatusForGroup(GroupFulfillmentStatus.SHIPPED)).toBeNull();
    expect(writebackStatusForGroup(GroupFulfillmentStatus.DELIVERED)).toBeNull();
    expect(writebackStatusForGroup(GroupFulfillmentStatus.PICKED)).toBeNull();
  });
});

describe('enqueueStatusPush', () => {
  const groupId = new Types.ObjectId();
  const shipmentId = new Types.ObjectId();

  it('không có model (spec cũ) thì bỏ qua êm', async () => {
    await expect(
      enqueueStatusPush(undefined, { orderGroupId: groupId, status: 'packed', discriminator: 1 }),
    ).resolves.toBeUndefined();
  });

  it('dùng upsert với khóa theo nhóm cho sự kiện mức nhóm', async () => {
    const updateOne = jest.fn().mockResolvedValue({});
    await enqueueStatusPush(
      { updateOne } as never,
      { orderGroupId: groupId, status: 'packed', discriminator: 7 },
    );
    const [filter, update, options] = updateOne.mock.calls[0] as [
      { idempotency_key: string },
      { $setOnInsert: Record<string, unknown> },
      { upsert: boolean },
    ];
    expect(filter.idempotency_key).toBe(`grp:${groupId.toString()}:packed:7`);
    expect(update.$setOnInsert).toMatchObject({ status: 'packed', state: 'pending', shipment_id: null });
    expect(options.upsert).toBe(true);
  });

  it('khóa theo vận đơn + lần giao: shipped lặp trong cùng lần giao chỉ ra 1 khóa', async () => {
    const updateOne = jest.fn<Promise<object>, [{ idempotency_key: string }]>().mockResolvedValue({});
    const model = { updateOne } as never;
    await enqueueStatusPush(model, { orderGroupId: groupId, shipmentId, status: 'shipped', discriminator: 1 });
    await enqueueStatusPush(model, { orderGroupId: groupId, shipmentId, status: 'shipped', discriminator: 1 });
    await enqueueStatusPush(model, { orderGroupId: groupId, shipmentId, status: 'shipped', discriminator: 2 });
    const keys = updateOne.mock.calls.map((call) => call[0].idempotency_key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
