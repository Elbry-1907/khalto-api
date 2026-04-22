const twilio = require('twilio');
const logger = require('../utils/logger');

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

// ── Core send ─────────────────────────────────────────────
const sendSMS = async ({ to, body, countryCode = 'SA' }) => {
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
    logger.info('SMS sent', { to, sid: message.sid });
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
