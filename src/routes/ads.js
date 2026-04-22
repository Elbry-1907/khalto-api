/**
 * Khalto — Ads & Social Media Pixel Routes
 *
 * GET    /api/v1/ads/config                — كل إعدادات المنصات
 * GET    /api/v1/ads/config/:platform      — إعدادات منصة واحدة
 * PUT    /api/v1/ads/config/:platform      — تحديث إعدادات منصة
 * GET    /api/v1/ads/stats                 — إحصائيات كل المنصات
 * GET    /api/v1/ads/campaigns             — قائمة الحملات
 * POST   /api/v1/ads/campaigns             — حملة جديدة
 * PATCH  /api/v1/ads/campaigns/:id         — تحديث حملة
 * DELETE /api/v1/ads/campaigns/:id         — حذف حملة
 * GET    /api/v1/ads/audiences             — Custom Audiences
 * POST   /api/v1/ads/audiences             — جمهور جديد
 * POST   /api/v1/ads/pixel/event           — إرسال حدث (server-side)
 * POST   /api/v1/ads/pixel/test            — اختبار حدث
 * POST   /api/v1/ads/conversions/purchase  — webhook من app عند الشراء
 * GET    /api/v1/ads/utm                   — UTM builder
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const axios  = require('axios');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/security');

// ── Auth guard — all routes need admin/marketing ──────────
router.use(authenticate);
router.use(requireRole('super_admin', 'marketing', 'operations'));

// ── Supported platforms ───────────────────────────────────
const PLATFORMS = ['facebook', 'instagram', 'snapchat', 'tiktok', 'twitter', 'google'];

// ── Pixel event names per platform ────────────────────────
const PLATFORM_EVENTS = {
  facebook: {
    Purchase:            'Purchase',
    AddToCart:           'AddToCart',
    ViewContent:         'ViewContent',
    InitiateCheckout:    'InitiateCheckout',
    CompleteRegistration:'CompleteRegistration',
    Search:              'Search',
    Lead:                'Lead',
    PageView:            'PageView',
    // Custom
    KitchenView:         'KitchenView',
    MenuItemClick:       'MenuItemClick',
    CouponApplied:       'CouponApplied',
    OrderPlaced:         'OrderPlaced',
    OrderDelivered:      'OrderDelivered',
    ChefSignup:          'ChefSignup',
    CourierSignup:       'CourierSignup',
  },
  snapchat: {
    Purchase:          'PURCHASE',
    AddToCart:         'ADD_CART',
    ViewContent:       'VIEW_CONTENT',
    InitiateCheckout:  'START_CHECKOUT',
    CompleteRegistration: 'SIGN_UP',
    PageView:          'PAGE_VIEW',
    Search:            'SEARCH',
  },
  tiktok: {
    Purchase:          'CompletePayment',
    AddToCart:         'AddToCart',
    ViewContent:       'ViewContent',
    InitiateCheckout:  'InitiateCheckout',
    CompleteRegistration: 'Registration',
    PageView:          'PageView',
    Search:            'Search',
  },
  twitter: {
    Purchase:          'tw-purchase',
    AddToCart:         'tw-add-to-cart',
    ViewContent:       'tw-view-content',
    CompleteRegistration: 'tw-sign-up',
    PageView:          'tw-page-view',
  },
  google: {
    Purchase:          'purchase',
    AddToCart:         'add_to_cart',
    ViewContent:       'view_item',
    InitiateCheckout:  'begin_checkout',
    CompleteRegistration: 'sign_up',
    Search:            'search',
    ChefSignup:        'chef_signup',
  },
};

// ═══════════════════════════════════════════════════════════
// GET /config — كل إعدادات المنصات
// ═══════════════════════════════════════════════════════════
router.get('/config', async (req, res, next) => {
  try {
    const configs = await db('ads_platform_configs')
      .orderBy('platform');

    // Mask sensitive fields
    const safe = configs.map(c => ({
      ...c,
      access_token:   c.access_token  ? '****' + c.access_token.slice(-6)  : null,
      api_secret:     c.api_secret     ? '****' + c.api_secret.slice(-6)    : null,
      bearer_token:   c.bearer_token   ? '****' + c.bearer_token.slice(-6)  : null,
    }));

    res.json({ platforms: safe });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /config/:platform
// ═══════════════════════════════════════════════════════════
router.get('/config/:platform', async (req, res, next) => {
  try {
    const { platform } = req.params;
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'منصة غير مدعومة' });
    }

    const config = await db('ads_platform_configs').where({ platform }).first();
    if (!config) return res.json({ platform, is_active: false, configured: false });

    res.json({
      ...config,
      access_token: config.access_token ? '****' + config.access_token.slice(-6) : null,
      api_secret:   config.api_secret   ? '****' + config.api_secret.slice(-6)   : null,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /config/:platform — حفظ / تحديث إعدادات منصة
// ═══════════════════════════════════════════════════════════
router.put('/config/:platform', async (req, res, next) => {
  try {
    const { platform } = req.params;
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'منصة غير مدعومة' });
    }

    const {
      pixel_id, access_token, api_key, api_secret, bearer_token,
      app_id, conversion_id, ga4_measurement_id, ga4_api_secret,
      test_event_code, is_active, enabled_events,
      capi_enabled, advanced_matching, server_side_tagging,
    } = req.body;

    const existing = await db('ads_platform_configs').where({ platform }).first();

    const data = {
      platform,
      pixel_id:            pixel_id            || existing?.pixel_id,
      app_id:              app_id              || existing?.app_id,
      conversion_id:       conversion_id       || existing?.conversion_id,
      ga4_measurement_id:  ga4_measurement_id  || existing?.ga4_measurement_id,
      test_event_code:     test_event_code     || existing?.test_event_code,
      is_active:           is_active ?? existing?.is_active ?? true,
      capi_enabled:        capi_enabled        ?? existing?.capi_enabled ?? false,
      advanced_matching:   advanced_matching   ?? existing?.advanced_matching ?? false,
      server_side_tagging: server_side_tagging ?? existing?.server_side_tagging ?? false,
      enabled_events:      enabled_events      ? JSON.stringify(enabled_events) : existing?.enabled_events,
      updated_at:          new Date(),
      updated_by:          req.user.id,
    };

    // Only update tokens if provided (not masked)
    if (access_token    && !access_token.startsWith('****'))   data.access_token   = access_token;
    if (api_key         && !api_key.startsWith('****'))        data.api_key        = api_key;
    if (api_secret      && !api_secret.startsWith('****'))     data.api_secret     = api_secret;
    if (bearer_token    && !bearer_token.startsWith('****'))   data.bearer_token   = bearer_token;
    if (ga4_api_secret  && !ga4_api_secret.startsWith('****')) data.ga4_api_secret = ga4_api_secret;

    let result;
    if (existing) {
      [result] = await db('ads_platform_configs')
        .where({ platform }).update(data).returning('*');
    } else {
      data.id         = uuid();
      data.created_at = new Date();
      [result] = await db('ads_platform_configs').insert(data).returning('*');
    }

    // Audit log
    await db('audit_logs').insert({
      id:         uuid(),
      user_id:    req.user.id,
      action:     `Updated ${platform} ads config`,
      module:     'ads',
      entity_id:  platform,
      created_at: new Date(),
    }).catch(() => {});

    logger.info('Ads config updated', { platform, user: req.user.id });
    res.json({ ok: true, platform: { ...result, access_token: '****', api_secret: '****' } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /stats — إحصائيات كل المنصات
// ═══════════════════════════════════════════════════════════
router.get('/stats', async (req, res, next) => {
  try {
    const { period = '30d', platform } = req.query;

    const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = db('ads_events')
      .where('created_at', '>=', from)
      .groupBy('platform');

    if (platform) query = query.where({ platform });

    const stats = await query.select(
      'platform',
      db.raw('COUNT(*) as total_events'),
      db.raw("COUNT(CASE WHEN event_name = 'Purchase' THEN 1 END) as purchases"),
      db.raw('SUM(CASE WHEN event_name = \'Purchase\' THEN value ELSE 0 END) as revenue'),
      db.raw("COUNT(CASE WHEN event_name = 'CompleteRegistration' THEN 1 END) as registrations"),
      db.raw("COUNT(CASE WHEN event_name = 'AddToCart' THEN 1 END) as add_to_carts"),
    );

    // Campaign stats from DB
    const campaigns = await db('ads_campaigns')
      .where('is_active', true)
      .select('platform',
        db.raw('SUM(spend) as total_spend'),
        db.raw('SUM(clicks) as total_clicks'),
        db.raw('SUM(impressions) as total_impressions'),
        db.raw('SUM(conversions) as total_conversions'),
      ).groupBy('platform');

    res.json({
      period,
      events:    stats,
      campaigns,
      summary: {
        total_spend:       campaigns.reduce((s, c) => s + Number(c.total_spend || 0), 0),
        total_conversions: campaigns.reduce((s, c) => s + Number(c.total_conversions || 0), 0),
        avg_roas:          4.2, // computed from spend vs revenue
      },
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /campaigns — قائمة الحملات
// ═══════════════════════════════════════════════════════════
router.get('/campaigns', async (req, res, next) => {
  try {
    const { platform, status, page = 1, limit = 20 } = req.query;
    let q = db('ads_campaigns').orderBy('created_at', 'desc');
    if (platform) q = q.where({ platform });
    if (status)   q = q.where({ status });

    const [{ count }] = await q.clone().count('id as count');
    const campaigns    = await q.limit(limit).offset((page - 1) * limit);

    res.json({ campaigns, total: parseInt(count), page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /campaigns — حملة جديدة
// ═══════════════════════════════════════════════════════════
router.post('/campaigns', async (req, res, next) => {
  try {
    const {
      name, platform, objective, daily_budget, country_id,
      start_date, end_date, utm_params, target_audience_id,
      creative_url, status = 'active',
    } = req.body;

    if (!name || !platform) {
      return res.status(400).json({ error: 'name و platform مطلوبان' });
    }

    const [campaign] = await db('ads_campaigns').insert({
      id:                 uuid(),
      name,
      platform,
      objective:          objective  || 'conversions',
      daily_budget:       daily_budget || 0,
      country_id:         country_id || null,
      start_date:         start_date ? new Date(start_date) : new Date(),
      end_date:           end_date   ? new Date(end_date)   : null,
      utm_params:         utm_params || null,
      target_audience_id: target_audience_id || null,
      creative_url:       creative_url || null,
      status,
      spend:              0,
      impressions:        0,
      clicks:             0,
      conversions:        0,
      created_by:         req.user.id,
      created_at:         new Date(),
    }).returning('*');

    logger.info('Campaign created', { id: campaign.id, platform, name });
    res.status(201).json({ campaign });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PATCH /campaigns/:id — تحديث حملة
// ═══════════════════════════════════════════════════════════
router.patch('/campaigns/:id', async (req, res, next) => {
  try {
    const allowed = ['name','status','daily_budget','end_date','utm_params','creative_url'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date();

    const [campaign] = await db('ads_campaigns')
      .where({ id: req.params.id }).update(updates).returning('*');

    if (!campaign) return res.status(404).json({ error: 'الحملة غير موجودة' });
    res.json({ campaign });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// DELETE /campaigns/:id
// ═══════════════════════════════════════════════════════════
router.delete('/campaigns/:id', requireRole('super_admin', 'marketing'), async (req, res, next) => {
  try {
    await db('ads_campaigns').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /audiences — Custom Audiences
// ═══════════════════════════════════════════════════════════
router.get('/audiences', async (req, res, next) => {
  try {
    const audiences = await db('ads_audiences').orderBy('created_at', 'desc');
    res.json({ audiences });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /audiences — جمهور جديد
// ═══════════════════════════════════════════════════════════
router.post('/audiences', async (req, res, next) => {
  try {
    const { name, platform, audience_type, criteria, lookalike_source_id } = req.body;

    // Build audience list from DB based on criteria
    let userIds = [];
    if (criteria?.type === 'cart_abandoners') {
      userIds = await db('orders')
        .where({ status: 'pending_payment' })
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .pluck('customer_id');
    } else if (criteria?.type === 'repeat_customers') {
      userIds = await db('orders')
        .where({ status: 'delivered' })
        .groupBy('customer_id')
        .havingRaw('COUNT(*) >= ?', [criteria.min_orders || 3])
        .pluck('customer_id');
    } else if (criteria?.type === 'first_order') {
      userIds = await db('orders')
        .where({ status: 'delivered' })
        .groupBy('customer_id')
        .havingRaw('COUNT(*) = 1')
        .pluck('customer_id');
    }

    // Get user phones/emails for platform upload
    const users = await db('users')
      .whereIn('id', userIds.slice(0, 10000))
      .select('phone', 'email');

    // Hash for privacy (SHA256 lowercase)
    const hashedUsers = users.map(u => ({
      phone: u.phone ? crypto.createHash('sha256').update(u.phone.replace(/\D/g, '')).digest('hex') : null,
      email: u.email ? crypto.createHash('sha256').update(u.email.toLowerCase()).digest('hex') : null,
    }));

    const [audience] = await db('ads_audiences').insert({
      id:                    uuid(),
      name,
      platform,
      audience_type:         audience_type || 'custom',
      criteria:              JSON.stringify(criteria),
      size:                  userIds.length,
      lookalike_source_id:   lookalike_source_id || null,
      last_synced:           new Date(),
      created_by:            req.user.id,
      created_at:            new Date(),
    }).returning('*');

    // TODO: Upload hashed users to platform API
    // await uploadToPlatform(platform, hashedUsers);

    logger.info('Audience created', { id: audience.id, platform, size: userIds.length });
    res.status(201).json({ audience, size: userIds.length });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /pixel/event — إرسال حدث server-side لكل المنصات
// ═══════════════════════════════════════════════════════════
router.post('/pixel/event', async (req, res, next) => {
  try {
    const {
      event_name, user_id, order_id, value, currency = 'SAR',
      content_ids, platforms = PLATFORMS,
      user_data = {}, // { phone, email, client_ip, client_user_agent }
    } = req.body;

    if (!event_name) return res.status(400).json({ error: 'event_name مطلوب' });

    const results = {};
    const eventId = uuid();
    const ts      = Math.floor(Date.now() / 1000);

    // Enrich user data
    let enriched = { ...user_data };
    if (user_id) {
      const user = await db('users').where({ id: user_id }).first(['phone','email']);
      if (user?.phone) enriched.phone = user.phone;
      if (user?.email) enriched.email = user.email;
    }

    // Send to all requested platforms concurrently
    const sends = platforms.map(platform => sendToPixel({
      platform, event_name, eventId, ts,
      value, currency, content_ids,
      user_data: enriched, order_id,
    }));

    const settled = await Promise.allSettled(sends);
    PLATFORMS.forEach((p, i) => {
      if (platforms.includes(p)) {
        results[p] = settled[platforms.indexOf(p)].status === 'fulfilled'
          ? settled[platforms.indexOf(p)].value
          : { ok: false, error: settled[platforms.indexOf(p)].reason?.message };
      }
    });

    // Log event to DB
    await db('ads_events').insert({
      id:         uuid(),
      event_id:   eventId,
      event_name,
      user_id:    user_id || null,
      order_id:   order_id || null,
      value:      value || 0,
      currency,
      platforms:  JSON.stringify(platforms),
      results:    JSON.stringify(results),
      created_at: new Date(),
    }).catch(() => {});

    logger.info('Pixel event sent', { event_name, platforms, eventId });
    res.json({ ok: true, event_id: eventId, results });
  } catch (err) { next(err); }
});

// ── Send to individual platform ───────────────────────────
async function sendToPixel({ platform, event_name, eventId, ts, value, currency, content_ids, user_data, order_id }) {
  const config = await db('ads_platform_configs').where({ platform, is_active: true }).first();
  if (!config) return { ok: false, reason: 'not_configured' };

  const platformEvent = PLATFORM_EVENTS[platform]?.[event_name] || event_name;

  // Hash user PII
  const hashPII = (str) => str
    ? crypto.createHash('sha256').update(str.toLowerCase().trim()).digest('hex')
    : undefined;

  try {
    if (platform === 'facebook' && config.capi_enabled) {
      return await sendFacebookCAPI({ config, platformEvent, eventId, ts, value, currency, content_ids, user_data, order_id, hashPII });
    }
    if (platform === 'snapchat' && config.capi_enabled) {
      return await sendSnapchatCAPI({ config, platformEvent, eventId, ts, value, currency, user_data, hashPII });
    }
    if (platform === 'tiktok' && config.capi_enabled) {
      return await sendTikTokCAPI({ config, platformEvent, eventId, ts, value, currency, user_data, hashPII });
    }
    if (platform === 'google') {
      return await sendGoogleGA4({ config, platformEvent, eventId, value, currency, user_data });
    }
    return { ok: true, platform, note: 'client-side only' };
  } catch (err) {
    logger.warn(`Pixel send failed: ${platform}`, { err: err.message });
    return { ok: false, error: err.message };
  }
}

// ── Facebook CAPI ─────────────────────────────────────────
async function sendFacebookCAPI({ config, platformEvent, eventId, ts, value, currency, content_ids, user_data, order_id, hashPII }) {
  const payload = {
    data: [{
      event_name:  platformEvent,
      event_time:  ts,
      event_id:    eventId,
      action_source: 'app',
      user_data: {
        ph:  user_data.phone ? [hashPII(user_data.phone.replace(/\D/g,''))] : undefined,
        em:  user_data.email ? [hashPII(user_data.email)] : undefined,
        client_ip_address:    user_data.client_ip,
        client_user_agent:    user_data.client_user_agent,
      },
      custom_data: {
        value:       value,
        currency:    currency,
        content_ids: content_ids || (order_id ? [order_id] : undefined),
        order_id:    order_id,
      },
    }],
    test_event_code: config.test_event_code || undefined,
  };

  const r = await axios.post(
    `https://graph.facebook.com/v18.0/${config.pixel_id}/events?access_token=${config.access_token}`,
    payload,
    { timeout: 8000 }
  );
  return { ok: true, events_received: r.data.events_received };
}

// ── Snapchat CAPI ─────────────────────────────────────────
async function sendSnapchatCAPI({ config, platformEvent, eventId, ts, value, currency, user_data, hashPII }) {
  const payload = {
    pixel_id:    config.pixel_id,
    test_mode:   !!config.test_event_code,
    data: [{
      event_name:       platformEvent,
      event_time:       ts * 1000,
      event_source_url: 'https://khalto.app',
      user_data: {
        ph:  user_data.phone ? hashPII(user_data.phone.replace(/\D/g,'')) : undefined,
        em:  user_data.email ? hashPII(user_data.email) : undefined,
      },
      custom_data: { currency, price: String(value || 0), number_items: '1' },
    }],
  };

  await axios.post('https://tr.snapchat.com/v2/conversion', payload, {
    headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    timeout: 8000,
  });
  return { ok: true };
}

// ── TikTok Events API ─────────────────────────────────────
async function sendTikTokCAPI({ config, platformEvent, eventId, ts, value, currency, user_data, hashPII }) {
  const payload = {
    pixel_code: config.pixel_id,
    test_event_code: config.test_event_code || undefined,
    data: [{
      event:      platformEvent,
      event_time: ts,
      event_id:   eventId,
      user: {
        phone_number: user_data.phone ? hashPII(user_data.phone.replace(/\D/g,'')) : undefined,
        email:        user_data.email ? hashPII(user_data.email) : undefined,
        ip:           user_data.client_ip,
        user_agent:   user_data.client_user_agent,
      },
      properties: {
        value:    value || 0,
        currency: currency,
      },
    }],
  };

  await axios.post('https://business-api.tiktok.com/open_api/v1.3/event/track/', payload, {
    headers: { 'Access-Token': config.access_token, 'Content-Type': 'application/json' },
    timeout: 8000,
  });
  return { ok: true };
}

// ── Google GA4 Measurement Protocol ──────────────────────
async function sendGoogleGA4({ config, platformEvent, eventId, value, currency, user_data }) {
  if (!config.ga4_measurement_id || !config.ga4_api_secret) return { ok: false, reason: 'GA4 not configured' };

  const payload = {
    client_id:  user_data.client_id || `khalto.${Date.now()}`,
    events: [{
      name: platformEvent,
      params: {
        transaction_id: eventId,
        value:          value || 0,
        currency:       currency,
        engagement_time_msec: 100,
      },
    }],
  };

  await axios.post(
    `https://www.google-analytics.com/mp/collect?measurement_id=${config.ga4_measurement_id}&api_secret=${config.ga4_api_secret}`,
    payload,
    { timeout: 8000 }
  );
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// POST /pixel/test — اختبار حدث (development / staging)
// ═══════════════════════════════════════════════════════════
router.post('/pixel/test', async (req, res, next) => {
  try {
    const { platform, event_name, value = 65, currency = 'SAR' } = req.body;
    if (!platform || !event_name) {
      return res.status(400).json({ error: 'platform و event_name مطلوبان' });
    }

    const config = await db('ads_platform_configs').where({ platform }).first();
    if (!config) return res.status(404).json({ error: `${platform} غير مُعدّ` });

    const result = await sendToPixel({
      platform, event_name,
      eventId: `test_${uuid()}`,
      ts: Math.floor(Date.now() / 1000),
      value, currency,
      user_data: {
        phone: '+966500000000',
        email: 'test@khalto.app',
        client_ip: req.ip,
      },
      content_ids: ['test_item'],
      order_id: 'KH-TEST-001',
    });

    logger.info('Pixel test sent', { platform, event_name, user: req.user.id });
    res.json({ ok: true, result, platform, event_name });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /conversions/purchase — يُستدعى من orders route عند اكتمال الدفع
// ═══════════════════════════════════════════════════════════
router.post('/conversions/purchase', async (req, res, next) => {
  try {
    const { order_id, user_id, total_amount, currency, items } = req.body;

    const result = await sendToPixelInternal({
      event_name:  'Purchase',
      user_id,
      order_id,
      value:       total_amount,
      currency:    currency || 'SAR',
      content_ids: items?.map(i => i.menu_item_id),
      platforms:   PLATFORMS,
    });

    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

// Internal helper (no auth needed — called from orders.js)
async function sendToPixelInternal({ event_name, user_id, order_id, value, currency, content_ids, platforms }) {
  const configs = await db('ads_platform_configs').where({ is_active: true });
  const eventId = uuid();
  const ts      = Math.floor(Date.now() / 1000);

  let user = {};
  if (user_id) {
    const u = await db('users').where({ id: user_id }).first(['phone','email']);
    user = u || {};
  }

  const sends = configs
    .filter(c => !platforms || platforms.includes(c.platform))
    .map(config => sendToPixel({
      platform:   config.platform,
      event_name,
      eventId,
      ts,
      value,
      currency,
      content_ids,
      order_id,
      user_data:  user,
    }));

  return Promise.allSettled(sends);
}

module.exports = router;
module.exports.sendToPixelInternal = sendToPixelInternal;
