import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CARRIER_ADAPTER, CarrierAdapter } from './carrier-adapter.interface';
import { GhnAdapter } from './adapters/ghn.adapter';
import { MockCarrierAdapter } from './adapters/mock.adapter';

/**
 * Chọn adapter theo CARRIER_MODE (08/10/2026, C2):
 *   mock                          → MockCarrierAdapter
 *   ghn_staging / ghn_production  → GhnAdapter (URL lấy từ GHN_BASE_URL)
 *   không đặt                     → GHN nếu có GHN_TOKEN, ngược lại mock (ghi cảnh báo)
 * Các module khác chỉ inject CARRIER_ADAPTER, không biết đang dùng hãng nào.
 */
export function selectCarrierAdapter(
  config: ConfigService,
  ghn: GhnAdapter,
  mock: MockCarrierAdapter,
): CarrierAdapter {
  const logger = new Logger('CarriersModule');
  const mode = config.get<string>('carrier.mode');
  if (mode === 'mock') return mock;
  if (mode === 'ghn_staging' || mode === 'ghn_production') return ghn;
  if (config.get<string>('carrier.ghn.token')) return ghn;
  logger.warn('Chưa đặt CARRIER_MODE và chưa có GHN_TOKEN — dùng đơn vị vận chuyển mô phỏng (mock).');
  return mock;
}

@Module({
  providers: [
    GhnAdapter,
    MockCarrierAdapter,
    {
      provide: CARRIER_ADAPTER,
      useFactory: selectCarrierAdapter,
      inject: [ConfigService, GhnAdapter, MockCarrierAdapter],
    },
  ],
  exports: [CARRIER_ADAPTER],
})
export class CarriersModule {}
