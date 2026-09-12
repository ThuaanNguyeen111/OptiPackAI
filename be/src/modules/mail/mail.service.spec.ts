import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');


interface SentMailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface MockConfigService {
  get: jest.Mock<unknown, [key: string, defaultValue?: unknown]>;
}


function getFirstCallArg(mock: jest.Mock<Promise<void>, [SentMailOptions]>): SentMailOptions {
  const firstCall = mock.mock.calls[0];
  if (!firstCall) throw new Error('sendMail chưa từng được gọi lần nào - kiểm tra lại test setup');
  return firstCall[0];
}

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock<Promise<void>, [SentMailOptions]>;
  let configService: MockConfigService;

  const validConfig: Record<string, unknown> = {
    'mail.fromName': 'OptiPackAI',
    'mail.frontendUrl': 'http://localhost:5173',
    'mail.host': 'smtp.gmail.com',
    'mail.port': 587,
    'mail.secure': false,
    'mail.user': 'noreply@optipackai.com',
    'mail.password': 'app-password-gia-lap',
    'mail.fromAddress': 'noreply@optipackai.com',
  };

  beforeEach(() => {
    
    sendMailMock = jest.fn<Promise<void>, [SentMailOptions]>().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });

    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => validConfig[key] ?? defaultValue),
    };

    service = new MailService(configService as unknown as ConfigService);
  });

  it('constructor thiếu MAIL_HOST -> throw ngay lúc khởi tạo (fail nhanh, không âm thầm gửi lỗi)', () => {
    const badConfig: MockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key === 'mail.host' ? undefined : (validConfig[key] ?? defaultValue),
      ),
    };

    expect(() => new MailService(badConfig as unknown as ConfigService)).toThrow(
      'Thiếu biến môi trường bắt buộc: MAIL_HOST',
    );
  });

  it('sendWelcomeTempPassword gọi transporter.sendMail với đúng người nhận và có chứa mật khẩu tạm trong HTML', async () => {
    await service.sendWelcomeTempPassword({
      to: 'staff@optipackai.com',
      name: 'Nguyễn Văn A',
      temporaryPassword: 'TempPass123',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const callArg = getFirstCallArg(sendMailMock);
    expect(callArg.to).toBe('staff@optipackai.com');
    expect(callArg.html).toContain('TempPass123');
    expect(callArg.from).toContain('noreply@optipackai.com');
  });

  it('sendPasswordReset chứa đúng link reset kèm token trong HTML', async () => {
    await service.sendPasswordReset({
      to: 'staff@optipackai.com',
      name: 'Nguyễn Văn A',
      resetToken: 'raw-token-123',
      expiresInMinutes: 30,
    });

    const callArg = getFirstCallArg(sendMailMock);
    expect(callArg.html).toContain('raw-token-123');
    expect(callArg.html).toContain('30');
  });

  it('gửi mail thất bại (SMTP lỗi) -> KHÔNG throw ra ngoài, chỉ log lại', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP timeout'));

    await expect(
      service.sendAccountLocked({ to: 'staff@optipackai.com', name: 'Nguyễn Văn A' }),
    ).resolves.toBeUndefined();
  });

  it('sendMfaEnabled gọi đúng transporter với subject nhắc tới MFA', async () => {
    await service.sendMfaEnabled({ to: 'staff@optipackai.com', name: 'Nguyễn Văn A' });

    const callArg = getFirstCallArg(sendMailMock);
    expect(callArg.subject.toLowerCase()).toContain('mfa');
  });
});
