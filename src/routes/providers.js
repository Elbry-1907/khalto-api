/**
 * Khalto — Service Providers Routes
 *
 * GET    /api/v1/providers                          — List all (grouped by service_type)
 * GET    /api/v1/providers/:id                      — Single provider with masked config
 * PUT    /api/v1/providers/:id                      — Update credentials + activate
 * POST   /api/v1/providers/:id/test                 — Real test send/connection
 * POST   /api/v1/providers/:id/activate             — Mark active (toggle off others if pay)
 * POST   /api/v1/providers/:id/deactivate           — Mark inactive
 *
 * GET    /api/v1/providers/country-mapping          — Per-country mapping
 * PUT    /api/v1/providers/country-mapping          — Set country → provider
 * GET    /api/v1/providers/test-logs/:provider_id   — Recent tests
 *
 * GET    /api/v1/providers/webhooks                 — Webhook URLs for payment gateways
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt, decrypt, maskConfig } = require('../services/credentials.service');
const { runTest } = require('../services/provider-tester.service');
const { clearCache } = require('../services/provider-resolver.service');

const ADMIN_ROLES = ['super_admin', 'operations'];

// ═══════════════════════════════════════════════════════════
// GET /providers — list all, grouped by service_type
// ═══════════════════════════════════════════════════════════

router.get('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const providers = await db('service_providers')
      .select('id', 'service_type', 'provider_key', 'display_name_ar', 'display_name_en',
              'description_ar', 'is_configured', 'is_active', 'status',
              'last_tested_at', 'last_test_result', 'config_encrypted', 'updated_at')
      .orderBy('service_type')
      .orderBy('provider_key');

    // Decrypt + mask config for each
    const grouped = { sms: [], whatsapp: [], email: [], payment: [] };
    for (const p of providers) {
      const decrypted = decrypt(p.config_encrypted);
      const masked = decrypted ? maskConfig(decrypted) : {};
      const item = { ...p, config: masked };
      delete item.config_encrypted;
      if (grouped[p.service_type]) grouped[p.service_type].push(item);
    }

    res.json({ providers: grouped });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /providers/webhooks — Public webhook URLs
// ═══════════════════════════════════════════════════════════

router.get('/webhooks', authenticate, requireRole(...ADMIN_ROLES), async (req, res) => {
  const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
  res.json({
    webhooks: {
      tap:    `${baseUrl}/api/v1/payments/webhook/tap`,
      paymob: `${baseUrl}/api/v1/payments/webhook/paymob`,
    },
  });
});

// ═══════════════════════════════════════════════════════════
// GET /providers/country-mapping — Per-country mapping
// ═══════════════════════════════════════════════════════════

router.get('/country-mapping', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const mappings = await db('country_provider_mapping as cpm')
      .leftJoin('countries as c', 'c.id', 'cpm.country_id')
      .leftJoin('service_providers as p', 'p.id', 'cpm.provider_id')
      .select(
        'cpm.id', 'cpm.country_id', 'cpm.service_type', 'cpm.provider_id',
        'cpm.cash_on_delivery',
        'c.code as country_code', 'c.name_ar as country_name',
        'p.provider_key', 'p.display_name_en as provider_name'
      )
      .orderBy('c.code')
      .orderBy('cpm.service_type');

    res.json({ mappings });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /providers/country-mapping — Set country → provider
// ═══════════════════════════════════════════════════════════

router.put('/country-mapping', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { country_id, service_type, provider_id, cash_on_delivery } = req.body;
    if (!country_id || !service_type) {
      return res.status(400).json({ error: 'country_id و service_type مطلوبين' });
    }

    // Upsert pattern
    const existing = await db('country_provider_mapping')
      .where({ country_id, service_type }).first();

    let mapping;
    if (existing) {
      [mapping] = await db('country_provider_mapping')
        .where({ id: existing.id })
        .update({
          provider_id: provider_id || null,
          cash_on_delivery: cash_on_delivery ?? existing.cash_on_delivery,
          updated_at: new Date(),
        })
        .returning('*');
    } else {
      [mapping] = await db('country_provider_mapping')
        .insert({
          id: uuid(), country_id, service_type,
          provider_id: provider_id || null,
          cash_on_delivery: !!cash_on_delivery,
        })
        .returning('*');
    }

    clearCache();
    res.json({ ok: true, mapping });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /providers/:id — single provider details
// ═══════════════════════════════════════════════════════════

router.get('/:id', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const provider = await db('service_providers').where({ id: req.params.id }).first();
    if (!provider) return res.status(404).json({ error: 'المزود غير موجود' });

    const decrypted = decrypt(provider.config_encrypted);
    const masked = decrypted ? maskConfig(decrypted) : {};
    delete provider.config_encrypted;

    res.json({ provider: { ...provider, config: masked } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /providers/:id — update credentials
// ═══════════════════════════════════════════════════════════

router.put('/:id', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object مطلوب' });
    }

    const existing = await db('service_providers').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'المزود غير موجود' });

    // Merge with existing config (in case some fields are masked/not sent)
    const existingConfig = decrypt(existing.config_encrypted) || {};
    const mergedConfig = { ...existingConfig };

    // Only update fields that are not masked (don't contain ••••)
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string' && v.includes('••••')) continue;
      mergedConfig[k] = v;
    }

    const hasMeaningfulValues = Object.values(mergedConfig)
      .some(v => v && String(v).length > 3);

    const encrypted = encrypt(mergedConfig);

    const [updated] = await db('service_providers')
      .where({ id: req.params.id })
      .update({
        config_encrypted: encrypted,
        is_configured: hasMeaningfulValues,
        status: hasMeaningfulValues ? 'configured' : 'not_configured',
        updated_by: req.user.id,
        updated_at: new Date(),
      })
      .returning('id', 'service_type', 'provider_key', 'is_configured', 'is_active', 'status');

    clearCache();
    logger.info('Provider config updated', { id: req.params.id, by: req.user.id });
    res.json({ ok: true, provider: updated });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /providers/:id/test — actual test send/connection
// ═══════════════════════════════════════════════════════════

router.post('/:id/test', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { recipient, message, subject, body } = req.body;
    const provider = await db('service_providers').where({ id: req.params.id }).first();
    if (!provider) return res.status(404).json({ error: 'المزود غير موجود' });

    const config = decrypt(provider.config_encrypted);
    if (!config && provider.service_type !== 'payment') {
      return res.status(400).json({ ok: false, error: 'يجب حفظ الإعدادات أولاً' });
    }

    const result = await runTest({
      serviceType: provider.service_type,
      providerKey: provider.provider_key,
      config: config || {},
      recipient, message, subject, body,
    });

    // Log the test
    await db('provider_test_logs').insert({
      id: uuid(),
      provider_id: provider.id,
      test_type: provider.service_type === 'payment' ? 'connection' : 'send',
      recipient: recipient || null,
      success: result.success,
      response_message: result.message,
      tested_by: req.user.id,
    });

    // Update provider status
    await db('service_providers').where({ id: provider.id }).update({
      status: result.success ? 'tested_ok' : 'tested_failed',
      last_tested_at: new Date(),
      last_test_result: result.message,
    });

    res.json({ ok: result.success, ...result });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /providers/:id/activate — mark globally active
// ═══════════════════════════════════════════════════════════

router.post('/:id/activate', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const provider = await db('service_providers').where({ id: req.params.id }).first();
    if (!provider) return res.status(404).json({ error: 'المزود غير موجود' });

    if (!provider.is_configured && provider.provider_key !== 'cash') {
      return res.status(400).json({ error: 'يجب حفظ الإعدادات قبل التفعيل' });
    }

    // For SMS/WhatsApp/Email: only one provider active globally per service
    // For Payment: multiple can be active (per-country mapping decides which is used)
    if (['sms', 'whatsapp', 'email'].includes(provider.service_type)) {
      await db('service_providers')
        .where({ service_type: provider.service_type })
        .whereNot({ id: provider.id })
        .update({ is_active: false });
    }

    await db('service_providers').where({ id: provider.id }).update({
      is_active: true,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    clearCache();
    res.json({ ok: true, message: `تم تفعيل ${provider.display_name_en}` });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /providers/:id/deactivate
// ═══════════════════════════════════════════════════════════

router.post('/:id/deactivate', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await db('service_providers').where({ id: req.params.id }).update({
      is_active: false,
      updated_by: req.user.id,
      updated_at: new Date(),
    });
    clearCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /providers/test-logs/:provider_id
// ═══════════════════════════════════════════════════════════

router.get('/test-logs/:provider_id', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const logs = await db('provider_test_logs as l')
      .leftJoin('users as u', 'u.id', 'l.tested_by')
      .where({ 'l.provider_id': req.params.provider_id })
      .select('l.*', 'u.full_name as tested_by_name')
      .orderBy('l.created_at', 'desc')
      .limit(20);
    res.json({ logs });
  } catch (err) { next(err); }
});

module.exports = router;
