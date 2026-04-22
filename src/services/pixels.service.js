/**
 * Khalto — Pixel Auto-Fire Service
 * يُطلق أحداث الـ Pixel تلقائياً عند وقوع أحداث مهمة في التطبيق
 *
 * الاستخدام:
 *   const pixels = require('./services/pixels.service');
 *   await pixels.onPurchase({ orderId, userId, total, currency, items });
 *   await pixels.onSignUp({ userId, role });
 *   await pixels.onAddToCart({ userId, itemId, price });
 */

const db     = require('../db');
const logger = require('../utils/logger');
const crypto = require('crypto');
const axios  = require('axios');
const { v4: uuid } = require('uuid');

const PLATFORMS = ['facebook', 'snapchat', 'tiktok', 'twitter', 'google'];

// ── Hash PII ──────────────────────────────────────────────
const hashPII = (str) =>
  str ? crypto.createHash('sha256').update(str.toLowerCase().trim()).digest('hex') : undefined;

// ── Get active platform configs ───────────────────────────
const getConfigs = async () => {
  try {
    return await db('ads_platform_configs').where({ is_active: true });
  } catch { return []; }
};

// ── Log event to DB ───────────────────────────────────────
const logEvent = async ({ eventName, userId, orderId, value, currency, platforms, results }) => {
  try {
    await db('ads_events').insert({
      id:         uuid(),
      event_id:   uuid(),
      event_name: eventName,
      user_id:    userId || null,
      order_id:   orderId || null,
      value:      value || 0,
      currency:   currency || 'SAR',
      platforms:  JSON.stringify(platforms),
      results:    JSON.stringify(results || {}),
      created_at: new Date(),
    });
  } catch (err) {
    logger.warn('Pixel log failed', { err: err.message });
  }
};

// ── Platform event map ────────────────────────────────────
const eventMap = {
  Purchase:             { facebook: 'Purchase',         snapchat: 'PURCHASE',   tiktok: 'CompletePayment', google: 'purchase'     },
  AddToCart:            { facebook: 'AddToCart',        snapchat: 'ADD_CART',   tiktok: 'AddToCart',       google: 'add_to_cart'  },
  ViewContent:          { facebook: 'ViewContent',      snapchat: 'VIEW_CONTENT',tiktok:'ViewContent',     google: 'view_item'    },
  InitiateCheckout:     { facebook: 'InitiateCheckout', snapchat: 'START_CHECKOUT', tiktok: 'InitiateCheckout', google: 'begin_checkout' },
  CompleteRegistration: { facebook: 'CompleteRegistration', snapchat: 'SIGN_UP', tiktok: 'Registration', google: 'sign_up'       },
  Search:               { facebook: 'Search',           snapchat: 'SEARCH',     tiktok: 'Search',          google: 'search'       },
  ChefSignup:           { facebook: 'ChefSignup',       tiktok: 'Registration', google: 'chef_signup'       },
  CourierSignup:        { facebook: 'CourierSignup',    tiktok: 'Registration', google: 'courier_signup'    },
  KitchenView:          { facebook: 'KitchenView',      tiktok: 'ViewContent',  google: 'view_item'         },
  CouponApplied:        { facebook: 'CouponApplied'                                                          },
  OrderDelivered:       { facebook: 'OrderDelivered'                                                         },
};

// ── Core fire function ────────────────────────────────────
const fire = async ({ eventName, userId, orderId, value, currency = 'SAR', contentIds, userData = {} }) => {
  const configs = await getConfigs();
  if (!configs.length) return;

  // Enrich user data
  if (userId && !userData.phone && !userData.email) {
    try {
      const user = await db('users').where({ id: userId }).first('phone', 'email');
      if (user) { userData.phone = user.phone; userData.email = user.email; }
    } catch (_) {}
  }

  const eventId = uuid();
  const ts      = Math.floor(Date.now() / 1000);
  const results = {};

  const sends = configs.map(async (config) => {
    const { platform } = config;
    const platformEvent = eventMap[eventName]?.[platform];
    if (!platformEvent) return;

    try {
      if (platform === 'facebook' && config.capi_enabled && config.access_token) {
        const r = await axios.post(
          `https://graph.facebook.com/v18.0/${config.pixel_id}/events?access_token=${config.access_token}`,
          {
            data: [{
              event_name:    platformEvent,
              event_time:    ts,
              event_id:      eventId,
              action_source: 'app',
              user_data: {
                ph: userData.phone ? [hashPII(userData.phone.replace(/\D/g,''))] : undefined,
                em: userData.email ? [hashPII(userData.email)] : undefined,
              },
              custom_data: {
                value, currency,
                content_ids: contentIds,
                order_id:    orderId,
              },
            }],
            test_event_code: config.test_event_code || undefined,
          },
          { timeout: 6000 }
        );
        results.facebook = { ok: true, events_received: r.data.events_received };
      }

      if (platform === 'snapchat' && config.capi_enabled && config.access_token) {
        await axios.post('https://tr.snapchat.com/v2/conversion', {
          pixel_id:  config.pixel_id,
          test_mode: !!config.test_event_code,
          data: [{
            event_name:  platformEvent,
            event_time:  ts * 1000,
            user_data: {
              ph: userData.phone ? hashPII(userData.phone.replace(/\D/g,'')) : undefined,
              em: userData.email ? hashPII(userData.email) : undefined,
            },
            custom_data: { currency, price: String(value || 0), number_items: '1' },
          }],
        }, {
          headers: { Authorization: `Bearer ${config.access_token}` },
          timeout: 6000,
        });
        results.snapchat = { ok: true };
      }

      if (platform === 'tiktok' && config.capi_enabled && config.access_token) {
        await axios.post('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          pixel_code:      config.pixel_id,
          test_event_code: config.test_event_code || undefined,
          data: [{
            event:      platformEvent,
            event_time: ts,
            event_id:   eventId,
            user: {
              phone_number: userData.phone ? hashPII(userData.phone.replace(/\D/g,'')) : undefined,
              email:        userData.email ? hashPII(userData.email) : undefined,
            },
            properties: { value: value || 0, currency },
          }],
        }, {
          headers: { 'Access-Token': config.access_token },
          timeout: 6000,
        });
        results.tiktok = { ok: true };
      }

      if (platform === 'google' && config.ga4_measurement_id && config.ga4_api_secret) {
        await axios.post(
          `https://www.google-analytics.com/mp/collect?measurement_id=${config.ga4_measurement_id}&api_secret=${config.ga4_api_secret}`,
          {
            client_id: userData.client_id || `khalto.${userId || Date.now()}`,
            events: [{
              name: platformEvent,
              params: {
                transaction_id: orderId || eventId,
                value:          value || 0,
                currency,
                engagement_time_msec: 100,
              },
            }],
          },
          { timeout: 6000 }
        );
        results.google = { ok: true };
      }
    } catch (err) {
      results[platform] = { ok: false, error: err.message };
      logger.warn(`Pixel fire failed: ${platform}/${eventName}`, { err: err.message });
    }
  });

  await Promise.allSettled(sends);
  await logEvent({ eventName, userId, orderId, value, currency, platforms: Object.keys(results), results });

  return results;
};

// ═══════════════════════════════════════════════════════════
// Public API — اتصل بهذه الدوال من أي route
// ═══════════════════════════════════════════════════════════

/**
 * عند اكتمال الشراء / دفع الطلب
 */
const onPurchase = ({ orderId, userId, total, currency, items = [] }) =>
  fire({
    eventName:  'Purchase',
    userId, orderId,
    value:      Number(total),
    currency:   currency || 'SAR',
    contentIds: items.map(i => i.menu_item_id || i.id),
  }).catch(err => logger.warn('onPurchase pixel failed', { err: err.message }));

/**
 * عند إضافة صنف للسلة
 */
const onAddToCart = ({ userId, itemId, price, currency }) =>
  fire({
    eventName:  'AddToCart',
    userId,
    value:      Number(price),
    currency:   currency || 'SAR',
    contentIds: [itemId],
  }).catch(() => {});

/**
 * عند فتح صفحة المطبخ
 */
const onKitchenView = ({ userId, kitchenId }) =>
  fire({
    eventName:  'KitchenView',
    userId,
    contentIds: [kitchenId],
  }).catch(() => {});

/**
 * عند بدء الـ checkout
 */
const onInitiateCheckout = ({ userId, total, currency }) =>
  fire({
    eventName: 'InitiateCheckout',
    userId,
    value:     Number(total),
    currency:  currency || 'SAR',
  }).catch(() => {});

/**
 * عند تسجيل عميل جديد
 */
const onCustomerSignup = ({ userId }) =>
  fire({ eventName: 'CompleteRegistration', userId })
    .catch(() => {});

/**
 * عند تسجيل شيف جديد
 */
const onChefSignup = ({ userId }) =>
  fire({ eventName: 'ChefSignup', userId })
    .catch(() => {});

/**
 * عند تسجيل مندوب جديد
 */
const onCourierSignup = ({ userId }) =>
  fire({ eventName: 'CourierSignup', userId })
    .catch(() => {});

/**
 * عند تطبيق كوبون
 */
const onCouponApplied = ({ userId, couponCode, discount }) =>
  fire({ eventName: 'CouponApplied', userId, value: discount })
    .catch(() => {});

/**
 * عند البحث
 */
const onSearch = ({ userId, query }) =>
  fire({ eventName: 'Search', userId })
    .catch(() => {});

module.exports = {
  fire,
  onPurchase,
  onAddToCart,
  onKitchenView,
  onInitiateCheckout,
  onCustomerSignup,
  onChefSignup,
  onCourierSignup,
  onCouponApplied,
  onSearch,
};
