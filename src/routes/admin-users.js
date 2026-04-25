/**
 * Khalto — Admin User Management
 * Full lifecycle management for any user (customer, chef, courier, admin)
 *
 * Endpoints:
 *   GET    /admin/users                    — List with filters
 *   GET    /admin/users/:id                — Full user details
 *   GET    /admin/users/:id/action-log     — User action history
 *   POST   /admin/users/create             — Create new user (any role)
 *   PUT    /admin/users/:id                — Update profile
 *   POST   /admin/users/:id/reset-password — Generate new password
 *   POST   /admin/users/:id/block          — Block from logging in
 *   POST   /admin/users/:id/unblock        — Restore access
 *   DELETE /admin/users/:id                — Soft delete
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateUUID } = require('../middleware/uuid-validator');

const ADMIN_ROLES = ['super_admin', 'operations'];
const ALL_ROLES = [
  'super_admin', 'operations', 'finance', 'customer_service', 'marketing',
  'customer', 'chef', 'courier',
];

// ── Helper: generate readable password ─────────────
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return 'Khalto' + p + '!';
}

// ── Helper: log user action ────────────────────────
async function logAction(userId, action, doneBy, reason, metadata) {
  try {
    await db('user_action_log').insert({
      id: uuid(),
      user_id: userId,
      action,
      done_by: doneBy,
      reason: reason || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.warn('Failed to log user action', { err: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// GET /admin/users — list with filters
// ═══════════════════════════════════════════════════════════
router.get('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      role, blocked, search, country_id,
      page = 1, limit = 20, sort_by = 'created_at', sort_dir = 'desc',
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = db('users as u').select(
      'u.id', 'u.full_name', 'u.phone', 'u.email', 'u.role',
      'u.is_active', 'u.is_verified', 'u.blocked_at', 'u.blocked_reason',
      'u.country_code', 'u.country_id', 'u.last_login_at', 'u.created_at'
    );

    if (role) q = q.where('u.role', role);
    if (country_id) q = q.where('u.country_id', country_id);
    if (blocked === 'true') q = q.whereNotNull('u.blocked_at');
    if (blocked === 'false') q = q.whereNull('u.blocked_at');
    if (search) {
      q = q.where(b => {
        b.whereILike('u.full_name', `%${search}%`)
         .orWhereILike('u.phone', `%${search}%`)
         .orWhereILike('u.email', `%${search}%`);
      });
    }

    const totalRow = await q.clone().clearSelect().clearOrder().count('* as total').first();

    const validSort = ['created_at', 'full_name', 'last_login_at'];
    const sortCol = validSort.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_dir === 'asc' ? 'asc' : 'desc';

    const users = await q.orderBy(`u.${sortCol}`, sortDir).limit(Number(limit)).offset(offset);

    res.json({
      users,
      total: Number(totalRow.total),
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(Number(totalRow.total) / Number(limit)),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/users/:id — full details
// ═══════════════════════════════════════════════════════════
router.get('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await db('users as u')
      .leftJoin('users as bb', 'bb.id', 'u.blocked_by')
      .where('u.id', req.params.id)
      .select(
        'u.id', 'u.full_name', 'u.phone', 'u.email', 'u.role',
        'u.is_active', 'u.is_verified', 'u.blocked_at', 'u.blocked_reason',
        'u.country_code', 'u.country_id', 'u.last_login_at',
        'u.password_reset_at', 'u.created_at', 'u.updated_at',
        'bb.full_name as blocked_by_name'
      )
      .first();

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // If chef, get kitchen
    let kitchen = null;
    if (user.role === 'chef') {
      kitchen = await db('kitchens')
        .where({ user_id: user.id })
        .select('id', 'name_ar', 'name_en', 'status')
        .first();
    }

    // If courier, get courier profile
    let courier = null;
    if (user.role === 'courier') {
      courier = await db('couriers')
        .where({ user_id: user.id })
        .select('id', 'vehicle_type', 'vehicle_plate', 'status', 'availability')
        .first();
    }

    res.json({ user, kitchen, courier });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /admin/users/:id/action-log
// ═══════════════════════════════════════════════════════════
router.get('/:id/action-log', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const logs = await db('user_action_log as l')
      .leftJoin('users as u', 'u.id', 'l.done_by')
      .where('l.user_id', req.params.id)
      .select('l.*', 'u.full_name as done_by_name')
      .orderBy('l.created_at', 'desc')
      .limit(100);
    res.json({ logs });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/users/create — create user (any role)
// ═══════════════════════════════════════════════════════════
router.post('/create', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      full_name, phone, email, password, role,
      country_code, country_id,
    } = req.body;

    if (!full_name || !phone || !role) {
      return res.status(400).json({ error: 'الاسم والهاتف والدور مطلوبين' });
    }

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: 'الدور غير صحيح' });
    }

    const exists = await db('users').where({ phone }).first();
    if (exists) return res.status(409).json({ error: 'رقم الهاتف مسجّل مسبقاً' });

    if (email) {
      const emailExists = await db('users').where({ email }).first();
      if (emailExists) return res.status(409).json({ error: 'البريد الإلكتروني مسجّل مسبقاً' });
    }

    const finalPassword = password || generatePassword();
    const hashed = await bcrypt.hash(finalPassword, 10);

    const [user] = await db('users').insert({
      id: uuid(),
      full_name,
      phone,
      email: email || null,
      password_hash: hashed,
      role,
      country_code: country_code || null,
      country_id: country_id || null,
      is_active: true,
      is_verified: true,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning(['id', 'full_name', 'phone', 'email', 'role', 'is_active', 'created_at']);

    await logAction(user.id, 'created', req.user.id, 'تم الإنشاء من الإدارة', { role });

    logger.info('User created by admin', { id: user.id, by: req.user.id, role });

    // Return password only if admin didn't supply one (so admin sees the generated one)
    const response = { ok: true, user };
    if (!password) response.generated_password = finalPassword;

    res.status(201).json(response);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /admin/users/:id — update profile
// ═══════════════════════════════════════════════════════════
router.put('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const allowed = ['full_name', 'phone', 'email', 'country_code', 'country_id', 'is_verified'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد ما يتم تحديثه' });
    }

    const existing = await db('users').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // Check phone uniqueness if changed
    if (updates.phone && updates.phone !== existing.phone) {
      const dup = await db('users').where({ phone: updates.phone }).whereNot({ id: req.params.id }).first();
      if (dup) return res.status(409).json({ error: 'رقم الهاتف مسجّل لمستخدم آخر' });
    }

    // Check email uniqueness if changed
    if (updates.email && updates.email !== existing.email) {
      const dup = await db('users').where({ email: updates.email }).whereNot({ id: req.params.id }).first();
      if (dup) return res.status(409).json({ error: 'البريد مسجّل لمستخدم آخر' });
    }

    updates.updated_at = new Date();
    const [updated] = await db('users')
      .where({ id: req.params.id })
      .update(updates)
      .returning(['id', 'full_name', 'phone', 'email', 'role', 'is_verified']);

    await logAction(req.params.id, 'profile_updated', req.user.id, null, { fields: Object.keys(updates) });

    res.json({ ok: true, user: updated });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/users/:id/reset-password
// ═══════════════════════════════════════════════════════════
router.post('/:id/reset-password', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const newPassword = generatePassword();
    const hashed = await bcrypt.hash(newPassword, 10);

    await db('users').where({ id: req.params.id }).update({
      password_hash: hashed,
      password_reset_at: new Date(),
      password_reset_by: req.user.id,
      updated_at: new Date(),
    });

    await logAction(req.params.id, 'password_reset', req.user.id, 'تم إعادة تعيين كلمة المرور');

    logger.info('Password reset by admin', { user_id: req.params.id, by: req.user.id });

    res.json({
      ok: true,
      message: 'تم إعادة تعيين كلمة المرور',
      new_password: newPassword,
      note: 'يرجى نقل كلمة المرور للمستخدم بشكل آمن. لن تظهر مرة أخرى.',
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/users/:id/block
// ═══════════════════════════════════════════════════════════
router.post('/:id/block', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'السبب مطلوب (5 أحرف على الأقل)' });
    }

    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (user.blocked_at) return res.status(400).json({ error: 'المستخدم محظور بالفعل' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكن حظر نفسك' });

    await db('users').where({ id: req.params.id }).update({
      blocked_at: new Date(),
      blocked_by: req.user.id,
      blocked_reason: reason,
      is_active: false,
      updated_at: new Date(),
    });

    await logAction(req.params.id, 'block', req.user.id, reason);

    logger.info('User blocked by admin', { user_id: req.params.id, by: req.user.id });

    res.json({ ok: true, message: 'تم حظر المستخدم' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /admin/users/:id/unblock
// ═══════════════════════════════════════════════════════════
router.post('/:id/unblock', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (!user.blocked_at) return res.status(400).json({ error: 'المستخدم غير محظور' });

    await db('users').where({ id: req.params.id }).update({
      blocked_at: null,
      blocked_by: null,
      blocked_reason: null,
      is_active: true,
      updated_at: new Date(),
    });

    await logAction(req.params.id, 'unblock', req.user.id, 'تم رفع الحظر');

    res.json({ ok: true, message: 'تم رفع الحظر' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// DELETE /admin/users/:id — soft delete
// ═══════════════════════════════════════════════════════════
router.delete('/:id', validateUUID(), authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكن حذف نفسك' });

    // Soft delete - mark as deleted but keep data for referential integrity
    await db('users').where({ id: req.params.id }).update({
      is_active: false,
      blocked_at: new Date(),
      blocked_by: req.user.id,
      blocked_reason: 'تم الحذف',
      phone: `DELETED_${Date.now()}_${user.phone || 'noname'}`,
      email: user.email ? `DELETED_${Date.now()}_${user.email}` : null,
      updated_at: new Date(),
    });

    await logAction(req.params.id, 'deleted', req.user.id, 'تم الحذف من الإدارة');

    logger.info('User soft-deleted by admin', { user_id: req.params.id, by: req.user.id });

    res.json({ ok: true, message: 'تم الحذف' });
  } catch (err) { next(err); }
});

module.exports = router;
