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
      connectionTimeout: 8000, // 8 seconds
      greetingTimeout: 8000,   // 8 seconds
      socketTimeout: 12000,    // 12 seconds
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
   * Send workspace invite email.
   * Uses table-based button for maximum email-client compatibility (iOS Mail, Outlook, Gmail).
   * @param {string} email - Recipient email
   * @param {string} workspaceName - Name of the workspace
   * @param {string} inviterName - Name of the person who invited
   * @param {string|null} token - Invite token (null if user already exists)
   */
  async sendWorkspaceInviteEmail(email, workspaceName, inviterName, token) {
    const actionUrl = token
      ? `${env.CLIENT_URL}/invite/${token}`
      : `${env.CLIENT_URL}/login`;
    const actionText = token ? 'Accept Invite' : 'Sign In';

    await this.send({
      to: email,
      subject: `${inviterName} invited you to ${workspaceName} on ${env.APP_NAME}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #333;">
          <h2>You're invited to ${workspaceName}!</h2>
          <p>${inviterName} has invited you to join the <strong>${workspaceName}</strong> workspace on ${env.APP_NAME}.</p>

          <!-- Table-based button: works in iOS Mail, Outlook, Gmail, Apple Mail -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px auto;">
            <tr>
              <td style="border-radius: 6px; background-color: #4F46E5;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${actionUrl}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" stroke="f" fillcolor="#4F46E5">
                <w:anchorlock/>
                <center>
                <![endif]-->
                <a href="${actionUrl}"
                   style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; mso-padding-alt: 0; text-align: center;">
                  ${actionText}
                </a>
                <!--[if mso]>
                </center>
                </v:roundrect>
                <![endif]-->
              </td>
            </tr>
          </table>

          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <a href="${actionUrl}">${actionUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">This invite expires in 7 days.</p>
        </div>
      `,
      text: `${inviterName} invited you to ${workspaceName} on ${env.APP_NAME}.\n\n${actionText}: ${actionUrl}\n\nThis invite expires in 7 days.`,
    });
  }

  /**
   * Send password reset link.
   * @param {string} email
   * @param {string} name
   * @param {string} token - Reset token
   */
  async sendPasswordResetEmail(email, name, token) {
    const resetUrl = `${env.CLIENT_URL}/reset-password/${token}`;

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
