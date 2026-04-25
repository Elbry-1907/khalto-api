/**
 * Khalto — Admin Kitchens Management
 * Full CRUD + lifecycle management for kitchens (admin only)
 *
 * Endpoints:
 *   GET    /admin/kitchens                    — List all with filters
 *   GET    /admin/kitchens/stats              — Aggregate stats
 *   GET    /admin/kitchens/:id                — Full details
 *   GET    /admin/kitchens/:id/orders         — Orders for kitchen
 *   GET    /admin/kitchens/:id/stats          — Per-kitchen stats
 *   GET    /admin/kitchens/:id/status-log     — Status change history
 *   POST   /admin/kitchens                    — Create manually
 *   PUT    /admin/kitchens/:id                — Update (admin override)
 *   POST   /admin/kitchens/:id/approve        — Approve
 *   POST   /admin/kitchens/:id/reject         — Reject with reason
 *   POST   /admin/kitchens/:id/suspend        — Suspend with reason
 *   POST   /admin/kitchens/:id/unsuspend      — Lift suspension
 *   PUT    /admin/kitchens/:id/toggle         — Quick on/off toggle
 *   PUT    /admin/kitchens/:id/commission     — Set commission %
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/uuid-validator');

const ADMIN_ROLES = ['super_admin', 'operations'];

// Helper: log status change
async function logStatusChange(kitchenId, fromStatus, toStatus, userId, reason) {
  try {
    await db('kitchen_status_log').insert({
      id: uuid(),
      kitchen_id: kitchenId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: userId,
      reason: reason || null,
    });
  } catch (err) {
    logger.warn('Failed to log status change', { err: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens — list with filters
// ═══════════════════════════════════════════════════════════
router.get('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status, country_id, city_id, search, page = 1, limit = 20, sort_by = 'created_at', sort_dir = 'desc' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = db('kitchens as k')
      .leftJoin('users as u', 'u.id', 'k.user_id')
      .leftJoin('cities as c', 'c.id', 'k.city_id')
      .leftJoin('countries as co', 'co.id', 'c.country_id')
      .leftJoin('users as ab', 'ab.id', 'k.approved_by')
      .select(
        'k.*',
        'u.id as user_id',
        'u.full_name as owner_name',
        'u.phone as owner_phone',
        'u.email as owner_email',
        'u.blocked_at',
        'u.blocked_reason',
        'c.name_ar as city_name',
        'co.id as country_id',
        'co.name_ar as country_name',
      'co.code as country_code',
        'co.currency_code',
        'co.currency_symbol',
        'co.currency_symbol_en',
        'ab.full_name as approved_by_name'
      );

    if (status) q = q.where('k.status', status);
    if (city_id) q = q.where('k.city_id', city_id);
    if (country_id) q = q.where('co.id', country_id);
    if (search) {
      q = q.where(b => {
        b.whereILike('k.name_ar', `%${search}%`)
         .orWhereILike('k.name_en', `%${search}%`)
         .orWhereILike('u.full_name', `%${search}%`)
         .orWhereILike('u.phone', `%${search}%`);
      });
    }

    // Count total
    const countQuery = q.clone().clearSelect().clearOrder().count('* as total').first();
    const { total } = await countQuery;

    // Apply sort + pagination
    const validSort = ['created_at', 'name_ar', 'rating', 'status'];
    const sortCol = validSort.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_dir === 'asc' ? 'asc' : 'desc';

    const kitchens = await q.orderBy(`k.${sortCol}`, sortDir).limit(Number(limit)).offset(offset);

    res.json({
      kitchens,
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(Number(total) / Number(limit)),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens/stats — aggregate
// ═══════════════════════════════════════════════════════════
router.get('/stats', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const stats = await db('kitchens')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const total = stats.reduce((sum, s) => sum + Number(s.count), 0);
    const byStatus = stats.reduce((acc, s) => {
      acc[s.status] = Number(s.count);
      return acc;
    }, {});

    // Top performers (by rating)
    const topRated = await db('kitchens')
      .where({ status: 'active' })
      .where('rating_count', '>', 0)
      .select('id', 'name_ar', 'name_en', 'rating', 'rating_count')
      .orderBy('rating', 'desc')
      .limit(5);

    // Recent registrations
    const recent = await db('kitchens')
      .leftJoin('users as u', 'u.id', 'kitchens.user_id')
      .select('kitchens.id', 'kitchens.name_ar', 'kitchens.status', 'kitchens.created_at', 'u.full_name as owner_name')
      .orderBy('kitchens.created_at', 'desc')
      .limit(5);

    res.json({
      total,
      by_status: byStatus,
      pending_review: byStatus.pending_review || 0,
      active: byStatus.active || 0,
      paused: byStatus.paused || 0,
      suspended: byStatus.suspended || 0,
      rejected: byStatus.rejected || 0,
      top_rated: topRated,
      recent_registrations: recent,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens/:id — full details
// ═══════════════════════════════════════════════════════════
router.get('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const kitchen = await db('kitchens as k')
      .leftJoin('users as u', 'u.id', 'k.user_id')
      .leftJoin('cities as c', 'c.id', 'k.city_id')
      .leftJoin('countries as co', 'co.id', 'c.country_id')
      .leftJoin('users as ab', 'ab.id', 'k.approved_by')
      .leftJoin('users as rb', 'rb.id', 'k.rejected_by')
      .leftJoin('users as sb', 'sb.id', 'k.suspended_by')
      .where('k.id', req.params.id)
      .select(
        'k.*',
        'u.id as user_id',
        'u.full_name as owner_name',
        'u.phone as owner_phone',
        'u.email as owner_email',
        'u.blocked_at',
        'u.blocked_reason',
        'c.name_ar as city_name',
        'c.id as city_id',
        'co.name_ar as country_name',
        'co.code as country_code',
        'co.currency_code',
        'co.currency_symbol',
        'co.currency_symbol_en',
        'ab.full_name as approved_by_name',
        'rb.full_name as rejected_by_name',
        'sb.full_name as suspended_by_name'
      )
      .first();

    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });

    // Documents
    const documents = await db('kitchen_documents')
      .where({ kitchen_id: kitchen.id })
      .orderBy('uploaded_at', 'desc');

    // Schedule
    const schedules = await db('kitchen_schedules')
      .where({ kitchen_id: kitchen.id })
      .orderBy('day_of_week', 'asc');

    // Counts
    const [orderStats] = await db('orders')
      .where({ kitchen_id: kitchen.id })
      .select(
        db.raw('COUNT(*) as total_orders'),
        db.raw("COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders"),
        db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0) as total_revenue")
      );

    const menuItemsCount = await db('menu_items')
      .where({ kitchen_id: kitchen.id })
      .count('* as count')
      .first();

    res.json({
      kitchen: {
        ...kitchen,
        documents,
        schedules,
        order_stats: orderStats,
        menu_items_count: Number(menuItemsCount.count),
      },
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens/:id/orders — kitchen's orders
// ═══════════════════════════════════════════════════════════
router.get('/:id/orders', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = db('orders as o')
      .leftJoin('users as cu', 'cu.id', 'o.customer_id')
      .leftJoin('users as co', 'co.id', 'o.courier_id')
      .where('o.kitchen_id', req.params.id)
      .select(
        'o.id', 'o.status', 'o.subtotal', 'o.total_amount', 'o.delivery_fee',
        'o.payment_method', 'o.created_at', 'o.delivered_at', 'o.cancelled_at',
        'cu.full_name as customer_name',
        'cu.phone as customer_phone',
        'co.full_name as courier_name'
      );

    if (status) q = q.where('o.status', status);

    const total = await q.clone().clearSelect().clearOrder().count('* as count').first();
    const orders = await q.orderBy('o.created_at', 'desc').limit(Number(limit)).offset(offset);

    res.json({ orders, total: Number(total.count), page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens/:id/stats — per-kitchen stats
// ═══════════════════════════════════════════════════════════
router.get('/:id/stats', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { period = 30 } = req.query; // days
    const since = new Date(Date.now() - Number(period) * 86400000);

    const [overall] = await db('orders')
      .where({ kitchen_id: req.params.id })
      .where('created_at', '>=', since)
      .select(
        db.raw('COUNT(*) as orders_count'),
        db.raw("COUNT(*) FILTER (WHERE status = 'delivered') as delivered"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled"),
        db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0) as gross_revenue"),
        db.raw("COALESCE(SUM(commission_amount) FILTER (WHERE status = 'delivered'), 0) as platform_commission"),
        db.raw("COALESCE(SUM(chef_net_amount) FILTER (WHERE status = 'delivered'), 0) as net_payout"),
        db.raw("COALESCE(AVG(total_amount) FILTER (WHERE status = 'delivered'), 0) as avg_order_value")
      );

    // Daily breakdown
    const daily = await db('orders')
      .where({ kitchen_id: req.params.id })
      .where('created_at', '>=', since)
      .select(
        db.raw("DATE(created_at) as date"),
        db.raw("COUNT(*) as orders"),
        db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0) as revenue")
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');

    res.json({
      period_days: Number(period),
      overall,
      daily,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/kitchens/:id/status-log
// ═══════════════════════════════════════════════════════════
router.get('/:id/status-log', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const logs = await db('kitchen_status_log as l')
      .leftJoin('users as u', 'u.id', 'l.changed_by')
      .where({ 'l.kitchen_id': req.params.id })
      .select('l.*', 'u.full_name as changed_by_name')
      .orderBy('l.created_at', 'desc')
      .limit(50);
    res.json({ logs });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/kitchens — create manually
// ═══════════════════════════════════════════════════════════
router.post('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      user_id, name_ar, name_en, bio_ar, bio_en, city_id,
      country_id,
      lat, lng, contact_phone, contact_email,
      commission_pct, min_order_amount,
    } = req.body;

    if (!user_id || !name_ar || !name_en) {
      return res.status(400).json({ error: 'user_id و name_ar و name_en مطلوبين' });
    }

    // Verify user exists and is a chef
    const user = await db('users').where({ id: user_id }).first();
    if (!user) return res.status(400).json({ error: 'المستخدم غير موجود' });
    if (!['chef', 'super_admin'].includes(user.role)) {
      return res.status(400).json({ error: 'المستخدم ليس طاهي' });
    }

    // If country_id provided, fetch defaults
    let countryDefaults = {};
    if (country_id) {
      const c = await db('countries').where({ id: country_id }).first();
      if (c) {
        countryDefaults = {
          default_commission: c.default_commission_pct,
          default_min_order: c.default_min_order_amount,
        };
        // Update user's country_id if needed
        await db('users').where({ id: user_id }).update({ country_id });
      }
    }

    const [kitchen] = await db('kitchens').insert({
      id: uuid(),
      user_id,
      name_ar, name_en, bio_ar, bio_en, city_id,
      lat, lng, contact_phone, contact_email,
      commission_pct: commission_pct || countryDefaults.default_commission || 15,
      min_order_amount: min_order_amount || countryDefaults.default_min_order || 0,
      status: 'active', // admin-created kitchens go straight to active
      approved_by: req.user.id,
      approved_at: new Date(),
    }).returning('*');

    await logStatusChange(kitchen.id, null, 'active', req.user.id, 'تم الإنشاء من الإدارة');
    logger.info('Kitchen created by admin', { id: kitchen.id, by: req.user.id });

    res.status(201).json({ kitchen });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/kitchens/:id — update (admin override)
// ═══════════════════════════════════════════════════════════
router.put('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const allowed = [
      'name_ar', 'name_en', 'bio_ar', 'bio_en', 'logo_url', 'banner_url',
      'lat', 'lng', 'city_id', 'avg_prep_time', 'min_order_amount',
      'delivery_radius_km', 'commission_pct', 'is_open',
      'contact_phone', 'contact_email',
      'commercial_register', 'tax_number',
      'bank_account_iban', 'bank_account_holder',
      'admin_notes',
    ];

    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد ما يتم تحديثه' });
    }
    updates.updated_at = new Date();

    const existing = await db('kitchens').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'المطبخ غير موجود' });

    const [updated] = await db('kitchens')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    logger.info('Kitchen updated by admin', { id: updated.id, by: req.user.id, fields: Object.keys(updates) });
    res.json({ kitchen: updated, ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/kitchens/:id/approve
// ═══════════════════════════════════════════════════════════
router.post('/:id/approve', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });

    if (kitchen.status === 'active') {
      return res.status(400).json({ error: 'المطبخ نشط بالفعل' });
    }

    await db('kitchens').where({ id: req.params.id }).update({
      status: 'active',
      approved_by: req.user.id,
      approved_at: new Date(),
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, kitchen.status, 'active', req.user.id, 'تمت الموافقة');
    res.json({ ok: true, message: 'تمت الموافقة على المطبخ' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/kitchens/:id/reject
// ═══════════════════════════════════════════════════════════
router.post('/:id/reject', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'السبب مطلوب (5 أحرف على الأقل)' });
    }

    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });

    await db('kitchens').where({ id: req.params.id }).update({
      status: 'rejected',
      rejected_by: req.user.id,
      rejected_at: new Date(),
      rejection_reason: reason,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, kitchen.status, 'rejected', req.user.id, reason);
    res.json({ ok: true, message: 'تم رفض المطبخ' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/kitchens/:id/suspend
// ═══════════════════════════════════════════════════════════
router.post('/:id/suspend', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'السبب مطلوب (5 أحرف على الأقل)' });
    }

    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });

    await db('kitchens').where({ id: req.params.id }).update({
      status: 'suspended',
      suspended_by: req.user.id,
      suspended_at: new Date(),
      suspension_reason: reason,
      is_open: false,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, kitchen.status, 'suspended', req.user.id, reason);
    res.json({ ok: true, message: 'تم تعليق المطبخ' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/kitchens/:id/unsuspend
// ═══════════════════════════════════════════════════════════
router.post('/:id/unsuspend', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });
    if (kitchen.status !== 'suspended') {
      return res.status(400).json({ error: 'المطبخ ليس معلّقاً' });
    }

    await db('kitchens').where({ id: req.params.id }).update({
      status: 'active',
      suspended_by: null,
      suspended_at: null,
      suspension_reason: null,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, 'suspended', 'active', req.user.id, 'رفع التعليق');
    res.json({ ok: true, message: 'تم رفع التعليق' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/kitchens/:id/toggle — quick pause/resume
// ═══════════════════════════════════════════════════════════
router.put('/:id/toggle', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'المطبخ غير موجود' });

    let newStatus;
    if (kitchen.status === 'active') {
      newStatus = 'paused';
    } else if (kitchen.status === 'paused') {
      newStatus = 'active';
    } else {
      return res.status(400).json({ error: `لا يمكن تغيير حالة المطبخ من "${kitchen.status}"` });
    }

    await db('kitchens').where({ id: req.params.id }).update({
      status: newStatus,
      is_open: newStatus === 'active' ? kitchen.is_open : false,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, kitchen.status, newStatus, req.user.id, 'تبديل سريع');
    res.json({ ok: true, status: newStatus });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/kitchens/:id/commission — set custom commission
// ═══════════════════════════════════════════════════════════
router.put('/:id/commission', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { commission_pct } = req.body;
    if (commission_pct == null || commission_pct < 0 || commission_pct > 50) {
      return res.status(400).json({ error: 'النسبة يجب أن تكون بين 0 و 50' });
    }

    const [updated] = await db('kitchens')
      .where({ id: req.params.id })
      .update({ commission_pct, updated_at: new Date() })
      .returning('id', 'commission_pct');

    if (!updated) return res.status(404).json({ error: 'المطبخ غير موجود' });
    res.json({ ok: true, kitchen: updated });
  } catch (err) { next(err); }
});

module.exports = router;
