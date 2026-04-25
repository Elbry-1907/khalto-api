/**
 * Khalto — Countries & Dynamic Config System
 * GET  /api/v1/countries                    — قائمة الدول
 * POST /api/v1/countries                    — إضافة دولة (admin)
 * GET  /api/v1/countries/:id                — تفاصيل دولة
 * PUT  /api/v1/countries/:id                — تعديل دولة (admin)
 * PUT  /api/v1/countries/:id/settings       — تعديل الإعدادات المالية
 * PUT  /api/v1/countries/:id/toggle         — تفعيل/إيقاف
 * GET  /api/v1/countries/:id/cities         — مدن الدولة
 * POST /api/v1/countries/:id/cities         — إضافة مدينة
 * GET  /api/v1/config                       — الإعدادات الديناميكية (public)
 */

const router = require('express').Router();
const { validateUUID } = require('../middleware/uuid-validator');
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');

// ── Default config per country ─────────────────────────
const COUNTRY_DEFAULTS = {
  EG: {
    name_ar: 'مصر', name_en: 'Egypt',
    currency: 'EGP', currency_symbol: 'ج.م',
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
    name_ar: 'المملكة العربية السعودية', name_en: 'Saudi Arabia',
    currency: 'SAR', currency_symbol: 'ر.س',
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

// ══════════════════════════════════════════════════════
// GET /countries — public
// ══════════════════════════════════════════════════════
router.get('/', async (req, res, next) => {
  try {
    const { active_only } = req.query;
    let q = db('countries').orderBy('name_en');
    if (active_only === 'true') q = q.where({ is_active: true });
    const countries = await q;
    res.json({ countries });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════
// GET /countries/:id — public
// ══════════════════════════════════════════════════════
router.get('/:id', validateUUID(), async (req, res, next) => {
  try {
    const country = await db('countries').where({ id: req.params.id }).first();
    if (!country) return res.status(404).json({ error: 'الدولة غير موجودة' });
    const cities = await db('cities').where({ country_id: country.id, is_active: true });
    res.json({ country: { ...country, cities } });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════
// POST /countries — admin only
// ══════════════════════════════════════════════════════
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
      return res.status(400).json({ error: 'اسم الدولة والرمز والعملة مطلوبة' });
    }

    const exists = await db('countries').where({ code: code.toUpperCase() }).first();
    if (exists) return res.status(409).json({ error: 'الدولة موجودة مسبقاً' });

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

// ══════════════════════════════════════════════════════
// PUT /countries/:id — update all settings
// ══════════════════════════════════════════════════════
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
    if (!country) return res.status(404).json({ error: 'الدولة غير موجودة' });

    logger.info('Country updated', { id: req.params.id });
    res.json({ ok: true, country });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════
// PUT /countries/:id/toggle — activate/deactivate
// ══════════════════════════════════════════════════════
router.put('/:id/toggle', validateUUID(), authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const country = await db('countries').where({ id: req.params.id }).first();
    if (!country) return res.status(404).json({ error: 'الدولة غير موجودة' });

    const [updated] = await db('countries').where({ id: req.params.id })
      .update({ is_active: !country.is_active, updated_at: new Date() })
      .returning('*');

    res.json({
      ok: true,
      country: updated,
      message: updated.is_active ? 'تم تفعيل الدولة' : 'تم إيقاف الدولة',
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════
// GET /countries/:id/cities
// ══════════════════════════════════════════════════════
router.get('/:id/cities', validateUUID(), async (req, res, next) => {
  try {
    const cities = await db('cities').where({ country_id: req.params.id }).orderBy('name_ar');
    res.json({ cities });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════
// POST /countries/:id/cities
// ══════════════════════════════════════════════════════
router.post('/:id/cities', validateUUID(), authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name_ar, name_en, lat, lng, delivery_fee_override, is_active = true } = req.body;
    if (!name_ar) return res.status(400).json({ error: 'اسم المدينة مطلوب' });

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

// ══════════════════════════════════════════════════════
// GET /config — dynamic config for app (public)
// Used by mobile apps to get country-specific settings
// ══════════════════════════════════════════════════════
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
