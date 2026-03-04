import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Create email transporter
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

// Email templates
interface EmailTemplateData {
  [key: string]: any;
}

// Render email template
function renderTemplate(template: string, data: EmailTemplateData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  return result;
}

// Email templates
const templates = {
  welcome: {
    subject: 'Welcome to G-SEO!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">🌍 G-SEO</h1>
        </div>
        <h2>Welcome to G-SEO, {{firstName}}!</h2>
        <p>Thank you for joining G-SEO. We're excited to help you optimize your website for AI-powered search engines.</p>
        
        <div style="background: #F3F4F6; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <h3 style="margin-top: 0;">🚀 Get Started</h3>
          <ol style="padding-left: 20px;">
            <li>Complete your profile</li>
            <li>Purchase credits or subscribe</li>
            <li>Generate your first GEO report</li>
          </ol>
        </div>
        
        <p>If you have any questions, reply to this email or visit our help center.</p>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 40px;">
          Best regards,<br/>
          The G-SEO Team
        </p>
      </div>
    `,
  },

  reportComplete: {
    subject: 'Your GEO Report is Ready!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">🌍 G-SEO</h1>
        </div>
        <h2>Your GEO Report is Ready!</h2>
        <p>Hi {{firstName}},</p>
        <p>Your GEO SEO report for <strong>{{websiteName}}</strong> is now complete.</p>
        
        <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <div style="color: white;">
            <div style="font-size: 48px; font-weight: bold; margin-bottom: 8px;">{{geoScore}}</div>
            <div style="font-size: 16px; opacity: 0.9;">GEO Score</div>
          </div>
        </div>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{downloadUrl}}" style="display: inline-block; background: #4F46E5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            📊 Download Full Report
          </a>
        </div>
        
        <p style="color: #6B7280; font-size: 14px;">
          This report will be available in your dashboard for 12 months.
        </p>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 40px;">
          Best regards,<br/>
          The G-SEO Team
        </p>
      </div>
    `,
  },

  paymentReceipt: {
    subject: 'Payment Receipt - G-SEO',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">🌍 G-SEO</h1>
        </div>
        <h2>Payment Receipt</h2>
        <p>Hi {{firstName}},</p>
        <p>Thank you for your purchase! Here are your order details:</p>
        
        <div style="background: #F3F4F6; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Description</td>
              <td style="text-align: right; padding: 8px 0;">{{description}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Amount</td>
              <td style="text-align: right; padding: 8px 0;">£{{amount}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Credits Added</td>
              <td style="text-align: right; padding: 8px 0;">+{{credits}} credits</td>
            </tr>
            <tr style="border-top: 1px solid #D1D5DB;">
              <td style="padding: 12px 0; font-weight: bold;">Total</td>
              <td style="text-align: right; padding: 12px 0; font-weight: bold;">£{{amount}}</td>
            </tr>
          </table>
        </div>
        
        <p style="color: #6B7280; font-size: 14px;">
          Transaction ID: {{transactionId}}
        </p>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 40px;">
          Best regards,<br/>
          The G-SEO Team
        </p>
      </div>
    `,
  },

  subscriptionConfirmation: {
    subject: 'Subscription Confirmed - G-SEO',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">🌍 G-SEO</h1>
        </div>
        <h2>Subscription Confirmed!</h2>
        <p>Hi {{firstName}},</p>
        <p>Your subscription is now active. You have access to {{reportsPerYear}} reports per year.</p>
        
        <div style="background: #10B981; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <div style="color: white; font-size: 18px; font-weight: 600;">
            ✓ Active until {{renewalDate}}
          </div>
        </div>
        
        <p>You can manage your subscription at any time from your dashboard.</p>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 40px;">
          Best regards,<br/>
          The G-SEO Team
        </p>
      </div>
    `,
  },

  lowCredits: {
    subject: 'Your credits are running low - G-SEO',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">🌍 G-SEO</h1>
        </div>
        <h2>Running Low on Credits</h2>
        <p>Hi {{firstName}},</p>
        <p>You only have <strong>{{credits}} credits</strong> remaining. Generate more reports to continue analyzing websites.</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{buyCreditsUrl}}" style="display: inline-block; background: #4F46E5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Buy More Credits
          </a>
        </div>
        
        <p style="color: #6B7280; font-size: 14px;">
          Or upgrade to our monthly plan for {{monthlyReports}} reports per month!
        </p>
        
        <p style="color: #6B7280; font-size: 14px; margin-top: 40px;">
          Best regards,<br/>
          The G-SEO Team
        </p>
      </div>
    `,
  },
};

// Send email function
export async function sendEmail(params: {
  to: string;
  template: keyof typeof templates;
  data: EmailTemplateData;
}): Promise<void> {
  const { to, template, data } = params;
  const templateData = templates[template];

  if (!templateData) {
    throw new Error(`Unknown email template: ${template}`);
  }

  const html = renderTemplate(templateData.html, data);
  const text = html.replace(/<[^>]*>/g, '');

  try {
    await transporter.sendMail({
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to,
      subject: templateData.subject,
      html,
      text,
    });

    logger.info(`Email sent: ${template} to ${to}`);
  } catch (error) {
    logger.error(`Failed to send email: ${template} to ${to}`, error);
    throw error;
  }
}

// Verify email connection
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    logger.info('Email connection verified');
    return true;
  } catch (error) {
    logger.error('Email connection failed:', error);
    return false;
  }
}
