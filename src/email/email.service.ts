import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** The sender's domain has to be verified in Resend. */
const DEFAULT_FROM = 'Katalyst PM <noreply@katek-ai.com>';

/** Resend limits requests per second and one action can notify a whole department. */
const NOTIFICATION_SEND_GAP_MS = 600;
const NOTIFICATION_SEND_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref());

export interface NotificationEmail {
  to: string;
  title: string;
  message: string;
  userName?: string;
  viewLink?: string;
  appName?: string;
  /** Replaces the default button text and footer, and adds headed sections under the message. */
  viewLabel?: string;
  footer?: string;
  sections?: EmailSection[];
}

export interface EmailSection {
  heading: string;
  bullets: string[];
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

@Injectable()
export class EmailService {
  private notificationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Sends one notification email. Sends go out one at a time so a burst stays under Resend's
   * rate limit. Rejects if the email could not be sent; callers decide what that means.
   */
  sendNotification(email: NotificationEmail): Promise<void> {
    // Seeded local accounts use .local addresses, which can only bounce and hurt the sender's reputation.
    if (email.to.toLowerCase().endsWith('.local')) return Promise.resolve();
    const result = this.notificationQueue.then(() => this.deliverNotification(email));
    this.notificationQueue = result.catch(() => undefined).then(() => wait(NOTIFICATION_SEND_GAP_MS));
    return result;
  }

  private async deliverNotification(email: NotificationEmail): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set, so the notification email was not sent.');
    }
    const appName = email.appName || 'Katalyst PM';
    const greeting = email.userName ? `Hi ${email.userName},` : 'Hi,';
    const footer = email.footer || `You get these emails from ${appName}. You can turn them off in Settings.`;
    const viewLabel = email.viewLabel || `View in ${appName}`;
    const sections = email.sections || [];
    const body = JSON.stringify({
      from: this.configService.get<string>('RESEND_FROM') || DEFAULT_FROM,
      to: [email.to],
      subject: email.title,
      text: [
        greeting,
        email.message,
        ...sections.map((section) => `${section.heading}\n${section.bullets.map((b) => `- ${b}`).join('\n')}`),
        email.viewLink ? `${viewLabel}: ${email.viewLink}` : '',
        footer,
      ]
        .filter(Boolean)
        .join('\n\n'),
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111111">
  <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(email.title)}</h1>
  <p style="margin:0 0 16px;line-height:1.5">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 16px;line-height:1.5;white-space:pre-line">${escapeHtml(email.message)}</p>
  ${sections
    .map(
      (section) => `<h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(section.heading)}</h2>
  <ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${section.bullets.map((b) => `<li style="margin:0 0 6px">${escapeHtml(b)}</li>`).join('')}</ul>`,
    )
    .join('\n  ')}
  ${email.viewLink ? `<p style="margin:0 0 16px"><a href="${escapeHtml(email.viewLink)}" style="display:inline-block;padding:10px 16px;background:#111111;color:#ffffff;border-radius:8px;text-decoration:none">${escapeHtml(viewLabel)}</a></p>` : ''}
  <p style="margin:0;color:#555555;font-size:13px;line-height:1.5">${escapeHtml(footer)}</p>
</div>`,
    });

    for (let attempt = 1; ; attempt++) {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body,
      });
      if (response.status === 429 && attempt < NOTIFICATION_SEND_ATTEMPTS) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        await wait(Number.isFinite(retryAfterSeconds) && response.headers.has('retry-after') ? retryAfterSeconds * 1000 : 1000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      const sent = (await response.json().catch(() => null)) as { id?: string } | null;
      console.log(`[EmailService] Notification email sent, Resend id ${sent?.id ?? 'unknown'}`);
      return;
    }
  }

  /** For someone outside the company who shares files with us and forgot their 6-digit code. */
  async sendClientCodeReset(to: string, code: string, expiresInMinutes: number, name: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set, so the client reset email was not sent.');
    }
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: this.configService.get<string>('RESEND_FROM') || DEFAULT_FROM,
        to: [to],
        subject: 'Your reset code',
        text: `Hi ${name},\n\nYour reset code is ${code}. It expires in ${expiresInMinutes} minutes. Enter it on the sign-in page, then choose a new 6-digit code.\n\nIf you didn't ask for this, you can ignore this email. Your code won't change.`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111111">
  <h1 style="margin:0 0 16px;font-size:20px">Reset your code</h1>
  <p style="margin:0 0 16px;line-height:1.5">Hi ${escapeHtml(name)}, enter this on the sign-in page, then choose a new 6-digit code:</p>
  <p style="margin:0 0 16px;padding:14px;background:#f4f4f4;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center">${code}</p>
  <p style="margin:0 0 8px;line-height:1.5">It expires in ${expiresInMinutes} minutes.</p>
  <p style="margin:0;color:#555555;line-height:1.5">If you didn't ask for this, you can ignore this email. Your code won't change.</p>
</div>`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }

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
