const sgMail  = require('@sendgrid/mail');
const axios = require('axios');
const logger  = require('../utils/logger');
const db = require('../db');
const { resolveActiveProvider } = require('./provider-resolver.service');

const _sgKey = process.env.SENDGRID_API_KEY || process.env.SMTP_PASS || "";
if (_sgKey && _sgKey.startsWith("SG.")) { sgMail.setApiKey(_sgKey); } else { console.warn("⚠️  SendGrid key not configured - emails disabled"); }

const FROM = {
  email: process.env.SMTP_FROM || 'noreply@khalto.app',
  name:  'Khalto خالتو',
};

// ── Helper: Get country ID from country code ──────────────
const getCountryIdFromCode = async (countryCode = 'SA') => {
  try {
    const country = await db('countries')
      .where({ code: countryCode })
      .first('id');
    return country?.id || null;
  } catch (err) {
    logger.warn('Failed to resolve country ID from code', { countryCode, error: err.message });
    return null;
  }
};

// ── Send via dynamic providers ────────────────────────────
const sendViaDynamicProvider = async ({ to, subject, html, text, provider, replyTo, bcc }) => {
  const { provider_key, config } = provider;

  try {
    switch (provider_key) {
      case 'sendgrid': {
        const apiKey = config.api_key;
        const fromEmail = config.from_email || 'noreply@khalto.app';
        const fromName = config.from_name || 'Khalto';
        if (!apiKey) throw new Error('SendGrid: Missing API Key');

        const msg = {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: html }],
          ...(text ? { content: [...(Array.isArray([]) ? [] : []), { type: 'text/plain', value: text }] } : {}),
          ...(replyTo ? { reply_to: { email: replyTo } } : {}),
          ...(bcc ? { bcc: [{ email: bcc }] } : {}),
        };

        await axios.post('https://api.sendgrid.com/v3/mail/send', msg, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        logger.info('Email sent via SendGrid (DB provider)', { to, subject });
        return { success: true, provider: provider_key };
      }

      case 'mailgun': {
        const apiKey = config.api_key;
        const domain = config.domain;
        const fromEmail = config.from_email || `noreply@${domain}`;
        const region = config.region || 'us';
        if (!apiKey || !domain) throw new Error('Mailgun: Missing credentials');

        const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
        const auth = Buffer.from(`api:${apiKey}`).toString('base64');
        const form = new URLSearchParams({ from: fromEmail, to, subject, html });
        if (replyTo) form.append('h:Reply-To', replyTo);
        if (bcc) form.append('bcc', bcc);

        const res = await axios.post(`${baseUrl}/${domain}/messages`, form, {
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        logger.info('Email sent via Mailgun (DB provider)', { to, subject });
        return { success: true, provider: provider_key };
      }

      case 'resend': {
        const apiKey = config.api_key;
        const fromEmail = config.from_email || 'onboarding@resend.dev';
        const fromName = config.from_name || 'Khalto';
        if (!apiKey) throw new Error('Resend: Missing API Key');

        const res = await axios.post('https://api.resend.com/emails', {
          from: `${fromName} <${fromEmail}>`,
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(bcc ? { bcc: [bcc] } : {}),
        }, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        logger.info('Email sent via Resend (DB provider)', { to, subject });
        return { success: true, provider: provider_key };
      }

      case 'smtp': {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: config.host,
            port: parseInt(config.port) || 587,
            secure: config.encryption === 'ssl',
            auth: { user: config.username, pass: config.password },
          });
          const result = await transporter.sendMail({
            from: config.from_email || FROM.email,
            to,
            subject,
            html,
            text: text || subject,
            ...(replyTo ? { replyTo } : {}),
            ...(bcc ? { bcc } : {}),
          });
          logger.info('Email sent via SMTP (DB provider)', { to, subject });
          return { success: true, provider: provider_key };
        } catch (err) {
          if (err.code === 'MODULE_NOT_FOUND') {
            throw new Error('nodemailer not installed - SMTP unavailable');
          }
          throw err;
        }
      }

      case 'ses': {
        // Amazon SES requires AWS SDK which may not be installed
        // For now, we'll throw a helpful error
        throw new Error('Amazon SES requires AWS SDK - not currently supported via API');
      }

      default:
        throw new Error(`Email provider not supported: ${provider_key}`);
    }
  } catch (err) {
    logger.error('Dynamic provider email send failed', { to, provider: provider_key, err: err.message });
    throw err;
  }
};

// ── Core send function with dynamic provider fallback ─────
const sendEmail = async ({ to, subject, html, text, replyTo, bcc, countryCode = 'SA' }) => {
  try {
    // Try to resolve active provider from DB
    const countryId = await getCountryIdFromCode(countryCode);
    if (countryId) {
      const provider = await resolveActiveProvider('email', countryId);
      if (provider) {
        try {
          const result = await sendViaDynamicProvider({ to, subject, html, text, provider, replyTo, bcc });
          return result;
        } catch (err) {
          logger.warn('Dynamic email provider failed, falling back to SendGrid env', { error: err.message });
          // Fall through to env-based code
        }
      }
    }
  } catch (err) {
    logger.warn('Provider resolution failed, using fallback', { error: err.message });
  }

  // Fallback: Original SendGrid env-based code
  try {
    const msg = {
      to, from: FROM, subject, html,
      text: text || subject,
      ...(replyTo ? { replyTo } : {}),
      ...(bcc ? { bcc } : {}),
    };
    await sgMail.send(msg);
    logger.info('Email sent via SendGrid (env fallback)', { to, subject });
    return { success: true };
  } catch (err) {
    logger.error('Email send failed', { to, err: err.message, response: err.response?.body });
    return { success: false, error: err.message };
  }
};

// ── Base HTML template ────────────────────────────────────
const baseTemplate = ({ title, body, cta, ctaUrl, isAR = false }) => `
<!DOCTYPE html>
<html lang="${isAR ? 'ar' : 'en'}" dir="${isAR ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; padding:0; background:#F8F9FC; font-family: ${isAR ? "'Cairo', 'Segoe UI'" : "'Sora', 'Helvetica Neue'"}, sans-serif; }
  .wrap { max-width:600px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; margin-top:24px; margin-bottom:24px; box-shadow:0 2px 12px rgba(0,0,0,.06); }
  .header { background:#1a1a2e; padding:24px 32px; text-align:${isAR ? 'right' : 'left'}; }
  .logo { font-size:24px; font-weight:900; color:#fff; letter-spacing:-1px; }
  .logo span { color:#E8603C; }
  .body { padding:32px; color:#1a1a2e; line-height:1.7; }
  h1 { font-size:22px; font-weight:800; margin:0 0 16px; color:#1a1a2e; }
  p { font-size:14px; color:#555; margin:0 0 14px; }
  .cta { display:inline-block; background:#E8603C; color:#fff; padding:12px 28px; border-radius:10px; font-weight:800; text-decoration:none; font-size:14px; margin:12px 0; }
  .divider { border:none; border-top:1px solid #f0f0f0; margin:24px 0; }
  .footer { background:#f9f9f9; padding:20px 32px; text-align:center; font-size:12px; color:#aaa; }
  .highlight { background:#FFF0E8; border-radius:10px; padding:14px 18px; margin:16px 0; }
  .highlight strong { color:#E8603C; }
  .row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f5f5f5; }
  .row-lbl { color:#aaa; font-size:13px; }
  .row-val { font-weight:700; font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Khal<span>to</span></div>
  </div>
  <div class="body">
    <h1>${title}</h1>
    ${body}
    ${cta && ctaUrl ? `<a class="cta" href="${ctaUrl}">${cta}</a>` : ''}
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Khalto · <a href="https://khalto.app/unsubscribe" style="color:#aaa">Unsubscribe</a>
    <br>Riyadh, Saudi Arabia & Cairo, Egypt
  </div>
</div>
</body>
</html>`;

// ── Email templates ───────────────────────────────────────
const email = {

  // ── Customer emails ──────────────────────────────────────
  orderReceipt: async ({ to, customerName, orderNumber, kitchenName, items, total, deliveryFee, discount, lang = 'ar' }) => {
    const isAR = lang === 'ar';
    const itemRows = items.map(i => `
      <div class="row">
        <span class="row-lbl">${i.quantity}× ${i.name}</span>
        <span class="row-val">SAR ${i.subtotal.toFixed(2)}</span>
      </div>`).join('');

    return sendEmail({
      to,
      subject: isAR
        ? `إيصال طلبك #${orderNumber} — خالتو`
        : `Your Khalto receipt — Order #${orderNumber}`,
      html: baseTemplate({
        isAR,
        title: isAR ? `شكراً ${customerName}! 🎉` : `Thank you, ${customerName}! 🎉`,
        body: `
          <p>${isAR ? `طلبك من ${kitchenName} في الطريق إليك.` : `Your order from ${kitchenName} is on its way.`}</p>
          <div class="highlight">
            <strong>#${orderNumber}</strong>
          </div>
          ${itemRows}
          <div class="row"><span class="row-lbl">${isAR?'التوصيل':'Delivery'}</span><span class="row-val">SAR ${deliveryFee.toFixed(2)}</span></div>
          ${discount > 0 ? `<div class="row"><span class="row-lbl">${isAR?'الخصم':'Discount'}</span><span class="row-val" style="color:#27AE60">– SAR ${discount.toFixed(2)}</span></div>` : ''}
          <div class="row"><span class="row-lbl" style="font-weight:800">${isAR?'الإجمالي':'Total'}</span><span class="row-val" style="color:#E8603C;font-size:16px">SAR ${total.toFixed(2)}</span></div>`,
        cta:    isAR ? 'تتبع طلبك' : 'Track Order',
        ctaUrl: `https://khalto.app/track/${orderNumber}`,
      }),
    });
  },

  welcome: async ({ to, name, lang = 'ar' }) => {
    const isAR = lang === 'ar';
    return sendEmail({
      to,
      subject: isAR ? '🎉 أهلاً بك في خالتو!' : '🎉 Welcome to Khalto!',
      html: baseTemplate({
        isAR,
        title: isAR ? `أهلاً بك، ${name}! 🍽️` : `Welcome, ${name}! 🍽️`,
        body: `
          <p>${isAR
            ? 'خالتو وجهتك لأشهى الأكلات البيتية الأصيلة من شيفات موثوقين في مدينتك.'
            : 'Khalto is your destination for authentic home-cooked meals from trusted chefs in your city.'}</p>
          <p>${isAR
            ? 'استخدم كود <strong>KHALTO20</strong> للحصول على خصم ٢٠٪ على أول طلب!'
            : 'Use code <strong>KHALTO20</strong> to get 20% off your first order!'}</p>`,
        cta:    isAR ? 'ابدأ الطلب' : 'Start Ordering',
        ctaUrl: 'https://khalto.app',
      }),
    });
  },

  refundConfirmation: async ({ to, customerName, orderNumber, amount, lang = 'ar' }) => {
    const isAR = lang === 'ar';
    return sendEmail({
      to,
      subject: isAR
        ? `تم معالجة الاسترداد — طلب #${orderNumber}`
        : `Refund processed — Order #${orderNumber}`,
      html: baseTemplate({
        isAR,
        title: isAR ? 'تم معالجة الاسترداد ↩️' : 'Refund Processed ↩️',
        body: `
          <p>${isAR ? `مرحباً ${customerName}،` : `Hi ${customerName},`}</p>
          <div class="highlight">
            <strong>SAR ${amount.toFixed(2)}</strong>
            ${isAR ? ' سيُردّ لحسابك خلال ٣-٥ أيام عمل.' : ' will appear in your account within 3–5 business days.'}
          </div>
          <p>${isAR ? `للطلب #${orderNumber}` : `For order #${orderNumber}`}</p>`,
      }),
    });
  },

  // ── Chef / Courier emails ─────────────────────────────────
  settlementStatement: async ({ to, recipientName, netAmount, grossAmount, commission, orderCount, weekRange, currency = 'SAR', lang = 'ar', statementUrl }) => {
    const isAR = lang === 'ar';
    return sendEmail({
      to,
      bcc: process.env.FINANCE_BCC_EMAIL,
      subject: isAR
        ? `تسويتك للأسبوع ${weekRange} — ${netAmount} ${currency}`
        : `Your settlement for ${weekRange} — ${currency} ${netAmount}`,
      html: baseTemplate({
        isAR,
        title: isAR ? '💰 تسويتك جاهزة!' : '💰 Your Settlement is Ready!',
        body: `
          <p>${isAR ? `مرحباً ${recipientName}،` : `Dear ${recipientName},`}</p>
          <p>${isAR ? `تسويتك للأسبوع ${weekRange} تمت معالجتها.` : `Your settlement for ${weekRange} has been processed.`}</p>
          <div class="highlight">
            <div class="row"><span class="row-lbl">${isAR?'الطلبات':'Orders'}</span><span class="row-val">${orderCount}</span></div>
            <div class="row"><span class="row-lbl">${isAR?'الإجمالي':'Gross'}</span><span class="row-val">${currency} ${grossAmount}</span></div>
            <div class="row"><span class="row-lbl">${isAR?'العمولة (١٥٪)':'Commission (15%)'}</span><span class="row-val" style="color:#E74C3C">– ${currency} ${commission}</span></div>
            <div class="row"><span class="row-lbl" style="font-weight:800">${isAR?'صافي دفعتك':'Your Net Payout'}</span><span class="row-val" style="color:#27AE60;font-size:16px">${currency} ${netAmount}</span></div>
          </div>`,
        cta:    isAR ? 'عرض الكشف' : 'View Statement',
        ctaUrl: statementUrl || 'https://khalto.app/finance',
      }),
    });
  },

  settlementOnHold: async ({ to, recipientName, amount, reason, currency = 'SAR', lang = 'ar' }) => {
    const isAR = lang === 'ar';
    return sendEmail({
      to,
      subject: isAR ? '⚠️ دفعتك موقوفة — مطلوب إجراء' : '⚠️ Your settlement is on hold',
      html: baseTemplate({
        isAR,
        title: isAR ? 'دفعتك تحتاج مراجعة ⚠️' : 'Settlement Requires Attention ⚠️',
        body: `
          <p>${isAR ? `مرحباً ${recipientName}،` : `Dear ${recipientName},`}</p>
          <p>${isAR
            ? `دفعتك بمبلغ <strong>${currency} ${amount}</strong> موقوفة حالياً.`
            : `Your payout of <strong>${currency} ${amount}</strong> is currently on hold.`}</p>
          <div class="highlight"><strong>${isAR?'السبب:':'Reason:'}</strong> ${reason}</div>
          <p>${isAR
            ? 'يرجى التواصل مع فريق الدعم لحل المشكلة.'
            : 'Please contact our support team to resolve this.'}
          </p>`,
        cta:    isAR ? 'تواصل مع الدعم' : 'Contact Support',
        ctaUrl: 'https://khalto.app/support',
      }),
    });
  },

  chefApproved: async ({ to, chefName, kitchenName, lang = 'ar' }) => {
    const isAR = lang === 'ar';
    return sendEmail({
      to,
      subject: isAR ? `🎉 تم قبول مطبخك — ${kitchenName}` : `🎉 Kitchen Approved — ${kitchenName}`,
      html: baseTemplate({
        isAR,
        title: isAR ? 'مطبخك جاهز للانطلاق! 🍳' : 'Your Kitchen is Live! 🍳',
        body: `
          <p>${isAR ? `أهلاً ${chefName}،` : `Hi ${chefName},`}</p>
          <p>${isAR
            ? `يسعدنا إخبارك أن مطبخ "${kitchenName}" تم قبوله على منصة خالتو وهو الآن مرئي للعملاء!`
            : `We're excited to let you know that "${kitchenName}" has been approved on Khalto and is now visible to customers!`}</p>
          <p>${isAR ? 'افتح مطبخك وابدأ تقبّل الطلبات.' : 'Open your kitchen and start accepting orders.'}</p>`,
        cta:    isAR ? 'افتح التطبيق' : 'Open App',
        ctaUrl: 'https://khalto.app/chef',
      }),
    });
  },
};

module.exports = { sendEmail, email };
