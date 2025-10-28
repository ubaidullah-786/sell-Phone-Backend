const nodemailer = require('nodemailer');
const https = require('https');
const { URL } = require('url');

// Helper to normalize base URL and avoid double slashes
const normalizeBaseUrl = url => (url ? url.replace(/\/$/, '') : url);

const createTransporter = () => {
  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USERNAME,
        pass: process.env.GMAIL_PASSWORD,
      },
    });
  } else {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'sandbox.smtp.mailtrap.io',
      port: process.env.EMAIL_PORT || 2525,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
};

const sendEmail = async (to, subject, htmlContent, textContent) => {
  try {
    // In production, optionally delegate email sending to the frontend API (e.g., on Vercel)
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.FRONTEND_EMAIL_API_URL &&
      process.env.EMAIL_SECRET
    ) {
      const baseUrl = normalizeBaseUrl(process.env.FRONTEND_EMAIL_API_URL);
      const endpoint = `${baseUrl}/api/email/send`;
      const payload = JSON.stringify({
        to,
        subject,
        html: htmlContent,
        text: textContent,
        from: process.env.EMAIL_FROM,
      });

      // Prefer global fetch if available (Node 18+)
      if (typeof fetch === 'function') {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.EMAIL_SECRET}`,
          },
          body: payload,
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(
            `Frontend email API error (${res.status}): ${msg?.slice(0, 500)}`,
          );
        }
        const data = await res.json().catch(() => ({}));
        console.log('Email sent via frontend API to:', to);
        return data;
      }

      // Fallback for older Node without fetch: use https.request
      const url = new URL(endpoint);
      const options = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${process.env.EMAIL_SECRET}`,
        },
      };

      const responseText = await new Promise((resolve, reject) => {
        const req = https.request(options, res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else
              reject(
                new Error(
                  `Frontend email API error (${res.statusCode}): ${data.slice(0, 500)}`,
                ),
              );
          });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });

      console.log('Email sent via frontend API to:', to);
      try {
        return JSON.parse(responseText);
      } catch (_) {
        return { status: 'ok' };
      }
    }

    // Default path: send directly using SMTP transporter (dev or when API delegation isn't configured)
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', to);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    throw error;
  }
};

// Email templates
const getEmailVerificationHTML = (name, verificationURL) => {
  const firstName = name.split(' ')[0];
  return `
    <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Welcome to SellPhone!</h1>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">Hi ${firstName},</p>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">Thank you for signing up! To complete your account creation, please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${verificationURL}" style="background-color: #4A90E2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">Verify Email Address</a>
          </div>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #4A90E2; word-break: break-all; font-size: 14px;">${verificationURL}</p>
          <p style="color: #666; line-height: 1.6; font-size: 14px; margin-top: 30px;">This verification link will expire in 24 hours.</p>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} SellPhone. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
};

const getPasswordResetHTML = (name, resetURL) => {
  const firstName = name.split(' ')[0];
  return `
    <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Password Reset Request</h1>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">Hi ${firstName},</p>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">You requested to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${resetURL}" style="background-color: #E74C3C; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">Reset Password</a>
          </div>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #E74C3C; word-break: break-all; font-size: 14px;">${resetURL}</p>
          <p style="color: #666; line-height: 1.6; font-size: 14px; margin-top: 30px;"><strong>This reset link will expire in 10 minutes.</strong></p>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If you didn't request this password reset, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} SellPhone. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
};

const getEmailChangeHTML = (name, newEmail, verificationURL) => {
  const firstName = name.split(' ')[0];
  return `
    <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Verify Your New Email Address</h1>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">Hi ${firstName},</p>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">You requested to change your email address to: <strong>${newEmail}</strong></p>
          <p style="color: #666; line-height: 1.6; font-size: 16px;">To complete this change, please verify your new email address by clicking the button below:</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${verificationURL}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">Verify New Email</a>
          </div>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #28a745; word-break: break-all; font-size: 14px;">${verificationURL}</p>
          <p style="color: #666; line-height: 1.6; font-size: 14px; margin-top: 30px;"><strong>This verification link will expire in 24 hours.</strong></p>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If you didn't request this email change, please ignore this email or contact support.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} SellPhone. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
};

module.exports = {
  sendEmail,
  getEmailVerificationHTML,
  getPasswordResetHTML,
  getEmailChangeHTML,
};
