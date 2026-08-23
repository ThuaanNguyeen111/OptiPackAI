import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { requireEnv } from '../../common/utils/env.util';
import {
  accountLockedTemplate,
  LOGO_CID,
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
  private readonly logoBuffer: Buffer | null;

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

    // Logo BOX — CID inline (Gmail không hiện data:image)
    const candidates = [
      join(process.cwd(), 'assets', 'logo', 'email-logo-box.png'),
      join(process.cwd(), 'be', 'assets', 'logo', 'email-logo-box.png'),
      join(__dirname, '..', '..', '..', 'assets', 'logo', 'email-logo-box.png'),
    ];
    const logoPath = candidates.find((p) => existsSync(p));
    if (logoPath) {
      this.logoBuffer = readFileSync(logoPath);
    } else {
      this.logoBuffer = null;
      this.logger.warn(
        `Không tìm thấy email-logo-box.png (đã thử: ${candidates.join(' | ')})`,
      );
    }
  }

  //!=============================================
  // KHÔNG throw nếu gửi mail thất bại — không làm fail nghiệp vụ chính.
  //!=============================================
  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        subject,
        html,
        attachments: this.logoBuffer
          ? [
              {
                filename: 'email-logo-box.png',
                content: this.logoBuffer,
                cid: LOGO_CID,
                contentType: 'image/png',
                contentDisposition: 'inline',
              },
            ]
          : undefined,
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
    role: number;
  }): Promise<void> {
    const { subject, html } = welcomeTempPasswordTemplate({
      name: params.name,
      email: params.to,
      temporaryPassword: params.temporaryPassword,
      loginUrl: `${this.frontendUrl}/login`,
      role: params.role,
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
