import { AppException } from '../../../common/exceptions/app-exception';
import { CARRIER_ERROR_CODES } from '../carriers.errors';
import { CreateShipmentInput } from '../carrier.types';
import { GhnAdapter } from './ghn.adapter';

const mockGet = jest.fn();
const mockPost = jest.fn();

interface FakeAxiosError {
  isAxiosError: true;
  message: string;
  response?: { status: number; data: unknown };
}

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: (): unknown => ({
      get: (...args: unknown[]): unknown => mockGet(...args),
      post: (...args: unknown[]): unknown => mockPost(...args),
    }),
    isAxiosError: (e: unknown): boolean =>
      typeof e === 'object' && e !== null && (e as FakeAxiosError).isAxiosError,
  },
}));

function httpError(status: number | undefined, data?: unknown): FakeAxiosError {
  return status === undefined
    ? { isAxiosError: true, message: 'timeout' }
    : { isAxiosError: true, message: `HTTP ${String(status)}`, response: { status, data } };
}

function makeAdapter(values: Record<string, string | undefined> = {}): GhnAdapter {
  const defaults: Record<string, string | undefined> = {
    'carrier.ghn.baseUrl': 'https://dev-online-gateway.ghn.vn',
    'carrier.ghn.token': 'TEST-TOKEN',
    'carrier.ghn.shopId': '227609',
  };
  const config = { get: jest.fn((key: string) => ({ ...defaults, ...values })[key]) };
  return new GhnAdapter(config as never);
}

const createInput: CreateShipmentInput = {
  client_order_code: 'SHP-261008-ABC123',
  recipient: {
    name: 'Nguyen Van Test',
    phone: '0900000000',
    address: '10 Xo Viet Nghe Tinh, Phường 28, Quận Bình Thạnh, Hồ Chí Minh',
    district_id: 1462,
    ward_code: '21620',
    province_name: 'Hồ Chí Minh',
    district_name: 'Quận Bình Thạnh',
    ward_name: 'Phường 28',
  },
  parcel: { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 },
  items: [{ name: 'Áo polo', code: 'POLO-001-DEN-M', quantity: 1, price: 360000 }],
  content: 'Áo polo x1',
  cod_amount: 0,
};

//!=============================================
// 08/10/2026 (C2) — adapter GHN: đúng endpoint/header/body theo tài liệu GHN và
// kết quả gọi thật môi trường test; ánh xạ lỗi; chính sách thử lại.
//!=============================================
describe('GhnAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb();
      return 0;
    }) as unknown as typeof setTimeout);
  });
  afterEach(() => jest.restoreAllMocks());

  it('calculateFee: POST /v2/shipping-order/fee, header Token + ShopId, body theo mã quận/phường kiểu cũ', async () => {
    mockPost.mockResolvedValue({
      data: {
        code: 200,
        data: {
          total: 20900,
          service_fee: 20900,
          insurance_fee: 0,
          cod_fee: 0,
          pick_remote_areas_fee: 0,
          deliver_remote_areas_fee: 0,
        },
      },
    });
    const fee = await makeAdapter().calculateFee({
      to_district_id: 1462,
      to_ward_code: '21620',
      parcel: { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 },
    });

    const [path, body, options] = mockPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ];
    expect(path).toBe('/v2/shipping-order/fee');
    expect(options.headers).toEqual({ Token: 'TEST-TOKEN', ShopId: '227609' });
    expect(body).toMatchObject({
      service_type_id: 2,
      to_district_id: 1462,
      to_ward_code: '21620',
      weight: 300,
      length: 30,
      width: 25,
      height: 4,
    });
    expect(fee).toEqual({
      total: 20900,
      service_fee: 20900,
      insurance_fee: 0,
      cod_fee: 0,
      remote_area_fee: 0,
      other_fee: 0,
    });
  });

  it('createShipment: gửi cả mã lẫn tên địa chỉ + client_order_code + required_note mặc định; đọc order_code/phí/ngày giao', async () => {
    mockPost.mockResolvedValue({
      data: {
        code: 200,
        data: {
          order_code: 'L88K7R',
          sort_code: 'THUY-00',
          fee: { main_service: 20900, insurance: 0, cod_fee: 0 },
          total_fee: 20900,
          expected_delivery_time: '2026-10-08T16:59:59Z',
        },
      },
    });
    const result = await makeAdapter().createShipment(createInput);

    const [path, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/v2/shipping-order/create');
    expect(body).toMatchObject({
      client_order_code: 'SHP-261008-ABC123',
      to_district_id: 1462,
      to_ward_code: '21620',
      to_ward_name: 'Phường 28',
      to_district_name: 'Quận Bình Thạnh',
      to_province_name: 'Hồ Chí Minh',
      required_note: 'CHOXEMHANGKHONGTHU',
      payment_type_id: 1,
      service_type_id: 2,
    });
    expect(result.carrier_order_code).toBe('L88K7R');
    expect(result.sort_code).toBe('THUY-00');
    expect(result.fee.total).toBe(20900);
    expect(result.expected_delivery_at?.toISOString()).toBe('2026-10-08T16:59:59.000Z');
  });

  it('C3 — previewShipment kiểu mới (không mã cũ): is_new_to_address=true, chỉ phường + tỉnh, không gửi mã quận', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: { order_code: '', sort_code: 'GXT-M-11-00', total_fee: 20900 } } });
    const result = await makeAdapter().previewShipment({
      ...createInput,
      recipient: {
        name: 'Khach Test',
        phone: '0377168254',
        address: 'Phường Bình Lợi Trung, Hồ Chí Minh',
        ward_name: 'Phường Bình Lợi Trung',
        province_name: 'Hồ Chí Minh',
        district_name: null,
      },
    });
    const [path, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/v2/shipping-order/preview');
    expect(body).toMatchObject({
      is_new_to_address: true,
      to_ward_name: 'Phường Bình Lợi Trung',
      to_province_name: 'Hồ Chí Minh',
      to_address: 'Phường Bình Lợi Trung, Hồ Chí Minh',
    });
    expect(body).not.toHaveProperty('to_district_id');
    expect(body).not.toHaveProperty('to_ward_code');
    expect(result.fee.total).toBe(20900);
  });

  it('C3 — GHN "To address conflict" (số nhà không thuộc phường) → CARRIER_ADDRESS_CONFLICT', async () => {
    mockPost.mockRejectedValue(
      httpError(400, { code: 400, message: 'To address conflict', code_message_value: 'Địa chỉ nhận không hợp lệ' }),
    );
    await expect(makeAdapter().previewShipment(createInput)).rejects.toMatchObject({
      errorCode: 'CARRIER_ADDRESS_CONFLICT',
    });
  });

  it('createShipment: lỗi mạng rồi thành công → tự thử lại (an toàn vì GHN chống trùng client_order_code)', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(undefined))
      .mockResolvedValueOnce({ data: { code: 200, data: { order_code: 'L88K7R', total_fee: 20900 } } });
    const result = await makeAdapter().createShipment(createInput);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(result.carrier_order_code).toBe('L88K7R');
  });

  it('cancelShipment: KHÔNG tự thử lại khi lỗi 5xx → CARRIER_UNAVAILABLE', async () => {
    mockPost.mockRejectedValue(httpError(502));
    await expect(makeAdapter().cancelShipment('L88K7R')).rejects.toMatchObject({
      errorCode: CARRIER_ERROR_CODES.UNAVAILABLE,
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('cancelShipment: result=false (GHN đã lấy hàng) → cancelled=false, không ném lỗi', async () => {
    mockPost.mockResolvedValue({
      data: { code: 200, data: [{ order_code: 'L88K7R', result: false, message: 'Không thể huỷ' }] },
    });
    await expect(makeAdapter().cancelShipment('L88K7R', 'GHN-CO002')).resolves.toEqual({
      carrier_order_code: 'L88K7R',
      cancelled: false,
      message: 'Không thể huỷ',
    });
    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ order_codes: ['L88K7R'], reason_code: 'GHN-CO002' });
  });

  it.each([
    ['PROVINCE_NAME_NOT_VALID', CARRIER_ERROR_CODES.INVALID_ADDRESS],
    ['FROM_ADDRESS_CONVERT_FAIL', CARRIER_ERROR_CODES.INVALID_ADDRESS],
    ['PHONE_INVALID', CARRIER_ERROR_CODES.INVALID_PHONE],
    ['ROUTE_NOT_FOUND_SERVICE', CARRIER_ERROR_CODES.ROUTE_NOT_SUPPORTED],
    ['CLIENT_NOT_OWNER_OF_SHOP', CARRIER_ERROR_CODES.UNAUTHORIZED],
    ['USER_ERR_COMMON', CARRIER_ERROR_CODES.INVALID_REQUEST],
  ])('lỗi 400 GHN %s → %s (không thử lại), giữ câu báo tiếng Việt của GHN', async (ghnCode, expected) => {
    mockPost.mockRejectedValue(
      httpError(400, { code: 400, code_message: ghnCode, code_message_value: 'Thông báo từ GHN', data: null }),
    );
    const error = await makeAdapter().createShipment(createInput).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ errorCode: expected });
    expect((error as AppException).message).toBe('Thông báo từ GHN');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('getShipmentDetailByClientCode: GHN báo không tìm thấy → null (không ném lỗi)', async () => {
    mockGet.mockRejectedValue(httpError(400, { code: 400, message: 'Order not found', data: null }));
    await expect(makeAdapter().getShipmentDetailByClientCode('SHP-X')).resolves.toBeNull();
  });

  it('createLabel: trả URL printA5 kèm token, hết hạn trước 30 phút', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: { token: 'abc-123' } } });
    const before = Date.now();
    const label = await makeAdapter().createLabel(['L88K7R']);
    expect(label.url).toBe('https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=abc-123');
    expect(label.expires_at.getTime() - before).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('thiếu GHN_TOKEN → CARRIER_NOT_CONFIGURED, không gọi mạng', async () => {
    await expect(
      makeAdapter({ 'carrier.ghn.token': undefined }).calculateFee({
        to_district_id: 1462,
        to_ward_code: '21620',
        parcel: { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 },
      }),
    ).rejects.toMatchObject({ errorCode: CARRIER_ERROR_CODES.NOT_CONFIGURED });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('kiện vượt giới hạn (cạnh > 200 cm) → CARRIER_PARCEL_LIMIT_EXCEEDED trước khi gọi GHN', async () => {
    await expect(
      makeAdapter().calculateFee({
        to_district_id: 1462,
        to_ward_code: '21620',
        parcel: { weight_g: 300, length_cm: 250, width_cm: 25, height_cm: 4 },
      }),
    ).rejects.toMatchObject({ errorCode: CARRIER_ERROR_CODES.PARCEL_LIMIT_EXCEEDED });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('getAvailableServices: lấy district kho từ Get Shop 1 lần rồi dùng lại (cache)', async () => {
    mockGet.mockResolvedValue({
      data: { code: 200, data: { shops: [{ _id: 227609, district_id: 1462 }] } },
    });
    mockPost.mockResolvedValue({
      data: { code: 200, data: [{ service_id: 53320, short_name: 'Hàng nhẹ', service_type_id: 2 }] },
    });
    const adapter = makeAdapter();
    await adapter.getAvailableServices(1442);
    const services = await adapter.getAvailableServices(1443);
    expect(mockGet).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[1] as [string, Record<string, unknown>];
    expect(body).toEqual({ shop_id: 227609, from_district: 1462, to_district: 1443 });
    expect(services).toEqual([{ service_id: 53320, service_type_id: 2, short_name: 'Hàng nhẹ' }]);
  });
});
