/**
 * Khalto — Branding & Platform Config
 *
 * GET  /api/v1/branding              — إعدادات البراندينج (public)
 * PUT  /api/v1/branding              — تحديث البراندينج (admin)
 * POST /api/v1/branding/logo         — رفع لوغو المنصة
 * POST /api/v1/branding/favicon      — رفع favicon
 * GET  /api/v1/branding/history      — سجل التغييرات
 * POST /api/v1/branding/reset        — إعادة للقيم الافتراضية
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadSingle, uploadToS3 } = require('../services/upload.service');

// ── Default branding ──────────────────────────────────────
const DEFAULTS = {
  platform_name:       'Khalto',
  platform_name_ar:    'خالتو',
  platform_tagline:    'Home-Cooked Food Delivery',
  platform_tagline_ar: 'توصيل الأكل البيتي',
  logo_url:            null,
  logo_dark_url:       null,  // logo على خلفيات داكنة
  favicon_url:         null,
  primary_color:       '#E8603C',
  secondary_color:     '#1a1a2e',
  accent_color:        '#F5A623',
  app_store_url:       null,
  play_store_url:      null,
  website_url:         null,
  support_email:       'support@khalto.app',
  support_phone:       null,
  country_id:          null,  // null = global
};

// ═══════════════════════════════════════════════════════════
// GET /branding — Public endpoint (no auth needed)
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res, next) => {
  try {
    const { country_id } = req.query;

    // Try country-specific first, then global
    let branding = null;
    if (country_id) {
      branding = await db('platform_branding').where({ country_id }).first();
    }
    if (!branding) {
      branding = await db('platform_branding').whereNull('country_id').first();
    }

    res.json({ branding: branding || DEFAULTS });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /branding — Update (admin only)
// ═══════════════════════════════════════════════════════════
router.put('/', authenticate, requireRole('super_admin', 'marketing'), async (req, res, next) => {
  try {
    const {
      platform_name, platform_name_ar,
      platform_tagline, platform_tagline_ar,
      primary_color, secondary_color, accent_color,
      app_store_url, play_store_url, website_url,
      support_email, support_phone,
      country_id,
    } = req.body;

    const allowed = [
      'platform_name', 'platform_name_ar',
      'platform_tagline', 'platform_tagline_ar',
      'primary_color', 'secondary_color', 'accent_color',
      'app_store_url', 'play_store_url', 'website_url',
      'support_email', 'support_phone',
    ];

    const data = {};
    allowed.forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    data.updated_at = new Date();
    data.updated_by = req.user.id;

    // Save old values for audit
    const existing = await db('platform_branding')
      .where({ country_id: country_id || null }).first();

    let branding;
    if (existing) {
      [branding] = await db('platform_branding')
        .where({ country_id: country_id || null })
        .update(data).returning('*');
    } else {
      [branding] = await db('platform_branding').insert({
        id: uuid(),
        ...DEFAULTS,
        ...data,
        country_id: country_id || null,
        created_at: new Date(),
      }).returning('*');
    }

    // Audit log
    await db('branding_history').insert({
      id:         uuid(),
      old_data:   JSON.stringify(existing || {}),
      new_data:   JSON.stringify(data),
      changed_by: req.user.id,
      created_at: new Date(),
    }).catch(() => {});

    logger.info('Branding updated', {
      by: req.user.id,
      name: data.platform_name,
      country: country_id || 'global',
    });

    res.json({ ok: true, branding });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /branding/logo — Upload logo
// ═══════════════════════════════════════════════════════════
router.post('/logo', authenticate, requireRole('super_admin', 'marketing'),
  uploadSingle('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'الصورة مطلوبة' });

    const { country_id, type = 'primary' } = req.body;
    // type: primary | dark (for dark backgrounds)

    const s3Key = `branding/logo_${type}_${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const url   = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

    const field = type === 'dark' ? 'logo_dark_url' : 'logo_url';

    const existing = await db('platform_branding')
      .where({ country_id: country_id || null }).first();

    if (existing) {
      await db('platform_branding')
        .where({ country_id: country_id || null })
        .update({ [field]: url, updated_at: new Date(), updated_by: req.user.id });
    } else {
      await db('platform_branding').insert({
        id: uuid(), ...DEFAULTS,
        [field]: url,
        country_id: country_id || null,
        updated_by: req.user.id,
        created_at: new Date(),
      });
    }

    logger.info('Logo uploaded', { type, url, by: req.user.id });
    res.json({ ok: true, [field]: url });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /branding/favicon
// ═══════════════════════════════════════════════════════════
router.post('/favicon', authenticate, requireRole('super_admin', 'marketing'),
  uploadSingle('favicon'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'الصورة مطلوبة' });

    const s3Key = `branding/favicon_${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const url   = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

    await db('platform_branding')
      .whereNull('country_id')
      .update({ favicon_url: url, updated_at: new Date(), updated_by: req.user.id });

    res.json({ ok: true, favicon_url: url });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /branding/history
// ═══════════════════════════════════════════════════════════
router.get('/history', authenticate, requireRole('super_admin', 'marketing'), async (req, res, next) => {
  try {
    const history = await db('branding_history as h')
      .leftJoin('users as u', 'u.id', 'h.changed_by')
      .select('h.*', 'u.full_name as changed_by_name')
      .orderBy('h.created_at', 'desc')
      .limit(50);
    res.json({ history });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /branding/reset — Reset to defaults
// ═══════════════════════════════════════════════════════════
router.post('/reset', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { country_id } = req.body;
    await db('platform_branding')
      .where({ country_id: country_id || null })
      .update({
        ...DEFAULTS,
        updated_at: new Date(),
        updated_by: req.user.id,
      });
    res.json({ ok: true, message: 'تم إعادة الضبط للإعدادات الافتراضية' });
  } catch (err) { next(err); }
});

module.exports = router;
