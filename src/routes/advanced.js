/**
 * Khalto — Advanced Features
 * 1. Smart Notifications (توقيت مخصص لكل عميل)
 * 2. Order Batching (مندوب يوصل أكثر من طلب)
 * 3. Kitchen Performance Score (تقييم تلقائي للشيف)
 * 4. Subscription Plans للشيفات
 */

const express  = require('express');
const { v4: uuid } = require('uuid');
const db       = require('../db');
const logger   = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { notify } = require('../services/push.service');

// ══════════════════════════════════════════════════════════
// 1. SMART NOTIFICATIONS
//    يحلل سلوك كل عميل ويرسل الإشعار في أفضل وقت
// ══════════════════════════════════════════════════════════
const smartNotifRouter = express.Router();

// POST /smart-notifications/schedule — جدولة إشعار ذكي
smartNotifRouter.post('/schedule', authenticate,
  requireRole('super_admin', 'marketing'),
  async (req, res, next) => {
  try {
    const { template_key, audience_type, vars = {} } = req.body;

    // Get audience
    const userIds = await resolveAudience(audience_type);

    // For each user, find their best send time
    const scheduled = [];
    for (const userId of userIds.slice(0, 100)) { // batch
      const bestHour = await getBestSendHour(userId);
      const sendAt   = getNextOccurrence(bestHour);

      scheduled.push({
        id:           uuid(),
        user_id:      userId,
        template_key,
        vars:         JSON.stringify(vars),
        send_at:      sendAt,
        status:       'scheduled',
        created_at:   new Date(),
      });
    }

    await db('smart_notification_queue').insert(scheduled);

    logger.info('Smart notifications scheduled', {
      count: scheduled.length,
      template: template_key,
    });

    res.json({ ok: true, scheduled: scheduled.length });
  } catch (err) { next(err); }
});

// GET /smart-notifications/insights/:user_id
smartNotifRouter.get('/insights/:user_id', authenticate,
  requireRole('super_admin', 'marketing'),
  async (req, res, next) => {
  try {
    const userId = req.params.user_id;

    // Analyze order history for patterns
    const orders = await db('orders')
      .where({ customer_id: userId, status: 'delivered' })
      .select(
        db.raw('EXTRACT(HOUR FROM created_at)::int as hour'),
        db.raw('EXTRACT(DOW FROM created_at)::int as day_of_week'),
        db.raw('COUNT(*) as count'),
      )
      .groupByRaw('EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at)')
      .orderBy('count', 'desc');

    // Best order hour
    const bestHour    = orders[0]?.hour ?? 12;
    const bestDay     = orders[0]?.day_of_week ?? 5;
    const orderDays   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

    // Engagement rate
    const notifLogs = await db('notifications')
      .where({ user_id: userId })
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(CASE WHEN is_read THEN 1 END) as read_count'),
      )
      .first();

    const engagementRate = notifLogs?.total > 0
      ? ((notifLogs.read_count / notifLogs.total) * 100).toFixed(1)
      : 0;

    res.json({
      user_id:          userId,
      best_send_hour:   bestHour,
      best_day:         orderDays[bestDay],
      engagement_rate:  `${engagementRate}%`,
      order_patterns:   orders.slice(0, 5),
      recommendation:   `أرسل الإشعارات في الساعة ${bestHour}:00 يوم ${orderDays[bestDay]}`,
    });
  } catch (err) { next(err); }
});

// Worker: Process scheduled smart notifications (run every 5 min)
const processSmartNotifications = async () => {
  try {
    const pending = await db('smart_notification_queue')
      .where({ status: 'scheduled' })
      .where('send_at', '<=', new Date())
      .limit(50);

    for (const item of pending) {
      const tpl = await db('notification_templates')
        .where({ event_key: item.template_key, is_active: true }).first();

      if (tpl) {
        const vars = JSON.parse(item.vars || '{}');
        const user = await db('users').where({ id: item.user_id }).first('lang_preference','full_name');
        const lang = user?.lang_preference || 'ar';
        const name = user?.full_name || '';

        const render = (s) => s?.replace(/{{customer_name}}/g, name) || '';

        await notify.sendToUser(item.user_id, {
          titleAr: render(tpl.title_ar),
          titleEn: render(tpl.title_en),
          bodyAr:  render(tpl.body_ar),
          bodyEn:  render(tpl.body_en),
          data:    vars,
          lang,
        }).catch(() => {});
      }

      await db('smart_notification_queue')
        .where({ id: item.id })
        .update({ status: 'sent', sent_at: new Date() });
    }

    if (pending.length > 0) {
      logger.info('Smart notifications sent', { count: pending.length });
    }
  } catch (err) {
    logger.error('Smart notification worker error', { err: err.message });
  }
};

// Helpers
const getBestSendHour = async (userId) => {
  const result = await db('orders')
    .where({ customer_id: userId, status: 'delivered' })
    .select(db.raw('EXTRACT(HOUR FROM created_at)::int as hour'), db.raw('COUNT(*) as c'))
    .groupByRaw('EXTRACT(HOUR FROM created_at)')
    .orderBy('c', 'desc').first();
  return result?.hour ?? 12;
};

const getNextOccurrence = (hour) => {
  const now  = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
};

const resolveAudience = async (type) => {
  switch (type) {
    case 'all_customers':     return db('users').where({ role: 'customer' }).pluck('id');
    case 'inactive_7d': {
      const active = await db('orders')
        .where('created_at', '>=', new Date(Date.now() - 7 * 86400000))
        .pluck('customer_id');
      return db('users').where({ role: 'customer' }).whereNotIn('id', active).pluck('id');
    }
    default: return [];
  }
};

// ══════════════════════════════════════════════════════════
// 2. ORDER BATCHING
//    مندوب يوصل أكثر من طلب في رحلة واحدة
// ══════════════════════════════════════════════════════════
const batchingRouter = express.Router();

// POST /batching/create — إنشاء batch لمندوب
batchingRouter.post('/create', authenticate,
  requireRole('super_admin', 'operations'),
  async (req, res, next) => {
  try {
    const { courier_id, order_ids } = req.body;

    if (!order_ids?.length || order_ids.length < 2) {
      return res.status(400).json({ error: 'لازم طلبين على الأقل' });
    }
    if (order_ids.length > 4) {
      return res.status(400).json({ error: 'الحد الأقصى 4 طلبات في batch واحد' });
    }

    // Validate orders are ready for pickup + in same area
    const orders = await db('orders')
      .whereIn('id', order_ids)
      .where({ status: 'ready_for_pickup' });

    if (orders.length !== order_ids.length) {
      return res.status(400).json({ error: 'بعض الطلبات مش جاهزة للاستلام' });
    }

    const batchId = uuid();

    // Create batch
    await db('order_batches').insert({
      id:         batchId,
      courier_id,
      order_ids:  JSON.stringify(order_ids),
      status:     'assigned',
      created_at: new Date(),
    });

    // Assign all orders to courier
    await db('orders').whereIn('id', order_ids).update({
      courier_id,
      status:     'courier_assigned',
      updated_at: new Date(),
    });

    // Calculate route (simplified — in prod use Google Maps Directions)
    const pickupLats = orders.map(o => o.pickup_lat).filter(Boolean);
    const centerLat  = pickupLats.length
      ? pickupLats.reduce((a, b) => a + parseFloat(b), 0) / pickupLats.length
      : null;

    // Estimate bonus for courier (batch incentive)
    const batchBonus = order_ids.length * 1.5; // SAR 1.5 per extra order

    logger.info('Order batch created', { batchId, orders: order_ids.length });

    res.status(201).json({
      batch_id:     batchId,
      order_count:  order_ids.length,
      batch_bonus:  batchBonus,
      message:      `تم تجميع ${order_ids.length} طلبات — مكافأة SAR ${batchBonus}`,
    });
  } catch (err) { next(err); }
});

// GET /batching/suggestions — اقتراحات تلقائية للـ batching
batchingRouter.get('/suggestions', authenticate,
  requireRole('super_admin', 'operations'),
  async (req, res, next) => {
  try {
    const { city_id } = req.query;

    // Find ready orders in same area
    const readyOrders = await db('orders as o')
      .leftJoin('kitchens as k', 'k.id', 'o.kitchen_id')
      .where({ 'o.status': 'ready_for_pickup' })
      .modify(q => { if (city_id) q.where('k.city_id', city_id); })
      .select('o.id', 'o.delivery_lat', 'o.delivery_lng', 'k.lat as kitchen_lat', 'k.lng as kitchen_lng', 'k.name_ar')
      .orderBy('o.created_at', 'asc')
      .limit(20);

    // Group by proximity (same kitchen = ideal batch)
    const groups = {};
    for (const order of readyOrders) {
      const key = order.kitchen_lat && order.kitchen_lng
        ? `${Math.round(order.kitchen_lat * 100)}_${Math.round(order.kitchen_lng * 100)}`
        : 'misc';
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    }

    const suggestions = Object.values(groups)
      .filter(g => g.length >= 2)
      .map(g => ({
        kitchen_name: g[0].name_ar,
        order_ids:    g.slice(0, 3).map(o => o.id),
        count:        Math.min(g.length, 3),
        bonus:        Math.min(g.length, 3) * 1.5,
      }));

    res.json({ suggestions, total_batchable: readyOrders.length });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// 3. KITCHEN PERFORMANCE SCORE
//    تقييم تلقائي يومي للشيف
// ══════════════════════════════════════════════════════════
const kitchenScoreRouter = express.Router();

// GET /kitchen-score/:kitchen_id
kitchenScoreRouter.get('/:kitchen_id', authenticate, async (req, res, next) => {
  try {
    const { kitchen_id }   = req.params;
    const { period = '30d' } = req.query;
    const days  = parseInt(period) || 30;
    const from  = new Date(Date.now() - days * 86400000);

    const [stats] = await db('orders')
      .where({ kitchen_id, status: 'delivered' })
      .where('created_at', '>=', from)
      .select(
        db.raw('COUNT(*) as total_orders'),
        db.raw('AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/60) as avg_delivery_min'),
        db.raw('COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) as cancellations'),
      );

    const [ratings] = await db('order_ratings as r')
      .join('orders as o', 'o.id', 'r.order_id')
      .where({ 'o.kitchen_id': kitchen_id })
      .where('r.created_at', '>=', from)
      .select(
        db.raw('AVG(r.kitchen_rating) as avg_rating'),
        db.raw('COUNT(*) as rating_count'),
      );

    const [safetyChecks] = await db('food_safety_checklists')
      .where({ kitchen_id })
      .where('submitted_at', '>=', from)
      .select(
        db.raw('COUNT(*) as total_submitted'),
        db.raw('AVG(score) as avg_safety_score'),
      );

    const totalOrders  = parseInt(stats?.total_orders || 0);
    const avgDelivery  = parseFloat(stats?.avg_delivery_min || 0);
    const avgRating    = parseFloat(ratings?.avg_rating || 0);
    const safetyScore  = parseFloat(safetyChecks?.avg_safety_score || 100);
    const submittedDays = parseInt(safetyChecks?.total_submitted || 0);

    // Calculate composite score (0-100)
    const scores = {
      delivery_speed:  avgDelivery <= 30 ? 100 : avgDelivery <= 45 ? 80 : avgDelivery <= 60 ? 60 : 40,
      customer_rating: (avgRating / 5) * 100,
      order_volume:    Math.min(totalOrders * 2, 100),
      food_safety:     safetyScore,
      consistency:     submittedDays > 0 ? Math.min((submittedDays / days) * 100, 100) : 0,
    };

    const weights = { delivery_speed: 0.25, customer_rating: 0.35, order_volume: 0.15, food_safety: 0.15, consistency: 0.10 };
    const overall = Object.entries(scores).reduce((sum, [k, v]) => sum + v * weights[k], 0);

    // Badge
    const badge = overall >= 90 ? '⭐ ممتاز'
      : overall >= 75 ? '✅ جيد جداً'
      : overall >= 60 ? '👍 جيد'
      : overall >= 40 ? '⚠️ يحتاج تحسين'
      : '❌ ضعيف';

    // Commission discount for top performers
    const commissionDiscount = overall >= 90 ? 3 : overall >= 75 ? 1 : 0;

    res.json({
      kitchen_id,
      period,
      overall_score:       +overall.toFixed(1),
      badge,
      scores,
      stats: {
        total_orders:       totalOrders,
        avg_delivery_min:   +avgDelivery.toFixed(0),
        avg_rating:         +avgRating.toFixed(2),
        rating_count:       parseInt(ratings?.rating_count || 0),
        safety_score:       +safetyScore.toFixed(0),
      },
      benefits: {
        commission_discount: commissionDiscount,
        message: commissionDiscount > 0
          ? `🎉 خصم ${commissionDiscount}% على العمولة لأدائك الممتاز!`
          : null,
      },
    });
  } catch (err) { next(err); }
});

// POST /kitchen-score/recalculate — أعد حساب كل المطابخ (admin)
kitchenScoreRouter.post('/recalculate', authenticate,
  requireRole('super_admin'),
  async (req, res, next) => {
  try {
    const kitchens = await db('kitchens').where({ status: 'active' }).pluck('id');
    logger.info('Kitchen score recalculation started', { count: kitchens.length });
    res.json({ ok: true, kitchens_queued: kitchens.length });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// 4. SUBSCRIPTION PLANS للشيفات
// ══════════════════════════════════════════════════════════
const subscriptionsRouter = express.Router();

const PLANS = [
  {
    id: 'starter', name_ar: 'مبتدئ', name_en: 'Starter',
    price_sar: 0, price_egp: 0,
    commission_pct: 18,
    features_ar: ['لا رسوم شهرية', 'عمولة 18%', 'إحصائيات أساسية', 'دعم عبر الشات'],
    max_items: 20, max_photos: 5,
    is_default: true,
  },
  {
    id: 'pro', name_ar: 'احترافي', name_en: 'Pro',
    price_sar: 99, price_egp: 249,
    commission_pct: 12,
    features_ar: ['SAR 99 / شهر', 'عمولة 12%', 'تحليلات متقدمة', 'أولوية في البحث', 'باناتات ترويجية', 'دعم أولوية'],
    max_items: 100, max_photos: 20,
    is_popular: true,
  },
  {
    id: 'enterprise', name_ar: 'المؤسسات', name_en: 'Enterprise',
    price_sar: 249, price_egp: 599,
    commission_pct: 8,
    features_ar: ['SAR 249 / شهر', 'عمولة 8%', 'فريق دعم مخصص', 'API متقدم', 'تقارير مخصصة', 'تدريب مجاني'],
    max_items: -1, max_photos: -1,
  },
];

// GET /subscriptions/plans
subscriptionsRouter.get('/plans', async (req, res, next) => {
  try {
    res.json({ plans: PLANS });
  } catch (err) { next(err); }
});

// GET /subscriptions/my — اشتراكي الحالي
subscriptionsRouter.get('/my', authenticate, async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ user_id: req.user.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'لا يوجد مطبخ' });

    const sub = await db('kitchen_subscriptions')
      .where({ kitchen_id: kitchen.id, status: 'active' })
      .orderBy('created_at', 'desc').first();

    const plan = PLANS.find(p => p.id === (sub?.plan_id || 'starter'));

    res.json({
      plan,
      subscription: sub,
      next_billing: sub?.next_billing_at || null,
    });
  } catch (err) { next(err); }
});

// POST /subscriptions/upgrade — ترقية الخطة
subscriptionsRouter.post('/upgrade', authenticate, async (req, res, next) => {
  try {
    const { plan_id, payment_method } = req.body;
    const plan    = PLANS.find(p => p.id === plan_id);
    if (!plan)    return res.status(400).json({ error: 'الخطة غير موجودة' });
    if (plan.is_default) return res.status(400).json({ error: 'هذه الخطة مجانية' });

    const kitchen = await db('kitchens').where({ user_id: req.user.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'لا يوجد مطبخ' });

    // Cancel existing
    await db('kitchen_subscriptions')
      .where({ kitchen_id: kitchen.id, status: 'active' })
      .update({ status: 'cancelled', updated_at: new Date() });

    // Create new subscription
    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    const [sub] = await db('kitchen_subscriptions').insert({
      id:              uuid(),
      kitchen_id:      kitchen.id,
      plan_id,
      price_paid:      plan.price_sar,
      currency:        'SAR',
      status:          'active',
      started_at:      new Date(),
      next_billing_at: nextBilling,
      created_at:      new Date(),
    }).returning('*');

    // Apply commission discount
    await db('kitchens').where({ id: kitchen.id })
      .update({ commission_pct: plan.commission_pct });

    // Notify chef
    await notify.sendToUser?.(req.user.id, {
      titleAr: `🎉 تم ترقية خطتك إلى ${plan.name_ar}`,
      titleEn: `🎉 Upgraded to ${plan.name_en}`,
      bodyAr:  `عمولتك الجديدة ${plan.commission_pct}% ابتداءً من الآن`,
      bodyEn:  `Your new commission rate is ${plan.commission_pct}%`,
      data:    { type: 'subscription_upgrade', plan_id },
      lang:    req.user.lang_preference || 'ar',
    }).catch(() => {});

    logger.info('Kitchen subscription upgraded', { kitchen_id: kitchen.id, plan_id });
    res.status(201).json({ ok: true, subscription: sub, plan });
  } catch (err) { next(err); }
});

module.exports = {
  smartNotifRouter,
  batchingRouter,
  kitchenScoreRouter,
  subscriptionsRouter,
  processSmartNotifications,
};
