import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** The sender's domain has to be verified in Resend. */
const DEFAULT_FROM = 'Katalyst PM <noreply@katek-ai.com>';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetCode(to: string, code: string, expiresInMinutes: number, userName?: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set, so the password reset email was not sent.');
    }
    const greeting = userName ? `Hi ${escapeHtml(userName)},` : 'Hi,';
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: this.configService.get<string>('RESEND_FROM') || DEFAULT_FROM,
        to: [to],
        subject: 'Your Katalyst PM password reset code',
        text: `${userName ? `Hi ${userName},` : 'Hi,'}\n\nYour password reset code is ${code}. It expires in ${expiresInMinutes} minutes.\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111111">
  <h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
  <p style="margin:0 0 16px;line-height:1.5">${greeting} use this code to reset your Katalyst PM password:</p>
  <p style="margin:0 0 16px;padding:14px;background:#f4f4f4;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center">${code}</p>
  <p style="margin:0 0 8px;line-height:1.5">It expires in ${expiresInMinutes} minutes.</p>
  <p style="margin:0;color:#555555;line-height:1.5">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
</div>`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const sent = (await response.json().catch(() => null)) as { id?: string } | null;
    console.log(`[EmailService] Password reset code sent, Resend id ${sent?.id ?? 'unknown'}`);
  }
}
