const twilio = require('twilio');
const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../db');
const { resolveActiveProvider } = require('./provider-resolver.service');

// ── Twilio client ─────────────────────────────────────────
let client;
const getClient = () => {
  if (!client) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }
  return client;
};

// ── Sender IDs per country ────────────────────────────────
const getSender = (countryCode = 'SA') => {
  const map = {
    SA: process.env.TWILIO_PHONE_SA || process.env.TWILIO_PHONE_NUMBER,
    EG: process.env.TWILIO_PHONE_EG || process.env.TWILIO_PHONE_NUMBER,
  };
  return map[countryCode] || process.env.TWILIO_PHONE_NUMBER;
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
const sendViaDynamicProvider = async ({ to, body, provider, countryCode }) => {
  const { provider_key, config } = provider;

  try {
    switch (provider_key) {
      case 'twilio': {
        const sid = config.account_sid || config['sms-twilio-sid'];
        const token = config.auth_token || config['sms-twilio-token'];
        const from = config.from_number || config['sms-twilio-default'] || config['sms-twilio-sa'] || getSender(countryCode);
        
        if (!sid || !token || !from) throw new Error('Twilio: Missing credentials');

        const auth = Buffer.from(`${sid}:${token}`).toString('base64');
        const params = new URLSearchParams({ To: to, From: from, Body: body });
        const res = await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          params,
          { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        logger.info('SMS sent via Twilio (DB provider)', { to, sid: res.data.sid });
        return { success: true, sid: res.data.sid, provider: provider_key };
      }

      case 'unifonic': {
        const appsid = config.app_id || config['sms-unifonic-appid'];
        const sender = config.sender_id || config['sms-unifonic-sender'] || 'Khalto';
        if (!appsid) throw new Error('Unifonic: Missing credentials');

        const res = await axios.post('https://el.cloud.unifonic.com/rest/SMS/messages', null, {
          params: { AppSid: appsid, SenderID: sender, Recipient: to, Body: body },
        });
        const ok = res.data?.success === 'true' || res.data?.success === true;
        if (!ok) throw new Error(res.data?.message || 'Unifonic: Failed to send');
        
        logger.info('SMS sent via Unifonic (DB provider)', { to });
        return { success: true, provider: provider_key };
      }

      case 'vonage': {
        const key = config.api_key || config['sms-vonage-key'];
        const secret = config.api_secret || config['sms-vonage-secret'];
        const sender = config.sender_id || config['sms-vonage-sender'] || 'Khalto';
        if (!key || !secret) throw new Error('Vonage: Missing credentials');

        const res = await axios.post('https://rest.nexmo.com/sms/json', null, {
          params: { api_key: key, api_secret: secret, to: to.replace('+', ''), from: sender, text: body },
        });
        const msg = res.data?.messages?.[0];
        const ok = msg?.status === '0';
        if (!ok) throw new Error(msg?.['error-text'] || 'Vonage: Failed to send');
        
        logger.info('SMS sent via Vonage (DB provider)', { to });
        return { success: true, provider: provider_key };
      }

      case 'msg91': {
        const authKey = config.auth_key || config['sms-msg91-key'];
        const sender = config.sender_id || config['sms-msg91-sender'] || 'KHALTO';
        if (!authKey) throw new Error('MSG91: Missing credentials');

        const res = await axios.post('https://api.msg91.com/api/v5/flow/', {
          sender, route: '4',
          recipients: [{ mobiles: to.replace('+', ''), VAR1: body }],
        }, { headers: { authkey: authKey, 'Content-Type': 'application/json' } });
        const ok = res.data?.type === 'success';
        if (!ok) throw new Error('MSG91: Failed to send');
        
        logger.info('SMS sent via MSG91 (DB provider)', { to });
        return { success: true, provider: provider_key };
      }

      default:
        throw new Error(`SMS provider not supported: ${provider_key}`);
    }
  } catch (err) {
    logger.error('Dynamic provider send failed', { to, provider: provider_key, err: err.message });
    throw err;
  }
};

// ── Core send with dynamic provider fallback ──────────────
const sendSMS = async ({ to, body, countryCode = 'SA' }) => {
  try {
    // Try to resolve active provider from DB
    const countryId = await getCountryIdFromCode(countryCode);
    if (countryId) {
      const provider = await resolveActiveProvider('sms', countryId);
      if (provider) {
        try {
          const result = await sendViaDynamicProvider({ to, body, provider, countryCode });
          return result;
        } catch (err) {
          logger.warn('Dynamic SMS provider failed, falling back to Twilio env', { error: err.message });
          // Fall through to env-based code
        }
      }
    }
  } catch (err) {
    logger.warn('Provider resolution failed, using fallback', { error: err.message });
  }

  // Fallback: Original Twilio env-based code
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.warn('SMS skipped — Twilio not configured');
    return { success: false, error: 'Twilio not configured' };
  }
  try {
    const message = await getClient().messages.create({
      body,
      from: getSender(countryCode),
      to,
    });
    logger.info('SMS sent via Twilio (env fallback)', { to, sid: message.sid });
    return { success: true, sid: message.sid };
  } catch (err) {
    logger.error('SMS send failed', { to, err: err.message });
    return { success: false, error: err.message };
  }
};

// ── Detect country from phone ─────────────────────────────
const getCountryCode = (phone) => {
  if (phone.startsWith('+966') || phone.startsWith('966')) return 'SA';
  if (phone.startsWith('+20')  || phone.startsWith('20'))  return 'EG';
  return 'SA';
};

// ── SMS Templates ─────────────────────────────────────────
const sms = {

  sendOTP: async ({ phone, code, expiryMin = 5, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: رمز التحقق ${code}. صالح ${expiryMin} دقائق. لا تشاركه مع أحد.`
        : `Khalto: Your code is ${code}. Valid for ${expiryMin} min. Do not share.`,
    }),

  orderConfirmed: async ({ phone, orderNumber, kitchenName, eta, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: طلبك #${orderNumber} مؤكد من ${kitchenName}. الوقت المتوقع ${eta} دقيقة.`
        : `Khalto: Order #${orderNumber} confirmed from ${kitchenName}. ETA: ${eta} min.`,
    }),

  outForDelivery: async ({ phone, courierName, eta, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: ${courierName} في الطريق إليك! الوقت المتوقع ${eta} دقيقة.`
        : `Khalto: ${courierName} is on the way! ETA: ${eta} min.`,
    }),

  orderDelivered: async ({ phone, orderNumber, rateLink, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: وصل طلبك #${orderNumber}! بالعافية 😋 قيّم تجربتك: ${rateLink}`
        : `Khalto: Order #${orderNumber} delivered! Enjoy 😋 Rate: ${rateLink}`,
    }),

  orderCancelled: async ({ phone, orderNumber, refundAmount, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: تم إلغاء طلب #${orderNumber}. ${refundAmount ? `سيُردّ ${refundAmount} لحسابك.` : ''}`
        : `Khalto: Order #${orderNumber} cancelled. ${refundAmount ? `Refund of SAR ${refundAmount} initiated.` : ''}`,
    }),

  settlementPaid: async ({ phone, amount, currency, weekRange, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: تم تحويل ${amount} ${currency} لحسابك البنكي للأسبوع ${weekRange}.`
        : `Khalto: ${currency} ${amount} transferred for week ${weekRange}.`,
    }),

  courierPayout: async ({ phone, amount, currency, trips, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو رايدر: تم تحويل ${amount} ${currency} مقابل ${trips} توصيلة. واصل! 🛵`
        : `Khalto Rider: ${currency} ${amount} transferred for ${trips} deliveries. Keep it up! 🛵`,
    }),

  promoCode: async ({ phone, couponCode, discount, expiry, lang = 'ar' }) =>
    sendSMS({
      to: phone,
      countryCode: getCountryCode(phone),
      body: lang === 'ar'
        ? `خالتو: خصم ${discount}٪ على طلبك! كود: ${couponCode}. صالح حتى ${expiry}.`
        : `Khalto: ${discount}% off your order! Code: ${couponCode}. Valid until ${expiry}.`,
    }),
};

module.exports = { sendSMS, sms };
