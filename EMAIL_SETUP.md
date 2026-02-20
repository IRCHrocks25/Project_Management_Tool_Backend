# Email Configuration Guide

This guide explains how to configure email sending for password reset functionality using different email providers.

## Supported Email Providers

The email service supports any SMTP-compatible email provider, including:
- **Hostpoint** (Swiss hosting provider)
- Gmail
- Outlook/Hotmail
- Yahoo Mail
- Custom SMTP servers

## Environment Variables

Add these variables to your `.env` file:

```env
# Frontend URL (for reset links)
FRONTEND_URL=http://localhost:3001

# Email Configuration
EMAIL_HOST=smtp.hostpoint.ch
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@yourdomain.com
EMAIL_PASSWORD=your-email-password
EMAIL_FROM=your-email@yourdomain.com
APP_NAME=Katalyst PM
```

## Hostpoint Setup

Hostpoint is a Swiss web hosting provider. To configure email with Hostpoint:

1. **Get your email credentials** from your Hostpoint control panel
   - Email address: `yourname@yourdomain.com`
   - Email password: Your email account password

2. **Configure `.env`**:
```env
EMAIL_HOST=smtp.hostpoint.ch
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@yourdomain.com
EMAIL_PASSWORD=your-email-password
EMAIL_FROM=your-email@yourdomain.com
FRONTEND_URL=http://localhost:3001
APP_NAME=Katalyst PM
```

**Alternative Hostpoint SMTP settings** (if the above doesn't work):
```env
EMAIL_HOST=mail.hostpoint.ch
EMAIL_PORT=587
EMAIL_SECURE=false
# or try port 465 with secure=true
# EMAIL_PORT=465
# EMAIL_SECURE=true
```

## Gmail Setup

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Copy the 16-character password

3. **Configure `.env`**:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
```

## Outlook/Hotmail Setup

1. **Use your regular email and password** (or app password if 2FA is enabled)

2. **Configure `.env`**:
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=your-email@outlook.com
```

## Yahoo Mail Setup

```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@yahoo.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@yahoo.com
```

## Custom SMTP Server

For custom SMTP servers, use your provider's SMTP settings:

```env
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587  # or 465 for SSL
EMAIL_SECURE=false  # true for port 465, false for 587
EMAIL_USER=your-email@domain.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=your-email@domain.com
```

## Testing

After configuration, test the password reset flow:

1. Go to the login page
2. Click "Forgot password?"
3. Enter your email address
4. Check your email inbox for the reset link

## Troubleshooting

### "Invalid login" or "Authentication failed"
- **Gmail**: Make sure you're using an App Password, not your regular password
- **Outlook**: Try enabling "Less secure app access" or use an app password
- Verify your email and password are correct

### "Connection timeout"
- Check your firewall settings
- Verify the SMTP host and port are correct
- Some networks block SMTP ports - try a different network

### Emails not received
- Check spam/junk folder
- Verify `EMAIL_FROM` matches `EMAIL_USER`
- Check server logs for error messages

## Security Notes

- Never commit your `.env` file to version control
- Use App Passwords instead of regular passwords when possible
- Consider using environment-specific email accounts for production
- Regularly rotate email passwords

