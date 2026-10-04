import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { OrderStatus } from './enums/order-status.enum';

//!=============================================
// 30/09/2026 — tryConsolidate(): chỉ nhập đơn vào nhóm còn "mở", chỉ gộp
// đơn cùng platform + shop, và không chuyển nhóm đơn đã có nhóm.
//!=============================================
describe('OrdersService — tryConsolidate()', () => {
  interface FakeOrder {
    _id: Types.ObjectId;
    platform_order_id: string;
    platform: string;
    shop_id: string;
    status: OrderStatus;
    consolidation_key: string;
    consolidated_group_id: Types.ObjectId | null;
  }

  let service: OrdersService;
  let orderModel: { find: jest.Mock; updateOne: jest.Mock };
  let orderGroupsService: { isGroupOpenForNewOrders: jest.Mock };

  function makeOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
    return {
      _id: new Types.ObjectId(),
      platform_order_id: 'O-' + new Types.ObjectId().toString().slice(-4),
      platform: 'lazada',
      shop_id: 'shop-1',
      status: OrderStatus.PENDING,
      consolidation_key: 'key-1',
      consolidated_group_id: null,
      ...overrides,
    };
  }

  function mockCandidates(candidates: FakeOrder[]): void {
    orderModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(candidates),
      }),
    });
  }

  function run(order: FakeOrder): Promise<boolean> {
    return (
      service as unknown as { tryConsolidate(o: FakeOrder): Promise<boolean> }
    ).tryConsolidate(order);
  }

  beforeEach(() => {
    orderModel = {
      find: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    orderGroupsService = { isGroupOpenForNewOrders: jest.fn() };
    service = new OrdersService(
      orderModel as never,
      {} as never, // marketplaceIntegrationService
      {}, // adapters
      {} as never, // notificationsService
      orderGroupsService as never,
    );
  });

  it('truy vấn sibling giới hạn theo platform + shop của đơn', async () => {
    mockCandidates([]);
    const order = makeOrder({ shop_id: 'shop-9' });

    await run(order);

    const [filter] = orderModel.find.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toMatchObject({ platform: 'lazada', shop_id: 'shop-9' });
  });

  it('đơn đã thuộc 1 nhóm (re-sync) -> không gộp lại, không truy vấn', async () => {
    const order = makeOrder({ consolidated_group_id: new Types.ObjectId() });

    expect(await run(order)).toBe(false);
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('sibling thuộc nhóm đã khóa (picked trở đi) -> KHÔNG gộp, đơn mới giữ standalone', async () => {
    mockCandidates([
      makeOrder({ consolidated_group_id: new Types.ObjectId() }),
    ]);
    orderGroupsService.isGroupOpenForNewOrders.mockResolvedValue(false);

    expect(await run(makeOrder())).toBe(false);
    expect(orderModel.updateOne).not.toHaveBeenCalled();
  });

  it('sibling thuộc nhóm còn mở -> gộp vào đúng nhóm đó', async () => {
    const groupId = new Types.ObjectId();
    mockCandidates([makeOrder({ consolidated_group_id: groupId })]);
    orderGroupsService.isGroupOpenForNewOrders.mockResolvedValue(true);
    const order = makeOrder();

    expect(await run(order)).toBe(true);
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      { $set: { is_consolidated: true, consolidated_group_id: groupId } },
    );
  });

  it('bỏ qua sibling ở nhóm khóa, chọn sibling kế tiếp ở nhóm còn mở', async () => {
    const lockedGroup = new Types.ObjectId();
    const openGroup = new Types.ObjectId();
    mockCandidates([
      makeOrder({ consolidated_group_id: lockedGroup }),
      makeOrder({ consolidated_group_id: openGroup }),
    ]);
    orderGroupsService.isGroupOpenForNewOrders.mockImplementation(
      (id: string) => Promise.resolve(id === openGroup.toString()),
    );
    const order = makeOrder();

    expect(await run(order)).toBe(true);
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: order._id },
      { $set: { is_consolidated: true, consolidated_group_id: openGroup } },
    );
  });
});
