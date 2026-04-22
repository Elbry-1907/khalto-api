/**
 * Khalto — Food Safety Compliance
 *
 * GET  /api/v1/food-safety/kitchen/:id/status     — حالة الامتثال
 * GET  /api/v1/food-safety/kitchen/:id/checklist  — قائمة الفحص اليومية
 * POST /api/v1/food-safety/kitchen/:id/checklist  — تسليم قائمة الفحص
 * GET  /api/v1/food-safety/kitchen/:id/inventory  — جرد المواد (صلاحيات)
 * POST /api/v1/food-safety/kitchen/:id/inventory  — تحديث الجرد
 * GET  /api/v1/food-safety/kitchen/:id/incidents  — حوادث السلامة
 * POST /api/v1/food-safety/kitchen/:id/incidents  — تسجيل حادثة
 * GET  /api/v1/food-safety/kitchen/:id/certificates — الشهادات
 * POST /api/v1/food-safety/kitchen/:id/certificates — رفع شهادة
 * GET  /api/v1/food-safety/admin/alerts           — تنبيهات السلامة (admin)
 * GET  /api/v1/food-safety/admin/report           — تقرير الامتثال
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const db      = require('../db');
const logger  = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { notify } = require('../services/push.service');

const foodSafetyRouter = express.Router();

// ── Daily checklist items ─────────────────────────────────
const CHECKLIST_ITEMS = [
  { id: 'hands_washed',        ar: 'غسل الأيدي قبل الطهي',             required: true  },
  { id: 'surfaces_clean',      ar: 'تعقيم أسطح العمل',                  required: true  },
  { id: 'fridge_temp',         ar: 'درجة حرارة الثلاجة ≤ 4°C',         required: true  },
  { id: 'freezer_temp',        ar: 'درجة حرارة المجمد ≤ -18°C',        required: true  },
  { id: 'utensils_clean',      ar: 'نظافة الأواني والأدوات',             required: true  },
  { id: 'no_expired',          ar: 'لا توجد مواد منتهية الصلاحية',      required: true  },
  { id: 'hair_covered',        ar: 'تغطية الشعر أثناء الطهي',           required: true  },
  { id: 'gloves_used',         ar: 'استخدام القفازات عند الحاجة',       required: false },
  { id: 'allergens_labeled',   ar: 'تحديد مسببات الحساسية في الأطباق',  required: true  },
  { id: 'cross_contamination', ar: 'الفصل بين اللحوم والخضروات',       required: true  },
  { id: 'waste_disposed',      ar: 'التخلص من النفايات بشكل صحيح',     required: false },
  { id: 'fire_extinguisher',   ar: 'طفاية الحريق في متناول اليد',       required: false },
];

// ── GET /kitchen/:id/status ───────────────────────────────
foodSafetyRouter.get('/kitchen/:id/status', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const today  = new Date(); today.setHours(0,0,0,0);

    // Today's checklist
    const todayChecklist = await db('food_safety_checklists')
      .where({ kitchen_id: id }).where('submitted_at', '>=', today).first();

    // Expiring docs (within 30 days)
    const expiringDocs = await db('kitchen_documents')
      .where({ kitchen_id: id })
      .where('expires_at', '<=', new Date(Date.now() + 30 * 86400000))
      .where('expires_at', '>', new Date())
      .select('doc_type', 'expires_at');

    // Expired docs
    const expiredDocs = await db('kitchen_documents')
      .where({ kitchen_id: id })
      .where('expires_at', '<', new Date())
      .select('doc_type', 'expires_at');

    // Open incidents
    const openIncidents = await db('food_safety_incidents')
      .where({ kitchen_id: id, status: 'open' }).count('id as c').first();

    // Inventory alerts (expiring ingredients)
    const inventoryAlerts = await db('food_inventory')
      .where({ kitchen_id: id })
      .where('expiry_date', '<=', new Date(Date.now() + 3 * 86400000))
      .where('expiry_date', '>', new Date())
      .select('item_name', 'expiry_date', 'quantity');

    const expiredInventory = await db('food_inventory')
      .where({ kitchen_id: id })
      .where('expiry_date', '<', new Date())
      .count('id as c').first();

    // Compliance score (0-100)
    let score = 100;
    if (!todayChecklist)            score -= 20;
    if (expiredDocs.length > 0)     score -= 30;
    if (openIncidents?.c > 0)       score -= parseInt(openIncidents.c) * 10;
    if (expiredInventory?.c > 0)    score -= 15;
    if (expiringDocs.length > 0)    score -= 5;
    score = Math.max(0, score);

    const status = score >= 80 ? 'compliant' : score >= 60 ? 'warning' : 'non_compliant';

    res.json({
      status,
      score,
      today_checklist:    !!todayChecklist,
      expiring_docs:      expiringDocs,
      expired_docs:       expiredDocs,
      open_incidents:     parseInt(openIncidents?.c || 0),
      inventory_alerts:   inventoryAlerts,
      expired_inventory:  parseInt(expiredInventory?.c || 0),
    });
  } catch (err) { next(err); }
});

// ── GET /kitchen/:id/checklist ────────────────────────────
foodSafetyRouter.get('/kitchen/:id/checklist', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const today  = new Date(); today.setHours(0,0,0,0);

    const submitted = await db('food_safety_checklists')
      .where({ kitchen_id: id }).where('submitted_at', '>=', today)
      .orderBy('submitted_at','desc').first();

    res.json({
      items:     CHECKLIST_ITEMS,
      submitted: submitted || null,
      date:      today.toISOString().split('T')[0],
    });
  } catch (err) { next(err); }
});

// ── POST /kitchen/:id/checklist ───────────────────────────
foodSafetyRouter.post('/kitchen/:id/checklist', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items, notes, fridge_temp, freezer_temp } = req.body;
    // items: { hands_washed: true, surfaces_clean: true, ... }

    if (!items) return res.status(400).json({ error: 'items مطلوب' });

    const requiredPassed = CHECKLIST_ITEMS
      .filter(i => i.required)
      .every(i => items[i.id] === true);

    const score = CHECKLIST_ITEMS.filter(i => items[i.id] === true).length;
    const total = CHECKLIST_ITEMS.length;

    const [checklist] = await db('food_safety_checklists').insert({
      id:           uuid(),
      kitchen_id:   id,
      submitted_by: req.user.id,
      items:        JSON.stringify(items),
      score:        Math.round((score / total) * 100),
      all_required_passed: requiredPassed,
      fridge_temp:  fridge_temp || null,
      freezer_temp: freezer_temp || null,
      notes:        notes || null,
      submitted_at: new Date(),
    }).returning('*');

    // Alert if required items not passed
    if (!requiredPassed) {
      const failed = CHECKLIST_ITEMS
        .filter(i => i.required && !items[i.id])
        .map(i => i.ar);

      await db('food_safety_incidents').insert({
        id:          uuid(),
        kitchen_id:  id,
        type:        'checklist_failure',
        description: `فشل في بنود مطلوبة: ${failed.join(', ')}`,
        severity:    'medium',
        status:      'open',
        created_at:  new Date(),
      });

      // Notify operations team
      const ops = await db('users').where({ role: 'operations' }).pluck('id');
      for (const opId of ops.slice(0,3)) {
        await notify.sendToUser?.(opId, {
          titleAr: '⚠️ تنبيه سلامة غذائية',
          titleEn: '⚠️ Food Safety Alert',
          bodyAr:  `مطبخ لم يجتز بنود السلامة المطلوبة`,
          bodyEn:  `Kitchen failed required safety checklist items`,
          data:    { type: 'food_safety_alert', kitchen_id: id },
          lang:    'ar',
        }).catch(() => {});
      }
    }

    res.status(201).json({ checklist, required_passed: requiredPassed });
  } catch (err) { next(err); }
});

// ── GET /kitchen/:id/inventory ────────────────────────────
foodSafetyRouter.get('/kitchen/:id/inventory', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const items = await db('food_inventory')
      .where({ kitchen_id: id })
      .orderBy('expiry_date', 'asc');

    const grouped = {
      expired:  items.filter(i => new Date(i.expiry_date) < new Date()),
      expiring: items.filter(i => {
        const d = new Date(i.expiry_date);
        return d >= new Date() && d <= new Date(Date.now() + 3 * 86400000);
      }),
      ok: items.filter(i => new Date(i.expiry_date) > new Date(Date.now() + 3 * 86400000)),
    };

    res.json({ items, grouped });
  } catch (err) { next(err); }
});

// ── POST /kitchen/:id/inventory ───────────────────────────
foodSafetyRouter.post('/kitchen/:id/inventory', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // [{ item_name, quantity, unit, expiry_date, batch_no }]

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items مطلوب' });
    }

    const inserted = await db('food_inventory').insert(
      items.map(item => ({
        id:          uuid(),
        kitchen_id:  id,
        item_name:   item.item_name,
        quantity:    item.quantity,
        unit:        item.unit || 'kg',
        expiry_date: item.expiry_date ? new Date(item.expiry_date) : null,
        batch_no:    item.batch_no || null,
        added_by:    req.user.id,
        created_at:  new Date(),
      }))
    ).returning('*');

    // Check for expired items
    const expired = inserted.filter(i => i.expiry_date && new Date(i.expiry_date) < new Date());
    if (expired.length > 0) {
      logger.warn('Expired inventory added', { kitchen_id: id, items: expired.map(i => i.item_name) });
    }

    res.status(201).json({ inserted: inserted.length, expired_count: expired.length });
  } catch (err) { next(err); }
});

// ── GET /kitchen/:id/incidents ────────────────────────────
foodSafetyRouter.get('/kitchen/:id/incidents', authenticate, async (req, res, next) => {
  try {
    const incidents = await db('food_safety_incidents')
      .where({ kitchen_id: req.params.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ incidents });
  } catch (err) { next(err); }
});

// ── POST /kitchen/:id/incidents ───────────────────────────
foodSafetyRouter.post('/kitchen/:id/incidents', authenticate, async (req, res, next) => {
  try {
    const { type, description, severity = 'low' } = req.body;
    if (!type || !description) return res.status(400).json({ error: 'type و description مطلوبان' });

    const [incident] = await db('food_safety_incidents').insert({
      id:          uuid(),
      kitchen_id:  req.params.id,
      type,        description, severity,
      status:      'open',
      reported_by: req.user.id,
      created_at:  new Date(),
    }).returning('*');

    // High severity: notify admin immediately
    if (severity === 'high' || severity === 'critical') {
      const admins = await db('users').where({ role: 'super_admin' }).pluck('id');
      for (const adminId of admins) {
        await notify.sendToUser?.(adminId, {
          titleAr: `🚨 حادثة سلامة غذائية ${severity === 'critical' ? 'حرجة' : 'عالية'}`,
          titleEn: `🚨 Food Safety Incident - ${severity}`,
          bodyAr:  description.slice(0, 100),
          bodyEn:  description.slice(0, 100),
          data:    { type: 'food_safety_incident', kitchen_id: req.params.id },
          lang:    'ar',
        }).catch(() => {});
      }
    }

    res.status(201).json({ incident });
  } catch (err) { next(err); }
});

// ── GET /kitchen/:id/certificates ────────────────────────
foodSafetyRouter.get('/kitchen/:id/certificates', authenticate, async (req, res, next) => {
  try {
    const certs = await db('kitchen_documents')
      .where({ kitchen_id: req.params.id })
      .whereIn('doc_type', ['health_cert','food_handler_cert','municipality_license'])
      .orderBy('expires_at', 'asc');
    res.json({ certificates: certs });
  } catch (err) { next(err); }
});

// ── Admin: GET /admin/alerts ──────────────────────────────
foodSafetyRouter.get('/admin/alerts', authenticate,
  requireRole('super_admin','operations'),
  async (req, res, next) => {
  try {
    // Kitchens with open incidents
    const incidents = await db('food_safety_incidents as i')
      .join('kitchens as k', 'k.id', 'i.kitchen_id')
      .where({ 'i.status': 'open' })
      .orderBy('i.severity', 'desc').orderBy('i.created_at', 'desc')
      .select('i.*', 'k.name_ar as kitchen_name')
      .limit(50);

    // Expired health certs
    const expiredCerts = await db('kitchen_documents as d')
      .join('kitchens as k', 'k.id', 'd.kitchen_id')
      .where('d.expires_at', '<', new Date())
      .whereIn('d.doc_type', ['health_cert','food_handler_cert'])
      .select('d.*', 'k.name_ar as kitchen_name', 'k.id as kitchen_id');

    // Kitchens that haven't submitted checklist today
    const today = new Date(); today.setHours(0,0,0,0);
    const activeKitchens = await db('kitchens').where({ status: 'active' }).pluck('id');
    const submittedToday = await db('food_safety_checklists')
      .where('submitted_at', '>=', today)
      .pluck('kitchen_id');
    const missingChecklist = activeKitchens.filter(id => !submittedToday.includes(id));

    res.json({
      open_incidents:     incidents,
      expired_certs:      expiredCerts,
      missing_checklist:  missingChecklist.length,
      summary: {
        critical: incidents.filter(i => i.severity === 'critical').length,
        high:     incidents.filter(i => i.severity === 'high').length,
        medium:   incidents.filter(i => i.severity === 'medium').length,
      },
    });
  } catch (err) { next(err); }
});

// ── Admin: GET /admin/report ──────────────────────────────
foodSafetyRouter.get('/admin/report', authenticate,
  requireRole('super_admin','operations'),
  async (req, res, next) => {
  try {
    const { period = '30d', country_id } = req.query;
    const from = new Date(Date.now() - parseInt(period) * 86400000);

    const [checklistStats] = await db('food_safety_checklists')
      .where('submitted_at', '>=', from)
      .select(
        db.raw('COUNT(*) as total_submitted'),
        db.raw('AVG(score) as avg_score'),
        db.raw("COUNT(*) FILTER (WHERE all_required_passed = true) as passed"),
      );

    const incidentStats = await db('food_safety_incidents')
      .where('created_at', '>=', from)
      .select('severity', db.raw('COUNT(*) as count'))
      .groupBy('severity');

    res.json({
      period,
      checklist: checklistStats,
      incidents: incidentStats,
    });
  } catch (err) { next(err); }
});

module.exports = { foodSafetyRouter };
