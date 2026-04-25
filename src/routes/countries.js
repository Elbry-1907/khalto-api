/**
 * Khalto â€” Countries & Dynamic Config System
 * GET  /api/v1/countries                    â€” Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯ÙˆÙ„
 * POST /api/v1/countries                    â€” Ø¥Ø¶Ø§ÙØ© Ø¯ÙˆÙ„Ø© (admin)
 * GET  /api/v1/countries/:id                â€” ØªÙØ§ØµÙŠÙ„ Ø¯ÙˆÙ„Ø©
 * PUT  /api/v1/countries/:id                â€” ØªØ¹Ø¯ÙŠÙ„ Ø¯ÙˆÙ„Ø© (admin)
 * PUT  /api/v1/countries/:id/settings       â€” ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ©
 * PUT  /api/v1/countries/:id/toggle         â€” ØªÙØ¹ÙŠÙ„/Ø¥ÙŠÙ‚Ø§Ù
 * GET  /api/v1/countries/:id/cities         â€” Ù…Ø¯Ù† Ø§Ù„Ø¯ÙˆÙ„Ø©
 * POST /api/v1/countries/:id/cities         â€” Ø¥Ø¶Ø§ÙØ© Ù…Ø¯ÙŠÙ†Ø©
 * GET  /api/v1/config                       â€” Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¯ÙŠÙ†Ø§Ù…ÙŠÙƒÙŠØ© (public)
 */

const router = require('express').Router();
const { validateUUID } = require('../middleware/uuid-validator');
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');

// â”€â”€ Default config per country â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COUNTRY_DEFAULTS = {
  EG: {
    name_ar: 'Ù…ØµØ±', name_en: 'Egypt',
    currency: 'EGP', currency_symbol: 'Ø¬.Ù…',
    phone_code: '+20', default_language: 'ar',
    tax_rate: 14,
    platform_commission_pct: 15,
    delivery_fee_base: 25,
    delivery_fee_per_km: 2,
    min_order_amount: 100,
    max_delivery_distance_km: 15,
    payment_gateway: 'paymob',
    settlement_frequency_days: 7,
    chef_payout_pct: 85,
    courier_delivery_pct: 80,
    surge_multiplier_max: 2.5,
    is_active: true,
  },
  SA: {
    name_ar: 'Ø§Ù„Ù…Ù…Ù„ÙƒØ© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©', name_en: 'Saudi Arabia',
    currency: 'SAR', currency_symbol: 'Ø±.Ø³',
    phone_code: '+966', default_language: 'ar',
    tax_rate: 15,
    platform_commission_pct: 15,
    delivery_fee_base: 8,
    delivery_fee_per_km: 1,
    min_order_amount: 30,
    max_delivery_distance_km: 20,
    payment_gateway: 'tap',
    settlement_frequency_days: 7,
    chef_payout_pct: 85,
    courier_delivery_pct: 80,
    surge_multiplier_max: 2.5,
    is_active: true,
  },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /countries â€” public
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/', async (req, res, next) => {
  try {
    const { active_only } = req.query;
    let q = db('countries').orderBy('name_en');
    if (active_only === 'true') q = q.where({ is_active: true });
    const countries = await q;
    res.json({ countries });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /countries/:id â€” public
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/:id', validateUUID(), async (req, res, next) => {
  try {
    const country = await db('countries').where({ id: req.params.id }).first();
    if (!country) return res.status(404).json({ error: 'Ø§Ù„Ø¯ÙˆÙ„Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });
    const cities = await db('cities').where({ country_id: country.id, is_active: true });
    res.json({ country: { ...country, cities } });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /countries â€” admin only
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const {
      name_ar, name_en, code, currency, currency_symbol,
      phone_code, default_language = 'ar',
      tax_rate = 15,
      platform_commission_pct = 15,
      delivery_fee_base = 10,
      delivery_fee_per_km = 1,
      min_order_amount = 50,
      max_delivery_distance_km = 20,
      payment_gateway = 'tap',
      settlement_frequency_days = 7,
      chef_payout_pct = 85,
      courier_delivery_pct = 80,
      surge_multiplier_max = 2.5,
    } = req.body;

    if (!name_ar || !code || !currency) {
      return res.status(400).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ø¯ÙˆÙ„Ø© ÙˆØ§Ù„Ø±Ù…Ø² ÙˆØ§Ù„Ø¹Ù…Ù„Ø© Ù…Ø·Ù„ÙˆØ¨Ø©' });
    }

    const exists = await db('countries').where({ code: code.toUpperCase() }).first();
    if (exists) return res.status(409).json({ error: 'Ø§Ù„Ø¯ÙˆÙ„Ø© Ù…ÙˆØ¬ÙˆØ¯Ø© Ù…Ø³Ø¨Ù‚Ø§Ù‹' });

    const [country] = await db('countries').insert({
      id: uuid(),
      name_ar, name_en, code: code.toUpperCase(),
      currency, currency_symbol,
      phone_code, default_language,
      tax_rate, platform_commission_pct,
      delivery_fee_base, delivery_fee_per_km,
      min_order_amount, max_delivery_distance_km,
      payment_gateway, settlement_frequency_days,
      chef_payout_pct, courier_delivery_pct,
      surge_multiplier_max,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('*');

    logger.info('Country created', { code, name_ar });
    res.status(201).json({ ok: true, country });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUT /countries/:id â€” update all settings
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.put('/:id', validateUUID(), authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const allowed = [
      'name_ar','name_en','currency','currency_symbol','phone_code',
      'default_language','tax_rate','platform_commission_pct',
      'delivery_fee_base','delivery_fee_per_km','min_order_amount',
      'max_delivery_distance_km','payment_gateway','settlement_frequency_days',
      'chef_payout_pct','courier_delivery_pct','surge_multiplier_max',
    ];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.updated_at = new Date();

    const [country] = await db('countries').where({ id: req.params.id })
      .update(updates).returning('*');
    if (!country) return res.status(404).json({ error: 'Ø§Ù„Ø¯ÙˆÙ„Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });

    logger.info('Country updated', { id: req.params.id });
    res.json({ ok: true, country });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUT /countries/:id/toggle â€” activate/deactivate
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.put('/:id/toggle', validateUUID(), authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const country = await db('countries').where({ id: req.params.id }).first();
    if (!country) return res.status(404).json({ error: 'Ø§Ù„Ø¯ÙˆÙ„Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©' });

    const [updated] = await db('countries').where({ id: req.params.id })
      .update({ is_active: !country.is_active, updated_at: new Date() })
      .returning('*');

    res.json({
      ok: true,
      country: updated,
      message: updated.is_active ? 'ØªÙ… ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø¯ÙˆÙ„Ø©' : 'ØªÙ… Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ø¯ÙˆÙ„Ø©',
    });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /countries/:id/cities
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/:id/cities', validateUUID(), async (req, res, next) => {
  try {
    const cities = await db('cities').where({ country_id: req.params.id }).orderBy('name_ar');
    res.json({ cities });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /countries/:id/cities
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.post('/:id/cities', validateUUID(), authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name_ar, name_en, lat, lng, delivery_fee_override, is_active = true } = req.body;
    if (!name_ar) return res.status(400).json({ error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø¯ÙŠÙ†Ø© Ù…Ø·Ù„ÙˆØ¨' });

    const [city] = await db('cities').insert({
      id: uuid(),
      country_id: req.params.id,
      name_ar, name_en,
      lat, lng,
      delivery_fee_override, // override country default if set
      is_active,
      created_at: new Date(),
    }).returning('*');

    res.status(201).json({ ok: true, city });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /config â€” dynamic config for app (public)
// Used by mobile apps to get country-specific settings
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/config/app', async (req, res, next) => {
  try {
    const { country_code } = req.query;

    let country;
    if (country_code) {
      country = await db('countries').where({ code: country_code.toUpperCase(), is_active: true }).first();
    }
    if (!country) {
      country = await db('countries').where({ is_active: true }).first();
    }
    if (!country) {
      // Return hardcoded defaults if no countries in DB
      return res.json({ config: COUNTRY_DEFAULTS.SA });
    }

    res.json({
      config: {
        country_id:                country.id,
        country_code:              country.code,
        country_name_ar:           country.name_ar,
        country_name_en:           country.name_en,
        currency:                  country.currency,
        currency_symbol:           country.currency_symbol,
        tax_rate:                  country.tax_rate,
        platform_commission_pct:   country.platform_commission_pct,
        delivery_fee_base:         country.delivery_fee_base,
        delivery_fee_per_km:       country.delivery_fee_per_km,
        min_order_amount:          country.min_order_amount,
        max_delivery_distance_km:  country.max_delivery_distance_km,
        payment_gateway:           country.payment_gateway,
        chef_payout_pct:           country.chef_payout_pct,
        courier_delivery_pct:      country.courier_delivery_pct,
        surge_multiplier_max:      country.surge_multiplier_max,
        default_language:          country.default_language,
      },
    });
  } catch (err) { next(err); }
});


// PUT /cities/:cityId — update city
router.put('/cities/:cityId', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name_ar, name_en, lat, lng, delivery_fee_override, is_active } = req.body;
    const updates = {};
    if (name_ar !== undefined) updates.name_ar = name_ar;
    if (name_en !== undefined) updates.name_en = name_en;
    if (lat !== undefined) updates.lat = lat;
    if (lng !== undefined) updates.lng = lng;
    if (delivery_fee_override !== undefined) updates.delivery_fee_override = delivery_fee_override;
    if (is_active !== undefined) updates.is_active = is_active;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد ما يتم تحديثه' });
    }
    const [city] = await db('cities').where({ id: req.params.cityId }).update(updates).returning('*');
    if (!city) return res.status(404).json({ error: 'المدينة غير موجودة' });
    res.json({ ok: true, city });
  } catch (err) { next(err); }
});

// PUT /cities/:cityId/toggle
router.put('/cities/:cityId/toggle', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const city = await db('cities').where({ id: req.params.cityId }).first();
    if (!city) return res.status(404).json({ error: 'المدينة غير موجودة' });
    const [updated] = await db('cities').where({ id: req.params.cityId })
      .update({ is_active: !city.is_active }).returning('*');
    res.json({ ok: true, city: updated, message: updated.is_active ? 'تم تفعيل المدينة' : 'تم إيقاف المدينة' });
  } catch (err) { next(err); }
});

// DELETE /cities/:cityId
router.delete('/cities/:cityId', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const kc = await db('kitchens').where({ city_id: req.params.cityId }).count('* as c').first();
    const cc = await db('couriers').where({ city_id: req.params.cityId }).count('* as c').first();
    if (Number(kc.c) > 0 || Number(cc.c) > 0) {
      return res.status(409).json({ error: 'المدينة مستخدمة. قم بإيقافها بدلاً من الحذف', kitchens: Number(kc.c), couriers: Number(cc.c) });
    }
    const deleted = await db('cities').where({ id: req.params.cityId }).delete();
    if (!deleted) return res.status(404).json({ error: 'المدينة غير موجودة' });
    res.json({ ok: true, message: 'تم حذف المدينة' });
  } catch (err) { next(err); }
});

// GET /cities/all — list ALL cities with country info
router.get('/cities/all', async (req, res, next) => {
  try {
    const { country_id, active_only } = req.query;
    let q = db('cities as ci')
      .leftJoin('countries as co', 'co.id', 'ci.country_id')
      .select('ci.*', 'co.name_ar as country_name', 'co.name_en as country_name_en',
              'co.code as country_code', 'co.currency', 'co.currency_symbol')
      .orderBy('co.name_ar').orderBy('ci.name_ar');
    if (country_id) q = q.where('ci.country_id', country_id);
    if (active_only === 'true') q = q.where('ci.is_active', true);
    const cities = await q;
    res.json({ cities });
  } catch (err) { next(err); }
});

// Seed default countries helper
router.post('/seed/defaults', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const results = [];
    for (const [code, data] of Object.entries(COUNTRY_DEFAULTS)) {
      const exists = await db('countries').where({ code }).first();
      if (!exists) {
        const [c] = await db('countries').insert({ id: uuid(), code, ...data, created_at: new Date(), updated_at: new Date() }).returning('*');
        results.push(c);
      } else {
        results.push({ ...exists, _note: 'already exists' });
      }
    }
    res.json({ ok: true, countries: results });
  } catch (err) { next(err); }
});

module.exports = router;
