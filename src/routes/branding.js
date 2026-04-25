/**
 * Khalto â€” Branding & Platform Config
 *
 * GET  /api/v1/branding              â€” Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ÙŠÙ†Ø¬ (public)
 * PUT  /api/v1/branding              â€” ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ÙŠÙ†Ø¬ (admin)
 * POST /api/v1/branding/logo         â€” Ø±ÙØ¹ Ù„ÙˆØºÙˆ Ø§Ù„Ù…Ù†ØµØ©
 * POST /api/v1/branding/favicon      â€” Ø±ÙØ¹ favicon
 * GET  /api/v1/branding/history      â€” Ø³Ø¬Ù„ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª
 * POST /api/v1/branding/reset        â€” Ø¥Ø¹Ø§Ø¯Ø© Ù„Ù„Ù‚ÙŠÙ… Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadImage, processAndUpload } = require('../services/upload.service');

// â”€â”€ Branding image handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleBrandingImage = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const { url } = await processAndUpload(
      req.file.buffer, req.file.mimetype,
      'branding',
      { width: 800, quality: 85 }
    );
    req.uploadedUrl = url;
    next();
  } catch (err) { next(err); }
};

// â”€â”€ Default branding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEFAULTS = {
  platform_name:       'Khalto',
  platform_name_ar:    'Ø®Ø§Ù„ØªÙˆ',
  platform_tagline:    'Home-Cooked Food Delivery',
  platform_tagline_ar: 'ØªÙˆØµÙŠÙ„ Ø§Ù„Ø£ÙƒÙ„ Ø§Ù„Ø¨ÙŠØªÙŠ',
  logo_url:            null,
  logo_dark_url:       null,  // logo Ø¹Ù„Ù‰ Ø®Ù„ÙÙŠØ§Øª Ø¯Ø§ÙƒÙ†Ø©
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /branding â€” Public endpoint (no auth needed)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUT /branding â€” Update (admin only)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    
      'logo_url', 'logo_dark_url', 'favicon_url',
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /branding/logo â€” Upload logo
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.post('/logo', authenticate, requireRole('super_admin', 'marketing'),
  uploadImage, handleBrandingImage, async (req, res, next) => {
  try {
    if (!req.uploadedUrl) return res.status(400).json({ error: 'Ø§Ù„ØµÙˆØ±Ø© Ù…Ø·Ù„ÙˆØ¨Ø©' });

    const { country_id, type = 'primary' } = req.body;
    // type: primary | dark (for dark backgrounds)

    const field = type === 'dark' ? 'logo_dark_url' : 'logo_url';
    const url = req.uploadedUrl;

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /branding/favicon
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.post('/favicon', authenticate, requireRole('super_admin', 'marketing'),
  uploadImage, handleBrandingImage, async (req, res, next) => {
  try {
    if (!req.uploadedUrl) return res.status(400).json({ error: 'Ø§Ù„ØµÙˆØ±Ø© Ù…Ø·Ù„ÙˆØ¨Ø©' });

    const url = req.uploadedUrl;

    await db('platform_branding')
      .whereNull('country_id')
      .update({ favicon_url: url, updated_at: new Date(), updated_by: req.user.id });

    res.json({ ok: true, favicon_url: url });
  } catch (err) { next(err); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /branding/history
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /branding/reset â€” Reset to defaults
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    res.json({ ok: true, message: 'ØªÙ… Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¶Ø¨Ø· Ù„Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©' });
  } catch (err) { next(err); }
});

module.exports = router;
