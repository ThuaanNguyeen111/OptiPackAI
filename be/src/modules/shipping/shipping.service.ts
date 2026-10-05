import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { parcelsOfPlan } from '../packing/utils/parcels.util';
import {
  CreateCarrierDto,
  UpdateCarrierDto,
  UpdateShippingSettingsDto,
} from './dto/shipping.dto';
import {
  ShippingCarrier,
  ShippingCarrierDocument,
} from './schemas/shipping-carrier.schema';
import {
  ShippingSettings,
  ShippingSettingsDocument,
} from './schemas/shipping-settings.schema';
import { SHIP_ERROR_CODES } from './shipping.errors';
import {
  pickRecommended,
  quoteService,
  type ParcelInput,
  type ServiceQuote,
  type ShippingStrategy,
} from './utils/shipping-cost.util';

export interface ShippingSettingsView {
  strategy: ShippingStrategy;
  defaultCarrierCode: string | null;
  defaultServiceCode: string | null;
}

export interface GroupQuote {
  groupId: string;
  parcelCount: number;
  strategy: ShippingStrategy;
  quotes: ServiceQuote[];
  recommended: { carrierCode: string; serviceCode: string } | null;
}

/**
 * ===================================================================
 * shipping.service.ts — MỚI (30/09/2026): hãng vận chuyển, bảng cước, báo giá
 * ===================================================================
 * Báo giá đọc các KIỆN của nhóm (đa kiện) từ phương án đóng gói đã duyệt/đã
 * đóng: cân thực = cân thật lúc pack nếu có, chưa pack thì cân ước tính; kích
 * thước ngoài của thùng để quy đổi thể tích. Cước từng kiện cộng lại.
 * ===================================================================
 */
@Injectable()
export class ShippingService {
  constructor(
    @InjectModel(ShippingCarrier.name)
    private readonly carrierModel: Model<ShippingCarrierDocument>,
    @InjectModel(ShippingSettings.name)
    private readonly settingsModel: Model<ShippingSettingsDocument>,
    @InjectModel(PackingPlan.name)
    private readonly planModel: Model<PackingPlanDocument>,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  // ------------------------------------------------------------------ hãng

  async listCarriers(activeOnly = true): Promise<ShippingCarrierDocument[]> {
    return this.carrierModel
      .find(activeOnly ? { is_active: true } : {})
      .sort({ code: 1 });
  }

  async createCarrier(dto: CreateCarrierDto): Promise<ShippingCarrierDocument> {
    this.assertValidServices(dto.services);
    try {
      return await this.carrierModel.create({
        code: dto.code,
        name: dto.name,
        volumetric_divisor: dto.volumetric_divisor ?? 5000,
        services: dto.services.map((s) => this.toServiceDoc(s)),
        is_sample: dto.is_sample ?? false,
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new AppException(
          SHIP_ERROR_CODES.CARRIER_CODE_IN_USE,
          `Mã hãng "${dto.code}" đã tồn tại.`,
          HttpStatus.CONFLICT,
          { code: dto.code },
        );
      }
      throw error;
    }
  }

  async updateCarrier(
    id: string,
    dto: UpdateCarrierDto,
  ): Promise<ShippingCarrierDocument> {
    const carrier = await this.findCarrier(id);
    if (dto.services) this.assertValidServices(dto.services);
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.volumetric_divisor !== undefined)
      set.volumetric_divisor = dto.volumetric_divisor;
    if (dto.services !== undefined)
      set.services = dto.services.map((s) => this.toServiceDoc(s));
    if (dto.is_sample !== undefined) set.is_sample = dto.is_sample;
    if (dto.is_active !== undefined) set.is_active = dto.is_active;
    const updated = await this.carrierModel.findByIdAndUpdate(
      carrier._id,
      { $set: set },
      { returnDocument: 'after' },
    );
    if (!updated) throw this.carrierNotFound(id);
    return updated;
  }

  private toServiceDoc(
    s: CreateCarrierDto['services'][number],
  ): Record<string, unknown> {
    return {
      code: s.code,
      name: s.name,
      eta_min_days: s.eta_min_days,
      eta_max_days: s.eta_max_days,
      bands: s.bands.map((b) => ({
        up_to_g: b.up_to_g,
        price_vnd: b.price_vnd,
      })),
      extra_price_vnd_per_500g: s.extra_price_vnd_per_500g ?? 0,
    };
  }

  /** Bảng cước hợp lệ: bậc tăng dần thật sự, ETA min ≤ max, mã dịch vụ không trùng. */
  private assertValidServices(services: CreateCarrierDto['services']): void {
    const codes = new Set<string>();
    for (const service of services) {
      const fail = (reason: string): AppException =>
        new AppException(
          SHIP_ERROR_CODES.INVALID_RATE_TABLE,
          `Dịch vụ ${service.code}: ${reason}`,
          HttpStatus.BAD_REQUEST,
          {
            serviceCode: service.code,
          },
        );
      if (codes.has(service.code))
        throw fail('mã dịch vụ bị trùng trong cùng hãng.');
      codes.add(service.code);
      if (service.eta_min_days > service.eta_max_days)
        throw fail('thời gian giao tối thiểu lớn hơn tối đa.');
      for (let i = 1; i < service.bands.length; i += 1) {
        const prev = service.bands[i - 1];
        const cur = service.bands[i];
        if (prev && cur && cur.up_to_g <= prev.up_to_g)
          throw fail(
            'các bậc cước phải tăng dần theo khối lượng, không trùng nhau.',
          );
      }
    }
  }

  private async findCarrier(id: string): Promise<ShippingCarrierDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        SHIP_ERROR_CODES.INVALID_CARRIER_ID,
        `"${id}" không đúng định dạng ObjectId.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const carrier = await this.carrierModel.findById(id);
    if (!carrier) throw this.carrierNotFound(id);
    return carrier;
  }

  private carrierNotFound(id: string): AppException {
    return new AppException(
      SHIP_ERROR_CODES.CARRIER_NOT_FOUND,
      `Không tìm thấy hãng vận chuyển "${id}".`,
      HttpStatus.NOT_FOUND,
      {
        id,
      },
    );
  }

  // ------------------------------------------------------------------ tùy chọn

  async getSettings(): Promise<ShippingSettingsView> {
    const doc = await this.settingsModel.findOne({ key: 'default' });
    return {
      strategy: doc?.strategy ?? 'cheapest',
      defaultCarrierCode: doc?.default_carrier_code ?? null,
      defaultServiceCode: doc?.default_service_code ?? null,
    };
  }

  async updateSettings(
    dto: UpdateShippingSettingsDto,
    userId: string,
  ): Promise<ShippingSettingsView> {
    const carrierCode = dto.default_carrier_code ?? null;
    const serviceCode = dto.default_service_code ?? null;
    if (
      dto.strategy === 'fixed' ||
      carrierCode !== null ||
      serviceCode !== null
    ) {
      if (carrierCode === null || serviceCode === null) {
        throw new AppException(
          SHIP_ERROR_CODES.SETTINGS_SERVICE_INVALID,
          'Chiến lược "fixed" (hoặc có mặc định) cần đủ cả carrier_code và service_code.',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.resolveService(carrierCode, serviceCode); // ném SHIP_SERVICE_NOT_FOUND nếu không có
    }
    await this.settingsModel.updateOne(
      { key: 'default' },
      {
        $set: {
          strategy: dto.strategy,
          default_carrier_code: carrierCode,
          default_service_code: serviceCode,
          updated_by: new Types.ObjectId(userId),
        },
        $setOnInsert: { key: 'default' },
      },
      { upsert: true },
    );
    return this.getSettings();
  }

  // ------------------------------------------------------------------ báo giá

  /**
   * (05/10/2026) Số kiện của nhóm đang chờ tháo (đơn hủy sau khi đóng). Còn kiện
   * phải tháo thì không giao — kiện đó vẫn nằm lẫn với các kiện đi giao.
   */
  async countParcelsToUnpack(groupId: string): Promise<number> {
    const plan = await this.planModel
      .findOne({ order_group_id: new Types.ObjectId(groupId), is_active: true })
      .select('parcels.status')
      .lean();
    return plan ? plan.parcels.filter((p) => p.status === 'to_unpack').length : 0;
  }

  /** Các kiện của nhóm (kế hoạch đã duyệt hoặc đã đóng). Đọc qua parcelsOfPlan() — hợp đồng duy nhất. */
  async parcelsOfGroup(groupId: string): Promise<ParcelInput[]> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const plan = await this.planModel.findOne({
      order_group_id: group._id,
      is_active: true,
      status: { $in: ['approved', 'packing', 'packed'] },
    });
    if (!plan) return [];
    return parcelsOfPlan(plan).map((p) => ({
      orderId: p.orderId,
      cartonIndex: p.indexInOrder,
      // Cân thật lúc pack nếu có (kg → g); chưa pack thì cân ước tính (hàng + bì + vật tư).
      actualG: p.actualWeightKg !== null ? Math.ceil(p.actualWeightKg * 1000) : p.estimatedWeightG,
      outer: p.outerMm,
    }));
  }

  async quoteForGroup(groupId: string): Promise<GroupQuote> {
    const parcels = await this.parcelsOfGroup(groupId);
    if (parcels.length === 0) {
      throw new AppException(
        SHIP_ERROR_CODES.NO_PARCELS,
        'Nhóm chưa có kiện nào đã duyệt đóng gói để báo giá.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    const carriers = await this.listCarriers(true);
    const quotes = carriers.flatMap((carrier) =>
      carrier.services.map((service) =>
        quoteService(carrier, service, parcels),
      ),
    );
    const settings = await this.getSettings();
    const recommended = pickRecommended(quotes, settings.strategy, {
      carrierCode: settings.defaultCarrierCode,
      serviceCode: settings.defaultServiceCode,
    });
    return {
      groupId,
      parcelCount: parcels.length,
      strategy: settings.strategy,
      quotes,
      recommended: recommended
        ? {
            carrierCode: recommended.carrierCode,
            serviceCode: recommended.serviceCode,
          }
        : null,
    };
  }

  /** Báo giá đúng 1 dịch vụ đã chọn (dùng khi tạo vận đơn). */
  async quoteChosenService(
    groupId: string,
    carrierCode: string,
    serviceCode: string,
  ): Promise<ServiceQuote> {
    const { carrier, service } = await this.resolveService(
      carrierCode,
      serviceCode,
    );
    const parcels = await this.parcelsOfGroup(groupId);
    if (parcels.length === 0) {
      throw new AppException(
        SHIP_ERROR_CODES.NO_PARCELS,
        'Nhóm chưa có kiện nào đã duyệt đóng gói để báo giá.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    return quoteService(carrier, service, parcels);
  }

  /** Ghi cước ước tính lên TỪNG KIỆN của kế hoạch (thay cho `null`). */
  async persistCosts(
    groupId: string,
    quote: ServiceQuote,
    session: ClientSession,
  ): Promise<void> {
    const plan = await this.planModel
      .findOne({ order_group_id: new Types.ObjectId(groupId), is_active: true })
      .session(session);
    if (!plan) return;
    const views = parcelsOfPlan(plan);
    const set: Record<string, number> = {};
    for (const q of quote.parcels) {
      const view = views.find((v) => v.orderId === q.orderId && v.indexInOrder === q.cartonIndex);
      const index = view ? plan.parcels.findIndex((p) => p.parcel_no === view.parcelNo) : -1;
      if (index >= 0) set[`parcels.${String(index)}.shipping_cost_vnd`] = q.costVnd;
    }
    if (Object.keys(set).length > 0)
      await this.planModel.updateOne({ _id: plan._id }, { $set: set }, { session });
  }

  private async resolveService(
    carrierCode: string,
    serviceCode: string,
  ): Promise<{
    carrier: ShippingCarrierDocument;
    service: ShippingCarrierDocument['services'][number];
  }> {
    const carrier = await this.carrierModel.findOne({
      code: carrierCode,
      is_active: true,
    });
    const service = carrier?.services.find((s) => s.code === serviceCode);
    if (!carrier || !service) {
      throw new AppException(
        SHIP_ERROR_CODES.SERVICE_NOT_FOUND,
        `Không có dịch vụ "${serviceCode}" của hãng "${carrierCode}" (hoặc đã ngừng dùng).`,
        HttpStatus.NOT_FOUND,
        { carrierCode, serviceCode },
      );
    }
    return { carrier, service };
  }
}
