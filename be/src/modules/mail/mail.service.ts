import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { requireEnv } from '../../common/utils/env.util';
import {
  accountLockedTemplate,
  mfaEnabledTemplate,
  passwordResetTemplate,
  welcomeTempPasswordTemplate,
} from './mail.templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

 
  constructor(private readonly configService: ConfigService) {
    this.fromName = this.configService.get<string>('mail.fromName', 'OptiPackAI');
    this.frontendUrl = this.configService.get<string>('mail.frontendUrl', 'http://localhost:5173');

    const host = requireEnv(this.configService.get<string>('mail.host'), 'MAIL_HOST');
    const port = this.configService.get<number>('mail.port', 587);
    const secure = this.configService.get<boolean>('mail.secure', false);
    const user = requireEnv(this.configService.get<string>('mail.user'), 'MAIL_USER');
    const password = requireEnv(this.configService.get<string>('mail.password'), 'MAIL_PASSWORD');

    this.fromAddress = this.configService.get<string>('mail.fromAddress') ?? user;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });
  }

  //!=============================================
  // KHÔNG throw lỗi ra ngoài nếu gửi mail thất bại — nghiệp vụ chính
  // (tạo tài khoản, đổi mật khẩu...) KHÔNG được phép fail chỉ vì SMTP server
  // tạm thời lag/down. Chỉ log lại để Admin biết mà kiểm tra thêm.
  //!=============================================
  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        subject,
        html,
      });
    } catch (err: unknown) {

      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gửi email thất bại tới ${to}: ${message}`);
    }
  }

  async sendWelcomeTempPassword(params: {
    to: string;
    name: string;
    temporaryPassword: string;
  }): Promise<void> {
    const { subject, html } = welcomeTempPasswordTemplate({
      name: params.name,
      email: params.to,
      temporaryPassword: params.temporaryPassword,
      loginUrl: `${this.frontendUrl}/login`,
    });
    await this.send(params.to, subject, html);
  }

  async sendPasswordReset(params: {
    to: string;
    name: string;
    resetToken: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const { subject, html } = passwordResetTemplate({
      name: params.name,
      resetUrl: `${this.frontendUrl}/reset-password?token=${params.resetToken}`,
      expiresInMinutes: params.expiresInMinutes,
    });
    await this.send(params.to, subject, html);
  }

  async sendAccountLocked(params: { to: string; name: string }): Promise<void> {
    const { subject, html } = accountLockedTemplate({ name: params.name });
    await this.send(params.to, subject, html);
  }

  async sendMfaEnabled(params: { to: string; name: string }): Promise<void> {
    const { subject, html } = mfaEnabledTemplate({ name: params.name });
    await this.send(params.to, subject, html);
  }
}
