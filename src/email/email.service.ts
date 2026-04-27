import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    // Configure email transporter based on environment variables
    const emailHost = this.configService.get<string>('EMAIL_HOST', 'smtp.gmail.com');
    const emailPort = this.configService.get<number>('EMAIL_PORT', 587);
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPassword = this.configService.get<string>('EMAIL_PASSWORD');
    const emailSecure = this.configService.get<string>('EMAIL_SECURE', 'false') === 'true';

    // Only create transporter if credentials are provided
    if (emailUser && emailPassword) {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort,
        secure: emailSecure, // true for 465, false for other ports
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });
    } else {
      console.warn(
        '[EmailService] Email credentials not configured. Email sending will be disabled.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string, userName?: string): Promise<void> {
    const fromEmail = this.configService.get<string>(
      'EMAIL_FROM',
      this.configService.get<string>('EMAIL_USER'),
    );
    const appName = this.configService.get<string>('APP_NAME', 'Katalyst PM');

    const mailOptions = {
      from: `"${appName}" <${fromEmail}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #f9fafb;
              border-radius: 8px;
              padding: 30px;
              border: 1px solid #e5e7eb;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #667eea;
              margin-bottom: 10px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: 600;
            }
            .button:hover {
              background: #5568d3;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
            .link {
              color: #667eea;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${appName}</div>
            </div>
            <h2>Password Reset Request</h2>
            <p>Hello${userName ? ` ${userName}` : ''},</p>
            <p>We received a request to reset your password for your ${appName} account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetLink}" class="link">${resetLink}</a></p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            <div class="footer">
              <p>This is an automated message, please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hello${userName ? ` ${userName}` : ''},
        
        We received a request to reset your password for your ${appName} account.
        
        Click the link below to reset your password:
        ${resetLink}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        
        This is an automated message, please do not reply to this email.
      `,
    };

    // Check if email is configured
    if (!this.transporter) {
      console.warn(
        `[EmailService] Email not configured. Cannot send password reset email to ${email}`,
      );
      throw new Error(
        'Email service is not configured. Please set EMAIL_USER and EMAIL_PASSWORD in your .env file.',
      );
    }

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`[EmailService] Password reset email sent to ${email}`);
    } catch (error: any) {
      console.error(`[EmailService] Failed to send password reset email to ${email}:`, error);
      // Log detailed error for debugging
      if (error.response) {
        console.error(`[EmailService] SMTP Error Response:`, error.response);
      }
      if (error.code) {
        console.error(`[EmailService] Error Code:`, error.code);
      }
      throw error;
    }
  }
}
