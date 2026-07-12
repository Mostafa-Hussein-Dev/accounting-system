import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EnvConfig } from '../../config/env.schema';

interface SendPasswordResetCodeParams {
  to: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
}

/**
 * Thin wrapper over nodemailer. One transporter, created once and reused —
 * nodemailer pools connections internally, no need to reconnect per send.
 * In development this points at the mailpit container (docker-compose.yml,
 * web UI at http://localhost:8025) so nothing ever leaves the machine.
 *
 * Deliberately synchronous/direct (no BullMQ queue) for now — the codebase
 * has Redis provisioned but no queue infrastructure wired up yet. If email
 * latency or SMTP flakiness ever becomes a real problem, queueing this send
 * is the natural next step; not worth the added complexity until then.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.from = this.configService.get('MAIL_FROM', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', { infer: true }),
      port: this.configService.get('SMTP_PORT', { infer: true }),
      secure: this.configService.get('SMTP_SECURE', { infer: true }),
      auth: this.buildAuth(),
    });
  }

  private buildAuth(): { user: string; pass: string } | undefined {
    const user = this.configService.get('SMTP_USER', { infer: true });
    const pass = this.configService.get('SMTP_PASSWORD', { infer: true });
    return user && pass ? { user, pass } : undefined;
  }

  async sendPasswordResetCode({
    to,
    firstName,
    code,
    expiresInMinutes,
  }: SendPasswordResetCodeParams): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Your password reset code',
      text: [
        `Hi ${firstName},`,
        '',
        `Your password reset code is: ${code}`,
        '',
        `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
        '',
        "If you didn't request this, you can safely ignore this email — your password will not be changed.",
      ].join('\n'),
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #16213a;">
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Your password reset code is:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.1em; background: #f3f5f7; padding: 12px 16px; border-radius: 8px; text-align: center;">
            ${escapeHtml(code)}
          </p>
          <p>This code expires in ${expiresInMinutes} minutes and can only be used once.</p>
          <p style="color: #6b7a90; font-size: 13px;">
            If you didn't request this, you can safely ignore this email — your password will not be changed.
          </p>
        </div>
      `,
    });
    this.logger.log(`Password reset code sent to ${to}`);
  }
}

/** Minimal HTML-escaping for values interpolated into the email template
 * above — firstName/code are user-influenced (firstName at registration)
 * and must not be able to inject markup into an HTML email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
