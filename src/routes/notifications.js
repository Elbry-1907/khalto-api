/**
 * Khalto — Notifications Routes
 *
 * GET    /api/v1/notifications              — إشعارات المستخدم
 * PATCH  /api/v1/notifications/read-all     — تعليم الكل مقروء
 * PATCH  /api/v1/notifications/:id/read     — تعليم واحد مقروء
 * GET    /api/v1/notifications/templates    — قائمة القوالب (admin)
 * POST   /api/v1/notifications/templates    — قالب جديد
 * PUT    /api/v1/notifications/templates/:key — تحديث قالب
 * DELETE /api/v1/notifications/templates/:key — حذف
 * POST   /api/v1/notifications/send         — إرسال لمستخدمين
 * POST   /api/v1/notifications/broadcast    — إرسال لشريحة
 * GET    /api/v1/notifications/log          — سجل الإرسال
 * GET    /api/v1/notifications/stats        — إحصائيات
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendToUser }  = require('../services/push.service');
const { email }       = require('../services/email.service');
const { sms }         = require('../services/sms.service');

// ── Render template vars ──────────────────────────────────
const render = (text, vars = {}) => {
  if (!text) return '';
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? '')),
    text
  );
};

// ── Build audience from type ──────────────────────────────
const resolveAudience = async (type, countryId) => {
  const byCountry = q => { if (countryId) q.where({ country_id: countryId }); return q; };
  const since = (days) => new Date(Date.now() - days * 86400000);

  switch (type) {
    case 'all_customers':
      return db('users').where({ role:'customer' }).modify(byCountry).pluck('id');
    case 'active_customers': {
      const ids = await db('orders').where('created_at','>=',since(30)).distinct('customer_id').pluck('customer_id');
      return ids;
    }
    case 'inactive_7d': {
      const active = await db('orders').where('created_at','>=',since(7)).pluck('customer_id');
      return db('users').where({role:'customer'}).whereNotIn('id', active).modify(byCountry).pluck('id');
    }
    case 'cart_abandoners':
      return db('orders').where({status:'pending_payment'}).where('created_at','>=',since(1))
        .distinct('customer_id').pluck('customer_id');
    case 'all_chefs':    return db('users').where({role:'chef'}).modify(byCountry).pluck('id');
    case 'all_couriers': return db('users').where({role:'courier'}).modify(byCountry).pluck('id');
    case 'top_customers':
      return db('orders').where({status:'delivered'}).groupBy('customer_id')
        .havingRaw('COUNT(*) >= 5').pluck('customer_id');
    default: return [];
  }
};

// ── Core send function ────────────────────────────────────
const sendNotifications = async ({ userIds, titleAr, titleEn, bodyAr, bodyEn, channels, vars, data, templateKey, sentBy }) => {
  const batchId = uuid();
  let sent = 0, failed = 0;

  // Batch 100 at a time
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const users = await db('users').whereIn('id', batch)
      .select('id', 'lang_preference', 'phone', 'email', 'full_name');

    await Promise.allSettled(users.map(async (user) => {
      const lang  = user.lang_preference || 'ar';
      const v     = { ...vars, customer_name: user.full_name };
      const title = render(lang === 'ar' ? titleAr : titleEn, v);
      const body  = render(lang === 'ar' ? bodyAr  : bodyEn,  v);

      try {
        // Push
        if (channels.includes('push')) {
          await sendToUser(user.id, { titleAr, titleEn, bodyAr, bodyEn, data: data||{}, lang });
        }
        // SMS
        if (channels.includes('sms') && user.phone) {
          await sms.sendSMS({ to: user.phone, body: `خالتو: ${body}` });
        }
        // Email
        if (channels.includes('email') && user.email) {
          await email.sendEmail({ to: user.email, subject: title,
            html: `<p dir="${lang==='ar'?'rtl':'ltr'}" style="font-family:'Cairo',sans-serif;font-size:14px">${body}</p>` });
        }
        // In-app
        await db('notifications').insert({
          id: uuid(), user_id: user.id, title, body,
          channel: 'in_app', is_read: false,
          data: JSON.stringify(data||{}),
          batch_id: batchId,
          template_key: templateKey || null,
          created_at: new Date(),
        }).catch(() => {});

        sent++;
      } catch (err) { failed++; }
    }));
  }

  // Log batch
  await db('notification_batches').insert({
    id: batchId, template_key: templateKey||null,
    total: userIds.length, sent, failed,
    channels: JSON.stringify(channels),
    sent_by: sentBy, created_at: new Date(),
  }).catch(() => {});

  return { batchId, sent, failed };
};

// ═══════════════════════════════════════════════════════════
// User endpoints
// ═══════════════════════════════════════════════════════════

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page=1, limit=30, unread_only } = req.query;
    let q = db('notifications').where({ user_id: req.user.id })
      .orderBy('created_at','desc').limit(limit).offset((page-1)*limit);
    if (unread_only==='true') q = q.where({ is_read:false });

    const [notifs, unread] = await Promise.all([
      q,
      db('notifications').where({ user_id:req.user.id, is_read:false }).count('id as c').first(),
    ]);
    res.json({ notifications: notifs, unread_count: parseInt(unread?.c||0) });
  } catch(err){ next(err); }
});

router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    await db('notifications').where({ user_id:req.user.id, is_read:false })
      .update({ is_read:true, read_at:new Date() });
    res.json({ ok:true });
  } catch(err){ next(err); }
});

router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    await db('notifications').where({ id:req.params.id, user_id:req.user.id })
      .update({ is_read:true, read_at:new Date() });
    res.json({ ok:true });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// Admin: Templates
// ═══════════════════════════════════════════════════════════

router.get('/templates', authenticate, requireRole('super_admin','marketing','operations'), async (req, res, next) => {
  try {
    const templates = await db('notification_templates').orderBy('audience').orderBy('event_key');
    res.json({ templates });
  } catch(err){ next(err); }
});

router.post('/templates', authenticate, requireRole('super_admin','marketing'), async (req, res, next) => {
  try {
    const { event_key, name_ar, name_en, audience, title_ar, title_en, body_ar, body_en,
      channels=['push','in_app'], trigger_type='event', is_active=true } = req.body;

    if (!event_key || !audience) return res.status(400).json({ error: 'event_key و audience مطلوبان' });
    const exists = await db('notification_templates').where({ event_key }).first('id');
    if (exists) return res.status(409).json({ error: 'المفتاح موجود مسبقاً' });

    const [tpl] = await db('notification_templates').insert({
      id: uuid(), event_key, name_ar, name_en, audience,
      title_ar, title_en, body_ar, body_en,
      channels: JSON.stringify(channels),
      trigger_type, is_active,
      created_by: req.user.id, created_at: new Date(),
    }).returning('*');

    res.status(201).json({ template: tpl });
  } catch(err){ next(err); }
});

router.put('/templates/:key', authenticate, requireRole('super_admin','marketing'), async (req, res, next) => {
  try {
    const allowed = ['title_ar','title_en','body_ar','body_en','channels','is_active','trigger_type','name_ar','name_en'];
    const upd = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) upd[f] = req.body[f]; });
    if (Array.isArray(upd.channels)) upd.channels = JSON.stringify(upd.channels);
    upd.updated_at = new Date(); upd.updated_by = req.user.id;

    const [tpl] = await db('notification_templates').where({ event_key:req.params.key }).update(upd).returning('*');
    if (!tpl) return res.status(404).json({ error: 'القالب غير موجود' });
    res.json({ template: tpl });
  } catch(err){ next(err); }
});

router.delete('/templates/:key', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await db('notification_templates').where({ event_key:req.params.key }).delete();
    res.json({ ok:true });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// Admin: Send
// ═══════════════════════════════════════════════════════════

router.post('/send', authenticate, requireRole('super_admin','marketing','operations'), async (req, res, next) => {
  try {
    const { template_key, user_ids, title_ar, title_en, body_ar, body_en,
      channels=['push'], vars={}, data={} } = req.body;

    if (!user_ids?.length) return res.status(400).json({ error: 'user_ids مطلوب' });

    let tAr=title_ar, tEn=title_en, bAr=body_ar, bEn=body_en, ch=channels;

    if (template_key) {
      const tpl = await db('notification_templates').where({ event_key:template_key, is_active:true }).first();
      if (tpl) { tAr=tpl.title_ar; tEn=tpl.title_en; bAr=tpl.body_ar; bEn=tpl.body_en; ch=JSON.parse(tpl.channels||'["push"]'); }
    }

    const result = await sendNotifications({
      userIds: user_ids, titleAr: tAr, titleEn: tEn, bodyAr: bAr, bodyEn: bEn,
      channels: ch, vars, data, templateKey: template_key, sentBy: req.user.id,
    });

    logger.info('Notifications sent', result);
    res.json({ ok:true, ...result });
  } catch(err){ next(err); }
});

router.post('/broadcast', authenticate, requireRole('super_admin','marketing'), async (req, res, next) => {
  try {
    const { template_key, audience_type, country_id, title_ar, title_en, body_ar, body_en,
      channels=['push'], vars={}, data={}, schedule_at } = req.body;

    if (!audience_type) return res.status(400).json({ error: 'audience_type مطلوب' });

    const userIds = await resolveAudience(audience_type, country_id);
    if (!userIds.length) return res.status(400).json({ error: 'لا يوجد مستخدمون في هذه الشريحة' });

    if (schedule_at) {
      await db('notification_scheduled').insert({
        id: uuid(), template_key, audience_type,
        user_ids: JSON.stringify(userIds),
        title_ar, title_en, body_ar, body_en,
        channels: JSON.stringify(channels),
        vars: JSON.stringify(vars), data: JSON.stringify(data),
        schedule_at: new Date(schedule_at), status: 'scheduled',
        created_by: req.user.id, created_at: new Date(),
      });
      return res.json({ ok:true, scheduled:true, schedule_at, audience_size: userIds.length });
    }

    const result = await sendNotifications({
      userIds, titleAr: title_ar, titleEn: title_en, bodyAr: body_ar, bodyEn: body_en,
      channels, vars, data, templateKey: template_key, sentBy: req.user.id,
    });

    res.json({ ok:true, audience_size: userIds.length, ...result });
  } catch(err){ next(err); }
});

router.get('/log', authenticate, requireRole('super_admin','marketing','operations'), async (req, res, next) => {
  try {
    const { page=1, limit=50, template_key, status } = req.query;
    let q = db('notifications').orderBy('created_at','desc').limit(limit).offset((page-1)*limit);
    if (template_key) q = q.where({ template_key });
    if (status==='read')   q = q.where({ is_read:true });
    if (status==='unread') q = q.where({ is_read:false });
    const [logs, total] = await Promise.all([q, db('notifications').count('id as c').first()]);
    res.json({ logs, total: parseInt(total?.c||0) });
  } catch(err){ next(err); }
});

router.get('/stats', authenticate, requireRole('super_admin','marketing','operations'), async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [total, read, batches, templates] = await Promise.all([
      db('notifications').where('created_at','>=',today).count('id as c').first(),
      db('notifications').where('created_at','>=',today).where({is_read:true}).count('id as c').first(),
      db('notification_batches').orderBy('created_at','desc').limit(10),
      db('notification_templates').count('id as c').first(),
    ]);
    const t = parseInt(total?.c||0), r = parseInt(read?.c||0);
    res.json({
      today: { sent:t, read:r, open_rate: t>0 ? `${((r/t)*100).toFixed(1)}%` : '0%' },
      batches,
      templates_count: parseInt(templates?.c||0),
    });
  } catch(err){ next(err); }
});

module.exports = router;
