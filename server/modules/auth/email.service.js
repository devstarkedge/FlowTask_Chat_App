import nodemailer from 'nodemailer';
import env from '../../config/environment.js';
import logger from '../../utils/logger.js';

/**
 * Email Service — plug-in ready.
 *
 * Behavior:
 *  - If SMTP_HOST is configured → sends real emails via nodemailer
 *  - If SMTP_HOST is empty     → logs emails to console (development mode)
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    logger.info('Email service configured with SMTP transport', { host: env.SMTP_HOST });
  } else {
    // Development: log to console
    transporter = {
      sendMail: async (mailOptions) => {
        logger.info('📧 [DEV EMAIL] Email not sent — no SMTP configured. Content:', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          text: mailOptions.text?.substring(0, 500),
        });
        return { messageId: `dev-${Date.now()}` };
      },
    };
    logger.info('Email service running in development mode (console logging)');
  }

  return transporter;
}

class EmailService {
  /**
   * Send a raw email.
   * @param {{ to: string, subject: string, html?: string, text?: string }} options
   */
  async send({ to, subject, html, text }) {
    try {
      const transport = getTransporter();
      const result = await transport.sendMail({
        from: `"${env.APP_NAME}" <${env.SMTP_FROM}>`,
        to,
        subject,
        html,
        text,
      });
      logger.debug('Email sent', { to, subject, messageId: result.messageId });
      return result;
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error: error.message });
      throw error;
    }
  }

  /**
   * Send email verification link.
   * @param {string} email
   * @param {string} name
   * @param {string} token - Verification token
   */
  async sendVerificationEmail(email, name, token) {
    const verifyUrl = `${env.BASE_URL}/api/chat/auth/verify-email?token=${token}`;

    await this.send({
      to: email,
      subject: `Verify your ${env.APP_NAME} account`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Welcome to ${env.APP_NAME}, ${name}!</h2>
          <p>Please verify your email address by clicking the button below:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" 
               style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Verify Email
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
        </div>
      `,
      text: `Welcome to ${env.APP_NAME}, ${name}!\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    });
  }

  /**
   * Send password reset link.
   * @param {string} email
   * @param {string} name
   * @param {string} token - Reset token
   */
  async sendPasswordResetEmail(email, name, token) {
    // Client-side route handles the actual reset form
    const clientBaseUrl = Array.isArray(env.CORS_ORIGINS) ? env.CORS_ORIGINS[0] : env.CORS_ORIGINS;
    const resetUrl = `${clientBaseUrl}/reset-password/${token}`;

    await this.send({
      to: email,
      subject: `Reset your ${env.APP_NAME} password`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      `,
      text: `Hi ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    });
  }
}

export default new EmailService();
