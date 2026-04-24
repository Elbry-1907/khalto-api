/**
 * Khalto — Provider Test Runners
 *
 * Real implementations that actually try to send/connect.
 * Used by /providers/:id/test endpoint.
 */

const axios = require('axios');

// ═══════════════════════════════════════════════════════════
// SMS TEST RUNNERS
// ═══════════════════════════════════════════════════════════

async function testSMS(providerKey, config, recipient, message) {
  if (!recipient) throw new Error('رقم الهاتف مطلوب للاختبار');
  message = message || `اختبار من خالتو 🎉 ${new Date().toLocaleString('ar')}`;

  switch (providerKey) {
    case 'twilio': {
      const sid = config.account_sid || config['sms-twilio-sid'];
      const token = config.auth_token || config['sms-twilio-token'];
      const from = config.from_number || config['sms-twilio-default'] || config['sms-twilio-sa'];
      if (!sid || !token || !from) throw new Error('Twilio: SID و Token و From Number مطلوبين');

      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const params = new URLSearchParams({ To: recipient, From: from, Body: message });
      const res = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        params,
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return { success: true, message: `تم الإرسال - SID: ${res.data.sid}`, data: res.data };
    }

    case 'unifonic': {
      const appsid = config.app_id || config['sms-unifonic-appid'];
      const sender = config.sender_id || config['sms-unifonic-sender'] || 'Khalto';
      if (!appsid) throw new Error('Unifonic: App ID مطلوب');

      const res = await axios.post('https://el.cloud.unifonic.com/rest/SMS/messages', null, {
        params: { AppSid: appsid, SenderID: sender, Recipient: recipient, Body: message },
      });
      const ok = res.data?.success === 'true' || res.data?.success === true;
      return { success: !!ok, message: ok ? 'تم الإرسال عبر Unifonic' : (res.data?.message || 'فشل'), data: res.data };
    }

    case 'vonage': {
      const key = config.api_key || config['sms-vonage-key'];
      const secret = config.api_secret || config['sms-vonage-secret'];
      const sender = config.sender_id || config['sms-vonage-sender'] || 'Khalto';
      if (!key || !secret) throw new Error('Vonage: API Key و Secret مطلوبين');

      const res = await axios.post('https://rest.nexmo.com/sms/json', null, {
        params: { api_key: key, api_secret: secret, to: recipient.replace('+', ''), from: sender, text: message },
      });
      const msg = res.data?.messages?.[0];
      const ok = msg?.status === '0';
      return { success: ok, message: ok ? 'تم الإرسال عبر Vonage' : (msg?.['error-text'] || 'فشل'), data: res.data };
    }

    case 'msg91': {
      const authKey = config.auth_key || config['sms-msg91-key'];
      const sender = config.sender_id || config['sms-msg91-sender'] || 'KHALTO';
      if (!authKey) throw new Error('MSG91: Auth Key مطلوب');

      const res = await axios.post('https://api.msg91.com/api/v5/flow/', {
        sender, route: '4',
        recipients: [{ mobiles: recipient.replace('+', ''), VAR1: message }],
      }, { headers: { authkey: authKey, 'Content-Type': 'application/json' } });
      const ok = res.data?.type === 'success';
      return { success: ok, message: ok ? 'تم الإرسال عبر MSG91' : 'فشل', data: res.data };
    }

    default:
      throw new Error(`SMS provider غير مدعوم: ${providerKey}`);
  }
}

// ═══════════════════════════════════════════════════════════
// WHATSAPP TEST RUNNERS
// ═══════════════════════════════════════════════════════════

async function testWhatsApp(providerKey, config, recipient, message) {
  if (!recipient) throw new Error('رقم الهاتف مطلوب');
  message = message || `اختبار WhatsApp من خالتو 🎉`;

  switch (providerKey) {
    case 'twilio': {
      const sid = config.account_sid;
      const token = config.auth_token;
      const from = config.from_number || 'whatsapp:+14155238886';
      if (!sid || !token) throw new Error('Twilio WA: SID و Token مطلوبين');

      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const params = new URLSearchParams({
        To: `whatsapp:${recipient}`,
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        Body: message,
      });
      const res = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        params,
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return { success: true, message: `تم الإرسال - SID: ${res.data.sid}`, data: res.data };
    }

    case 'meta': {
      const phoneId = config.phone_number_id;
      const token = config.access_token;
      if (!phoneId || !token) throw new Error('Meta: Phone Number ID و Access Token مطلوبين');

      const res = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipient.replace('+', ''),
          type: 'text',
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, message: 'تم الإرسال عبر Meta', data: res.data };
    }

    case '360dialog': {
      const apiKey = config.api_key;
      if (!apiKey) throw new Error('360Dialog: API Key مطلوب');

      const res = await axios.post(
        'https://waba.360dialog.io/v1/messages',
        { to: recipient.replace('+', ''), type: 'text', text: { body: message } },
        { headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' } }
      );
      return { success: true, message: 'تم الإرسال عبر 360Dialog', data: res.data };
    }

    default:
      throw new Error(`WhatsApp provider غير مدعوم: ${providerKey}`);
  }
}

// ═══════════════════════════════════════════════════════════
// EMAIL TEST RUNNERS
// ═══════════════════════════════════════════════════════════

async function testEmail(providerKey, config, recipient, subject, body) {
  if (!recipient) throw new Error('البريد الإلكتروني مطلوب');
  subject = subject || 'اختبار من خالتو 🎉';
  body = body || `<p dir="rtl">هذا بريد تجريبي من منصة خالتو للتأكد من أن الإيميل يعمل بشكل صحيح.</p>
                  <p style="color:#888;font-size:12px">${new Date().toLocaleString('ar')}</p>`;

  switch (providerKey) {
    case 'sendgrid': {
      const apiKey = config.api_key;
      const fromEmail = config.from_email || 'noreply@khalto.app';
      const fromName = config.from_name || 'Khalto';
      if (!apiKey) throw new Error('SendGrid: API Key مطلوب');

      await axios.post('https://api.sendgrid.com/v3/mail/send', {
        personalizations: [{ to: [{ email: recipient }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: body }],
      }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      return { success: true, message: 'تم الإرسال عبر SendGrid' };
    }

    case 'mailgun': {
      const apiKey = config.api_key;
      const domain = config.domain;
      const fromEmail = config.from_email || `noreply@${domain}`;
      const region = config.region || 'us';
      if (!apiKey || !domain) throw new Error('Mailgun: API Key و Domain مطلوبين');

      const baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
      const auth = Buffer.from(`api:${apiKey}`).toString('base64');
      const form = new URLSearchParams({ from: fromEmail, to: recipient, subject, html: body });
      const res = await axios.post(`${baseUrl}/${domain}/messages`, form, {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { success: true, message: 'تم الإرسال عبر Mailgun', data: res.data };
    }

    case 'resend': {
      const apiKey = config.api_key;
      const fromEmail = config.from_email || 'onboarding@resend.dev';
      const fromName = config.from_name || 'Khalto';
      if (!apiKey) throw new Error('Resend: API Key مطلوب');

      const res = await axios.post('https://api.resend.com/emails', {
        from: `${fromName} <${fromEmail}>`,
        to: [recipient],
        subject,
        html: body,
      }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      return { success: true, message: `تم الإرسال - ID: ${res.data.id}`, data: res.data };
    }

    case 'ses': {
      // Amazon SES requires AWS SDK - we'll do a simple SMTP test instead
      throw new Error('Amazon SES اختبار غير متاح حاليًا - استخدم SMTP بدلاً من ذلك');
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
          from: config.from_email,
          to: recipient,
          subject,
          html: body,
        });
        return { success: true, message: `تم الإرسال - ${result.messageId}` };
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          throw new Error('nodemailer غير مثبت - تم تخطي اختبار SMTP');
        }
        throw err;
      }
    }

    default:
      throw new Error(`Email provider غير مدعوم: ${providerKey}`);
  }
}

// ═══════════════════════════════════════════════════════════
// PAYMENT GATEWAY CONNECTION TEST
// ═══════════════════════════════════════════════════════════

async function testPayment(providerKey, config) {
  switch (providerKey) {
    case 'tap': {
      const secretKey = config.secret_key;
      if (!secretKey) throw new Error('Tap: Secret Key مطلوب');

      // Test by listing charges (read-only call)
      const res = await axios.get('https://api.tap.company/v2/charges?limit=1', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      return { success: true, message: 'الاتصال ناجح بـ Tap Payments' };
    }

    case 'paymob': {
      const apiKey = config.api_key;
      if (!apiKey) throw new Error('Paymob: API Key مطلوب');

      const res = await axios.post('https://accept.paymob.com/api/auth/tokens', { api_key: apiKey });
      return { success: !!res.data?.token, message: res.data?.token ? 'الاتصال ناجح بـ Paymob' : 'فشل' };
    }

    case 'moyasar': {
      const secret = config.secret_key;
      if (!secret) throw new Error('Moyasar: Secret Key مطلوب');

      const auth = Buffer.from(`${secret}:`).toString('base64');
      await axios.get('https://api.moyasar.com/v1/payments?per_page=1', {
        headers: { Authorization: `Basic ${auth}` },
      });
      return { success: true, message: 'الاتصال ناجح بـ Moyasar' };
    }

    case 'stripe': {
      const secret = config.secret_key;
      if (!secret) throw new Error('Stripe: Secret Key مطلوب');

      await axios.get('https://api.stripe.com/v1/charges?limit=1', {
        headers: { Authorization: `Bearer ${secret}` },
      });
      return { success: true, message: 'الاتصال ناجح بـ Stripe' };
    }

    case 'cash': {
      return { success: true, message: 'الكاش عند التسليم لا يحتاج اختبار - مفعّل مباشرة' };
    }

    case 'hyperpay': {
      const token = config.access_token;
      if (!token) throw new Error('HyperPay: Access Token مطلوب');
      // HyperPay doesn't have a simple test endpoint - we just verify token format
      return { success: token.length > 20, message: 'تم التحقق من شكل التوكن' };
    }

    default:
      throw new Error(`Payment provider غير مدعوم: ${providerKey}`);
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════

async function runTest({ serviceType, providerKey, config, recipient, message, subject, body }) {
  try {
    let result;
    switch (serviceType) {
      case 'sms':
        result = await testSMS(providerKey, config, recipient, message);
        break;
      case 'whatsapp':
        result = await testWhatsApp(providerKey, config, recipient, message);
        break;
      case 'email':
        result = await testEmail(providerKey, config, recipient, subject, body);
        break;
      case 'payment':
        result = await testPayment(providerKey, config);
        break;
      default:
        throw new Error(`نوع خدمة غير معروف: ${serviceType}`);
    }
    return result;
  } catch (err) {
    const detail = err.response?.data?.message
      || err.response?.data?.error?.message
      || err.response?.data?.error
      || err.message;
    return { success: false, message: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  }
}

module.exports = { runTest, testSMS, testWhatsApp, testEmail, testPayment };
