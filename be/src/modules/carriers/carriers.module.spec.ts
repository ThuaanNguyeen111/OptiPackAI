import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import carrierConfig from '../../config/carrier.config';
import { CarriersModule } from './carriers.module';
import { CARRIER_ADAPTER, CarrierAdapter } from './carrier-adapter.interface';
import { CarrierCode } from './carrier.types';

//!=============================================
// 08/10/2026 (C2) — dựng module thật qua Nest DI (lỗi thiếu wiring chỉ lộ khi
// khởi tạo module, tsc/eslint không bắt được — xem "QUY TRÌNH TỐT HƠN" nhóm C).
// ConfigModule isGlobal giống app.module.ts.
//!=============================================
describe('CarriersModule (DI thật)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function resolveAdapter(): Promise<CarrierAdapter> {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [carrierConfig], ignoreEnvFile: true }), CarriersModule],
    }).compile();
    return moduleRef.get<CarrierAdapter>(CARRIER_ADAPTER);
  }

  it('CARRIER_MODE=ghn_staging → GhnAdapter', async () => {
    process.env.CARRIER_MODE = 'ghn_staging';
    process.env.GHN_TOKEN = 'T';
    process.env.GHN_SHOP_ID = '227609';
    expect((await resolveAdapter()).code).toBe(CarrierCode.GHN);
  });

  it('CARRIER_MODE=mock → MockCarrierAdapter', async () => {
    process.env.CARRIER_MODE = 'mock';
    expect((await resolveAdapter()).code).toBe(CarrierCode.MOCK);
  });
});
