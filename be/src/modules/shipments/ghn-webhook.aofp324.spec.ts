import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { Types } from 'mongoose';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { CarrierWebhookEventSchema, CARRIER_WEBHOOK_EVENT_TTL_SECONDS } from './schemas/carrier-webhook-event.schema';
import { RawPayloadSchema } from './schemas/raw-payload.schema';
import { ShipmentsService, secretMatches } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';

//!=============================================
// AOFP-324 (19/11/2026) — webhook GHN: TTL sổ sự kiện, validate body, so khoá, cron đồng bộ.
//!=============================================
describe('AOFP-324 — webhook GHN', () => {
  it('AC4: sổ sự kiện + raw_payloads có TTL 30 ngày theo created_at (bản ghi 31 ngày tuổi bị xoá)', () => {
    expect(CARRIER_WEBHOOK_EVENT_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    for (const schema of [CarrierWebhookEventSchema, RawPayloadSchema]) {
      const ttl = schema.indexes().find(([fields]) => 'created_at' in fields);
      expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 30 * 24 * 60 * 60 });
    }
    expect(CarrierWebhookEventSchema.path('payload')).toBeUndefined(); // payload gốc đã tách sang raw_payloads
  });

  describe('AC5: pipe của route webhook', () => {
    const pipe = new ValidationPipe({ expectedType: GhnWebhookDto, whitelist: false, forbidNonWhitelisted: false });
    const meta: ArgumentMetadata = { type: 'body', metatype: Object };

    it('Status kiểu số → 400', async () => {
      await expect(pipe.transform({ OrderCode: 'GHN1', Status: 5 }, meta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('payload GHN thật (ShopID số + trường lạ Fee/Weight) → qua, giữ nguyên trường lạ', async () => {
      const body = { ShopID: 227609, OrderCode: 'GHN1', Type: 'switch_status', Status: 'picked', Time: '2026-11-19T03:00:00Z', Weight: 300, Fee: { Total: 20900 } };
      await expect(pipe.transform(body, meta)).resolves.toMatchObject({ Weight: 300, Fee: { Total: 20900 } });
    });
  });

  it('so khoá: đúng / sai / thiếu / khác độ dài', () => {
    expect(secretMatches('s3cret', 's3cret')).toBe(true);
    expect(secretMatches('s3creT', 's3cret')).toBe(false);
    expect(secretMatches(undefined, 's3cret')).toBe(false);
    expect(secretMatches('s3cret-long', 's3cret')).toBe(false);
  });

  describe('AC3: cron đồng bộ vận đơn hãng im lặng ≥ 6 giờ', () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    let find: jest.Mock;
    let chain: Record<'select' | 'sort' | 'limit' | 'lean', jest.Mock>;
    let service: ShipmentsService;

    beforeEach(() => {
      chain = {
        select: jest.fn(() => chain),
        sort: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        lean: jest.fn().mockResolvedValue(ids.map((_id, i) => ({ _id, shipment_code: `SHP-${String(i)}` }))),
      };
      find = jest.fn(() => chain);
      service = new ShipmentsService(
        { find } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
        { adapterInstance: {} } as never,
      );
    });

    it('lọc vận đơn live chưa kết thúc, updated_at < now − 6h, cũ nhất trước; lỗi 1 vận đơn không chặn vận đơn khác', async () => {
      const sync = jest.spyOn(service, 'syncCarrier')
        .mockRejectedValueOnce(new Error('GHN timeout'))
        .mockResolvedValueOnce({} as never);
      const now = new Date('2026-11-19T12:00:00Z');

      expect(await service.syncStaleCarrierShipments(now)).toEqual({ synced: 1, failed: 1 });

      const filter = (find.mock.calls[0] as [Record<string, unknown>])[0];
      expect(filter).toMatchObject({
        carrier_kind: 'live',
        status: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.RETURNED_TO_WAREHOUSE, ShipmentStatus.CANCELLED] },
        updated_at: { $lt: new Date('2026-11-19T06:00:00Z') },
      });
      expect(chain.sort).toHaveBeenCalledWith({ updated_at: 1 });
      expect(sync).toHaveBeenCalledTimes(2);
      expect(sync).toHaveBeenCalledWith(String(ids[1]), { userId: 'system:carrier-sync', role: null });
    });

    it('không có module hãng → không quét', async () => {
      const noCarrier = new ShipmentsService({ find } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
      expect(await noCarrier.syncStaleCarrierShipments()).toEqual({ synced: 0, failed: 0 });
      expect(find).not.toHaveBeenCalled();
    });
  });
});
