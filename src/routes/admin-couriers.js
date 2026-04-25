/**
 * Khalto — Admin Couriers Management
 * Full CRUD + lifecycle management for couriers (admin only)
 *
 * Endpoints:
 *   GET    /admin/couriers                       — List with filters
 *   GET    /admin/couriers/stats                 — Aggregate stats
 *   GET    /admin/couriers/online                — Currently online
 *   GET    /admin/couriers/:id                   — Full details
 *   GET    /admin/couriers/:id/deliveries        — Delivery history
 *   GET    /admin/couriers/:id/earnings          — Earnings breakdown
 *   GET    /admin/couriers/:id/status-log        — Status change history
 *   POST   /admin/couriers                       — Create manually
 *   PUT    /admin/couriers/:id                   — Update (admin override)
 *   POST   /admin/couriers/:id/approve           — Approve
 *   POST   /admin/couriers/:id/reject            — Reject with reason
 *   POST   /admin/couriers/:id/suspend           — Suspend with reason
 *   POST   /admin/couriers/:id/unsuspend         — Lift suspension
 *   PUT    /admin/couriers/:id/percentage        — Set delivery %
 *   PUT    /admin/couriers/:id/availability      — Force online/offline
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/uuid-validator');

const ADMIN_ROLES = ['super_admin', 'operations'];

async function logStatusChange(courierId, fromStatus, toStatus, userId, reason) {
  try {
    await db('courier_status_log').insert({
      id: uuid(),
      courier_id: courierId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: userId,
      reason: reason || null,
    });
  } catch (err) {
    logger.warn('Failed to log courier status change', { err: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers — list with filters
// ═══════════════════════════════════════════════════════════
router.get('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      status, availability, country_id, city_id, search,
      page = 1, limit = 20, sort_by = 'created_at', sort_dir = 'desc',
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = db('couriers as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .leftJoin('cities as ci', 'ci.id', 'c.city_id')
      .leftJoin('countries as co', 'co.id', 'ci.country_id')
      .leftJoin('users as ab', 'ab.id', 'c.approved_by')
      .select(
        'c.*',
        'u.full_name as user_name',
        'u.phone as user_phone',
        'u.email as user_email',
        'u.blocked_at',
        'u.blocked_reason',
        'ci.name_ar as city_name',
        'co.id as country_id',
        'co.name_ar as country_name',
        'co.code as country_code',
        'ab.full_name as approved_by_name'
      );

    if (status) q = q.where('c.status', status);
    if (availability) q = q.where('c.availability', availability);
    if (city_id) q = q.where('c.city_id', city_id);
    if (country_id) q = q.where('co.id', country_id);
    if (search) {
      q = q.where(b => {
        b.whereILike('u.full_name', `%${search}%`)
         .orWhereILike('u.phone', `%${search}%`)
         .orWhereILike('c.vehicle_plate', `%${search}%`);
      });
    }

    const countQuery = q.clone().clearSelect().clearOrder().count('* as total').first();
    const { total } = await countQuery;

    const validSort = ['created_at', 'rating', 'total_deliveries', 'total_earnings'];
    const sortCol = validSort.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_dir === 'asc' ? 'asc' : 'desc';

    const couriers = await q.orderBy(`c.${sortCol}`, sortDir).limit(Number(limit)).offset(offset);

    res.json({
      couriers,
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(Number(total) / Number(limit)),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/stats
// ═══════════════════════════════════════════════════════════
router.get('/stats', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const stats = await db('couriers')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const total = stats.reduce((sum, s) => sum + Number(s.count), 0);
    const byStatus = stats.reduce((acc, s) => {
      acc[s.status] = Number(s.count);
      return acc;
    }, {});

    // Currently online
    const onlineCount = await db('couriers')
      .where({ availability: 'online', status: 'active' })
      .count('* as count').first();

    // Currently delivering
    const deliveringCount = await db('couriers')
      .where({ availability: 'delivering' })
      .count('* as count').first();

    // Top performers
    const topPerformers = await db('couriers as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .where('c.status', 'active')
      .where('c.total_deliveries', '>', 0)
      .select('c.id', 'u.full_name as name', 'c.total_deliveries', 'c.total_earnings', 'c.rating')
      .orderBy('c.total_deliveries', 'desc')
      .limit(5);

    // Recent registrations
    const recent = await db('couriers as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .select('c.id', 'u.full_name as name', 'c.status', 'c.created_at')
      .orderBy('c.created_at', 'desc')
      .limit(5);

    res.json({
      total,
      by_status: byStatus,
      pending_review: byStatus.pending_review || 0,
      active: byStatus.active || 0,
      suspended: byStatus.suspended || 0,
      rejected: byStatus.rejected || 0,
      online_now: Number(onlineCount.count),
      delivering_now: Number(deliveringCount.count),
      top_performers: topPerformers,
      recent_registrations: recent,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/online — currently online
// ═══════════════════════════════════════════════════════════
router.get('/online', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { city_id } = req.query;
    let q = db('couriers as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .leftJoin('cities as ci', 'ci.id', 'c.city_id')
      .where('c.availability', 'online')
      .where('c.status', 'active')
      .select(
        'c.id', 'c.current_lat', 'c.current_lng', 'c.last_seen_at',
        'c.vehicle_type', 'c.rating',
        'u.full_name', 'u.phone',
        'ci.name_ar as city_name'
      );
    if (city_id) q = q.where('c.city_id', city_id);
    const couriers = await q.orderBy('c.last_seen_at', 'desc');
    res.json({ couriers, count: couriers.length });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/:id — full details
// ═══════════════════════════════════════════════════════════
router.get('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const courier = await db('couriers as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .leftJoin('cities as ci', 'ci.id', 'c.city_id')
      .leftJoin('countries as co', 'co.id', 'ci.country_id')
      .leftJoin('users as ab', 'ab.id', 'c.approved_by')
      .leftJoin('users as rb', 'rb.id', 'c.rejected_by')
      .leftJoin('users as sb', 'sb.id', 'c.suspended_by')
      .where('c.id', req.params.id)
      .select(
        'c.*',
        'u.id as user_id',
        'u.full_name as user_name',
        'u.phone as user_phone',
        'u.email as user_email',
        'u.blocked_at',
        'u.blocked_reason',
        'ci.name_ar as city_name',
        'ci.id as city_id',
        'co.name_ar as country_name',
        'co.code as country_code',
        'ab.full_name as approved_by_name',
        'rb.full_name as rejected_by_name',
        'sb.full_name as suspended_by_name'
      )
      .first();

    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });

    // Documents
    const documents = await db('courier_documents')
      .where({ courier_id: courier.id })
      .orderBy('uploaded_at', 'desc');

    // Recent stats (cached aggregates + live)
    const [overall] = await db('orders')
      .where({ courier_id: courier.id })
      .select(
        db.raw('COUNT(*) as total_orders'),
        db.raw("COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders"),
        db.raw("COALESCE(SUM(courier_payout) FILTER (WHERE status = 'delivered'), 0) as total_earnings")
      );

    res.json({
      courier: {
        ...courier,
        documents,
        order_stats: overall,
      },
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/:id/deliveries
// ═══════════════════════════════════════════════════════════
router.get('/:id/deliveries', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = db('orders as o')
      .leftJoin('users as cu', 'cu.id', 'o.customer_id')
      .leftJoin('kitchens as k', 'k.id', 'o.kitchen_id')
      .where('o.courier_id', req.params.id)
      .select(
        'o.id', 'o.status', 'o.subtotal', 'o.total_amount', 'o.delivery_fee',
        'o.courier_payout', 'o.created_at', 'o.delivered_at', 'o.cancelled_at',
        'cu.full_name as customer_name',
        'cu.phone as customer_phone',
        'k.name_ar as kitchen_name',
        'k.id as kitchen_id'
      );

    if (status) q = q.where('o.status', status);
    const total = await q.clone().clearSelect().clearOrder().count('* as count').first();
    const orders = await q.orderBy('o.created_at', 'desc').limit(Number(limit)).offset(offset);

    res.json({ orders, total: Number(total.count), page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/:id/earnings
// ═══════════════════════════════════════════════════════════
router.get('/:id/earnings', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { period = 30 } = req.query;
    const since = new Date(Date.now() - Number(period) * 86400000);

    const [overall] = await db('orders')
      .where({ courier_id: req.params.id })
      .where('created_at', '>=', since)
      .select(
        db.raw('COUNT(*) as deliveries_count'),
        db.raw("COUNT(*) FILTER (WHERE status = 'delivered') as completed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled"),
        db.raw("COALESCE(SUM(courier_payout) FILTER (WHERE status = 'delivered'), 0) as total_earnings"),
        db.raw("COALESCE(AVG(courier_payout) FILTER (WHERE status = 'delivered'), 0) as avg_per_delivery")
      );

    // Daily breakdown
    const daily = await db('orders')
      .where({ courier_id: req.params.id })
      .where('created_at', '>=', since)
      .select(
        db.raw("DATE(created_at) as date"),
        db.raw("COUNT(*) as deliveries"),
        db.raw("COALESCE(SUM(courier_payout) FILTER (WHERE status = 'delivered'), 0) as earnings")
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');

    // Recent settlements
    let settlements = [];
    try {
      settlements = await db('settlements')
        .where({ recipient_type: 'courier', recipient_id: req.params.id })
        .orderBy('created_at', 'desc')
        .limit(10);
    } catch { /* settlement table structure may differ */ }

    res.json({
      period_days: Number(period),
      overall,
      daily,
      settlements,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/couriers/:id/status-log
// ═══════════════════════════════════════════════════════════
router.get('/:id/status-log', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const logs = await db('courier_status_log as l')
      .leftJoin('users as u', 'u.id', 'l.changed_by')
      .where({ 'l.courier_id': req.params.id })
      .select('l.*', 'u.full_name as changed_by_name')
      .orderBy('l.created_at', 'desc')
      .limit(50);
    res.json({ logs });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/couriers — create manually
// ═══════════════════════════════════════════════════════════
router.post('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      user_id, city_id, country_id, vehicle_type, vehicle_plate,
      national_id, license_number, license_expiry,
      delivery_percentage,
    } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

    const user = await db('users').where({ id: user_id }).first();
    if (!user) return res.status(400).json({ error: 'المستخدم غير موجود' });
    if (!['courier', 'super_admin'].includes(user.role)) {
      return res.status(400).json({ error: 'المستخدم ليس مندوب' });
    }

    const existing = await db('couriers').where({ user_id }).first();
    if (existing) return res.status(409).json({ error: 'المستخدم مسجّل كمندوب بالفعل' });

    // Update user's country_id if provided
    if (country_id) {
      await db('users').where({ id: user_id }).update({ country_id });
    }

    const [courier] = await db('couriers').insert({
      id: uuid(),
      user_id, city_id,
      vehicle_type: vehicle_type || 'motorcycle',
      vehicle_plate, national_id, license_number, license_expiry,
      delivery_percentage: delivery_percentage || 80,
      status: 'active',
      approved_by: req.user.id,
      approved_at: new Date(),
    }).returning('*');

    await logStatusChange(courier.id, null, 'active', req.user.id, 'تم الإنشاء من الإدارة');
    logger.info('Courier created by admin', { id: courier.id, by: req.user.id });

    res.status(201).json({ courier });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/couriers/:id — update (admin override)
// ═══════════════════════════════════════════════════════════
router.put('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const allowed = [
      'city_id', 'vehicle_type', 'vehicle_plate',
      'national_id', 'license_number', 'license_expiry',
      'bank_account_iban', 'bank_account_holder',
      'delivery_percentage', 'admin_notes',
    ];

    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد ما يتم تحديثه' });
    }
    updates.updated_at = new Date();

    const existing = await db('couriers').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'المندوب غير موجود' });

    const [updated] = await db('couriers')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    logger.info('Courier updated by admin', { id: updated.id, by: req.user.id });
    res.json({ courier: updated, ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/couriers/:id/approve
// ═══════════════════════════════════════════════════════════
router.post('/:id/approve', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const courier = await db('couriers').where({ id: req.params.id }).first();
    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });

    if (courier.status === 'active') {
      return res.status(400).json({ error: 'المندوب نشط بالفعل' });
    }

    await db('couriers').where({ id: req.params.id }).update({
      status: 'active',
      approved_by: req.user.id,
      approved_at: new Date(),
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, courier.status, 'active', req.user.id, 'تمت الموافقة');
    res.json({ ok: true, message: 'تمت الموافقة على المندوب' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/couriers/:id/reject
// ═══════════════════════════════════════════════════════════
router.post('/:id/reject', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'السبب مطلوب (5 أحرف على الأقل)' });
    }

    const courier = await db('couriers').where({ id: req.params.id }).first();
    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });

    await db('couriers').where({ id: req.params.id }).update({
      status: 'rejected',
      rejected_by: req.user.id,
      rejected_at: new Date(),
      rejection_reason: reason,
      availability: 'offline',
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, courier.status, 'rejected', req.user.id, reason);
    res.json({ ok: true, message: 'تم رفض المندوب' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/couriers/:id/suspend
// ═══════════════════════════════════════════════════════════
router.post('/:id/suspend', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'السبب مطلوب (5 أحرف على الأقل)' });
    }

    const courier = await db('couriers').where({ id: req.params.id }).first();
    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });

    await db('couriers').where({ id: req.params.id }).update({
      status: 'suspended',
      suspended_by: req.user.id,
      suspended_at: new Date(),
      suspension_reason: reason,
      availability: 'offline',
      updated_at: new Date(),
    });

    await logStatusChange(req.params.id, courier.status, 'suspended', req.user.id, reason);
    res.json({ ok: true, message: 'تم تعليق المندوب' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/couriers/:id/unsuspend
// ═══════════════════════════════════════════════════════════
router.post('/:id/unsuspend', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const courier = await db('couriers').where({ id: req.params.id }).first();
    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });
    if (courier.status !== 'suspended') {
      return res.status(400).json({ error: 'المندوب ليس معلّقاً' });
    }

    await db('couriers').where({ id: req.params.id }).update({
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
// PUT /admin/couriers/:id/percentage — set delivery %
// ═══════════════════════════════════════════════════════════
router.put('/:id/percentage', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { delivery_percentage } = req.body;
    if (delivery_percentage == null || delivery_percentage < 0 || delivery_percentage > 100) {
      return res.status(400).json({ error: 'النسبة يجب أن تكون بين 0 و 100' });
    }

    const [updated] = await db('couriers')
      .where({ id: req.params.id })
      .update({ delivery_percentage, updated_at: new Date() })
      .returning('id', 'delivery_percentage');

    if (!updated) return res.status(404).json({ error: 'المندوب غير موجود' });
    res.json({ ok: true, courier: updated });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/couriers/:id/availability — admin force online/offline
// ═══════════════════════════════════════════════════════════
router.put('/:id/availability', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { availability } = req.body;
    if (!['online', 'offline'].includes(availability)) {
      return res.status(400).json({ error: 'القيمة يجب أن تكون online أو offline' });
    }

    const courier = await db('couriers').where({ id: req.params.id }).first();
    if (!courier) return res.status(404).json({ error: 'المندوب غير موجود' });

    if (availability === 'online' && courier.status !== 'active') {
      return res.status(400).json({ error: 'المندوب يجب أن يكون نشطاً' });
    }

    await db('couriers').where({ id: req.params.id }).update({
      availability,
      last_seen_at: new Date(),
      updated_at: new Date(),
    });

    res.json({ ok: true, availability });
  } catch (err) { next(err); }
});

module.exports = router;
