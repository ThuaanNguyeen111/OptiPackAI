import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Collection, Connection, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';
import { GroupFulfillmentStatus } from '../src/modules/order-groups/enums/group-fulfillment-status.enum';
import { OrderGroupPickingService } from '../src/modules/order-groups/order-group-picking.service';
import { OrderGroupsService } from '../src/modules/order-groups/order-groups.service';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum';
import type { MappedOrderFields } from '../src/modules/orders/mappers/lazada-order.mapper';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PackingPlanService } from '../src/modules/packing/packing-plan.service';
import { PackingSessionService, type SessionResult } from '../src/modules/packing/packing-session.service';
import type { PackingPlanDocument } from '../src/modules/packing/schemas/packing-plan.schema';
import type { OrderGroupDocument } from '../src/modules/order-groups/schemas/order-group.schema';
import { InspectionResult, ReturnReason, ReturnType } from '../src/modules/shipments/enums/return.enums';
import { ReturnsService } from '../src/modules/shipments/returns.service';
import { ShipmentsService } from '../src/modules/shipments/shipments.service';

/**
 * AOFP-312 — e2e trên MongoDB replica set THẬT (transaction thật), dựng nguyên AppModule.
 * Gọi thẳng service (không qua HTTP) để khỏi dựng user/JWT; dịch vụ ngoài (sàn, GHN, AI,
 * CP-SAT) không gọi — đơn đi vào từ bước sau khi sàn trả dữ liệu (ingestMappedOrder).
 * Chạy: `docker compose --profile local-db up -d mongodb` rồi `npm run test:e2e -w be`.
 */
const PLATFORM = MarketplacePlatform.LAZADA;
const SHOP = 'e2e-shop';
const SKU = 'E2E-MUG';
const BOX = 'BOX-M';
const USER = new Types.ObjectId().toString();
const OWNER = new Types.ObjectId().toString(); // người duyệt phiếu trả (khác người tạo)

describe('Vòng đời đơn hàng (e2e, Mongo replica set)', () => {
  let app: INestApplication;
  let db: Connection;
  let orders: OrdersService;
  let groups: OrderGroupsService;
  let picking: OrderGroupPickingService;
  let plans: PackingPlanService;
  let packing: PackingSessionService;
  let shipments: ShipmentsService;
  let returns: ReturnsService;
  let warehouseId: Types.ObjectId;
  let binId: Types.ObjectId;

  const col = (name: string): Collection => db.collection(name);
  // Seed qua model để chạy hook/validate thật (vd seller_sku_normalized).
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- model động theo tên
  const model = (name: string) => db.model(name);
  const groupOf = (id: string): Promise<OrderGroupDocument> => groups.findOrderGroupById(id);
  const boxStock = async (): Promise<number> => (await col('packaging_materials').findOne({ code: BOX }))?.qty_new as number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    orders = app.get(OrdersService);
    groups = app.get(OrderGroupsService);
    picking = app.get(OrderGroupPickingService);
    plans = app.get(PackingPlanService);
    packing = app.get(PackingSessionService);
    shipments = app.get(ShipmentsService);
    returns = app.get(ReturnsService);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    await db.syncIndexes(); // transaction không tự tạo collection/index như ghi thường
    await seedCatalog();
  });

  async function seedCatalog(): Promise<void> {
    const now = new Date();
    // AOFP-352: SKU ready phải có mô hình 3D (cổng missing_model) — gắn hình đại diện như migrate-product-models.
    const placeholder = await model('ProductModel').create({
      name: 'Hình đại diện — dựng từ kích thước',
      source: 'primitive',
      kind: 'rigid',
      primitive: { shape: 'box', corner_radius_pct: 0, body_color: '#94a3b8' },
    });
    await model('ProductMaster').create({
      model_id: placeholder._id,
      platform: PLATFORM,
      shop_id: SHOP,
      seller_sku: SKU,
      name: 'Cốc sứ e2e',
      packaging_profile_status: 'ready',
      is_fragile: false,
      orientation_rule: 'any',
      dimension: { package_length_cm: 12, package_width_cm: 10, package_height_cm: 10, package_weight_kg: 0.4 },
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    });
    warehouseId = new Types.ObjectId();
    const zoneId = new Types.ObjectId();
    binId = new Types.ObjectId();
    await model('Warehouse').create({ _id: warehouseId, warehouse_code: 'WH-E2E', warehouse_name: 'Kho e2e', address: 'HCM', is_active: true });
    await model('WarehouseZone').create({ _id: zoneId, warehouse_id: warehouseId, zone_code: 'A', zone_name: 'Khu A', is_active: true });
    await model('BinLocation').create({ _id: binId, warehouse_id: warehouseId, zone_id: zoneId, bin_code: 'A-01-01', aisle: 'A', rack: 1, level: 1, is_active: true });
    await model('SkuBinAssignment').create({
      warehouse_id: warehouseId,
      platform: PLATFORM,
      shop_id: SHOP,
      seller_sku: SKU,
      master_sku: null,
      bin_location_id: binId,
      quantity_on_hand: 10,
      quantity_allocated: 0,
      created_at: now,
      updated_at: now,
    });
    await model('PackagingMaterial').create({
      code: BOX,
      name: 'Thùng M',
      kind: 'box',
      length_cm: 30,
      width_cm: 25,
      height_cm: 20,
      inner: { length_mm: 300, width_mm: 250, height_mm: 200 },
      outer: { length_mm: 306, width_mm: 256, height_mm: 206 },
      tare_g: 200,
      max_load_g: 20000,
      unit_cost_vnd: 5000,
      reusable: true,
      max_reuse_cycles: 3,
      qty_new: 5,
      qty_reused: 0,
      qty_internal: 0,
      reorder_level: 0,
      is_sample: false,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    // Như scripts/seed-ghn-carrier.ts.
    await model('ShippingCarrier').create({
      code: 'GHN',
      name: 'Giao Hàng Nhanh (GHN)',
      kind: 'live',
      volumetric_divisor: 5000,
      weight_step_g: 500,
      is_sample: false,
      is_active: true,
      services: [{ code: 'LIGHT', name: 'GHN — Hàng nhẹ', eta_min_days: 1, eta_max_days: 3, bands: [], extra_price_vnd_per_500g: 0, carrier_service_type_id: 2 }],
    });
  }

  function mappedOrder(id: string, quantity: number): MappedOrderFields {
    return {
      platform_order_id: id,
      status: OrderStatus.PENDING,
      raw_statuses: ['pending'],
      need_cancel_confirm: false,
      is_cancel_pending: false,
      cancel_trigger_time: null,
      reverse_order_id: null,
      recipient: {
        full_name: 'Nguyễn Văn E2E',
        phone: '0901234567',
        address_line1: '1 Lê Lợi',
        city: 'Hồ Chí Minh',
        country: 'VN',
        province_name: 'Hồ Chí Minh',
        district_name: 'Quận 1',
        ward_name: 'Bến Nghé',
      },
      consolidation_key: '',
      items: [{ platform_order_item_id: `${id}-1`, sku: SKU, name: 'Cốc sứ e2e', quantity, unit_price: 50000, status: OrderStatus.PENDING }],
      total_amount: 50000 * quantity,
      currency: 'VND',
      synced_at: new Date(),
      delivery_option: 'standard',
      promised_delivery_at: null,
    };
  }

  /** Đồng bộ 2 đơn cùng người nhận → gom 1 nhóm → nhặt đủ → kế hoạch → duyệt. Trả nhóm đã duyệt. */
  async function groupReadyToPack(): Promise<string> {
    const shopMongoId = new Types.ObjectId();
    const a = await orders.ingestMappedOrder(PLATFORM, SHOP, shopMongoId, mappedOrder('E2E-1', 1));
    const b = await orders.ingestMappedOrder(PLATFORM, SHOP, shopMongoId, mappedOrder('E2E-2', 1));
    expect(b.consolidated).toBe(true);
    const groupId = String((await col('orders').findOne({ _id: a.order._id }))?.consolidated_group_id);
    expect(groupId).toBe(String((await col('orders').findOne({ _id: b.order._id }))?.consolidated_group_id));
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.PICKING);

    await picking.pickItem(groupId, warehouseId.toString(), SKU, 2, 'barcode', undefined, undefined, USER);
    await picking.confirmPicked(groupId, (await groupOf(groupId)).__v);
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);

    await plans.compute(groupId);
    const plan = await plans.requireActivePlan(groupId);
    expect(plan.status).toBe('ready');
    await plans.approve(groupId, plan.version, USER);
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
    return groupId;
  }

  /** Nhóm gộp 2 đơn bắt quét từng món vào đúng kiện (không dùng "đóng nhanh"). */
  async function startAndScan(groupId: string): Promise<PackingPlanDocument> {
    const plan = await packing.start(groupId, (await plans.requireActivePlan(groupId)).version, USER);
    for (const parcel of plan.parcels) {
      await packing.scan(groupId, parcel.parcel_no, { code: SKU, quantity: parcel.placements.length, scan_method: 'barcode' }, USER);
    }
    return plans.requireActivePlan(groupId);
  }

  async function sealParcel(groupId: string, parcelNo: number, expectedVersion?: number): Promise<SessionResult> {
    const plan = await plans.requireActivePlan(groupId);
    const parcel = plan.parcels.find((p) => p.parcel_no === parcelNo);
    const weight_kg = (parcel?.estimated_weight_g ?? 0) / 1000;
    return packing.seal(groupId, parcelNo, { expected_version: expectedVersion ?? plan.version, weight_kg }, USER);
  }

  it('luồng chính: đồng bộ → gom nhóm → nhặt hàng → kế hoạch 3D → đóng gói & niêm phong', async () => {
    const groupId = await groupReadyToPack();
    const stockBefore = await boxStock();

    let plan = await startAndScan(groupId);
    let completed = false;
    for (const parcel of plan.parcels) {
      ({ plan, completed } = await sealParcel(groupId, parcel.parcel_no));
    }

    expect(completed).toBe(true);
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.PACKED);
    expect(await boxStock()).toBe(stockBefore - plan.parcels.length);
    const onHand = (await col('sku_bin_assignments').findOne({ seller_sku: SKU }))?.quantity_on_hand as number;
    expect(onHand).toBe(8);

    // Bàn giao GHN (adapter mô phỏng): mỗi kiện 1 mã vận đơn, hãng báo đã giao qua callback.
    const system = { userId: 'system', role: null };
    let shipment = await shipments.startDelivery(groupId, system, undefined, undefined, { carrierCode: 'GHN', serviceCode: 'LIGHT' });
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.SHIPPED);
    const codes = (shipment.carrier_parcels ?? []).map((p) => p.carrier_order_code);
    expect(codes.length).toBe(plan.parcels.length);
    for (const OrderCode of codes) {
      expect(OrderCode).toMatch(/^MOCK-/);
      await shipments.processCarrierEvent({ OrderCode: OrderCode ?? '', Status: 'delivered', Type: 'switch_status', Time: new Date().toISOString() }, 'carrier_webhook', system);
    }
    shipment = await shipments.getShipment(shipment._id.toString());
    expect(shipment.status).toBe('delivered');
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.DELIVERED);

    // Khách trả 1 món → duyệt → kho nhận → kiểm đạt, nhập lại đúng ô.
    let rma = await returns.createSimulated(
      { order_group_id: groupId, type: ReturnType.RETURN_REFUND, items: [{ seller_sku: SKU, quantity: 1, reason_code: ReturnReason.CHANGED_MIND }] },
      USER,
    );
    rma = await returns.approve(rma._id.toString(), rma.__v, OWNER);
    rma = await returns.receive(rma._id.toString(), rma.__v, USER);
    rma = await returns.inspect(
      rma._id.toString(),
      {
        expected_version: rma.__v,
        lines: [{ seller_sku: SKU, quantity: 1, result: InspectionResult.RESTOCK, warehouse_id: warehouseId.toString(), bin_location_id: binId.toString() }],
      },
      USER,
    );
    expect(rma.status).toBe('closed');
    const restocked = (await col('sku_bin_assignments').findOne({ seller_sku: SKU }))?.quantity_on_hand as number;
    expect(restocked).toBe(9);
  });

  it('Scenario 1 — lỗi DB giữa transaction niêm phong: hủy toàn bộ, không trừ BOX-M, nhóm giữ nguyên', async () => {
    const groupId = await groupReadyToPack();
    let plan = await startAndScan(groupId);
    const last = plan.parcels[plan.parcels.length - 1];
    if (!last) throw new Error('kế hoạch không có kiện');
    for (const parcel of plan.parcels.slice(0, -1)) ({ plan } = await sealParcel(groupId, parcel.parcel_no));
    const stockBefore = await boxStock();
    const movementsBefore = await col('packaging_movements').countDocuments();
    const groupBefore = await groupOf(groupId);

    // Lỗi ở bước cuối của transaction (chuyển nhóm sang packed) — sau khi đã trừ thùng và
    // ghi kiện "sealed" trong cùng transaction.
    const spy = jest.spyOn(groups, 'transitionFulfillmentStatus').mockRejectedValueOnce(new Error('DB mất kết nối (giả lập)'));
    await expect(sealParcel(groupId, last.parcel_no)).rejects.toThrow('DB mất kết nối');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    expect(await boxStock()).toBe(stockBefore);
    expect(await col('packaging_movements').countDocuments()).toBe(movementsBefore);
    const after = await plans.requireActivePlan(groupId);
    expect(after.version).toBe(plan.version);
    expect(after.status).toBe('packing');
    expect(after.parcels.find((p) => p.parcel_no === last.parcel_no)?.status).toBe('pending');
    const group = await groupOf(groupId);
    expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
    expect(group.__v).toBe(groupBefore.__v);

    // Thử lại sau sự cố: thành công bình thường, trừ đúng 1 thùng.
    const retry = await sealParcel(groupId, last.parcel_no);
    expect(retry.completed).toBe(true);
    expect(await boxStock()).toBe(stockBefore - 1);
  });

  it('Scenario 2 — 2 thao tác cùng expected_version: 1 thành công (version +1), 1 bị 409 ORD_GROUP_STATE_CONFLICT', async () => {
    const shopMongoId = new Types.ObjectId();
    const { order } = await orders.ingestMappedOrder(PLATFORM, SHOP, shopMongoId, mappedOrder('E2E-LOCK', 2));
    const groupId = String((await col('orders').findOne({ _id: order._id }))?.consolidated_group_id);
    await picking.pickItem(groupId, warehouseId.toString(), SKU, 2, 'barcode', undefined, undefined, USER);
    // Given: nhóm "picking" ở version 3.
    await col('order_groups').updateOne({ _id: new Types.ObjectId(groupId) }, { $set: { __v: 3 } });
    expect((await groupOf(groupId)).fulfillment_status).toBe(GroupFulfillmentStatus.PICKING);

    const results = await Promise.allSettled([picking.confirmPicked(groupId, 3), picking.confirmPicked(groupId, 3)]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as { errorCode?: string; getStatus?: () => number }] : []));
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.errorCode).toBe('ORD_GROUP_STATE_CONFLICT');
    expect(failed[0]?.getStatus?.()).toBe(409);
    const group = await groupOf(groupId);
    expect(group.__v).toBe(4);
    expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);

    // Bên thua đến MUỘN (sau khi bên thắng đã commit) vẫn phải là 409 version, không phải 400 sai luồng.
    await expect(picking.confirmPicked(groupId, 3)).rejects.toMatchObject({ errorCode: 'ORD_GROUP_STATE_CONFLICT' });
  });

  it('niêm phong trùng 1 kiện cùng lúc (2 máy bấm): chỉ trừ 1 thùng', async () => {
    const groupId = await groupReadyToPack();
    const plan = await startAndScan(groupId);
    const first = plan.parcels[0];
    if (!first) throw new Error('kế hoạch không có kiện');
    const stockBefore = await boxStock();

    const results = await Promise.allSettled([
      sealParcel(groupId, first.parcel_no, plan.version),
      sealParcel(groupId, first.parcel_no, plan.version),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await boxStock()).toBe(stockBefore - 1);
    const consumed = await col('packaging_movements').countDocuments({ material_code: BOX, type: 'consume' });
    expect(consumed).toBe(1);
  });
});
