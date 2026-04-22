/**
 * Khalto — Kitchen Analytics Dashboard
 *
 * GET /api/v1/analytics/kitchen/:id/overview     — نظرة عامة
 * GET /api/v1/analytics/kitchen/:id/orders       — تحليل الطلبات
 * GET /api/v1/analytics/kitchen/:id/menu         — أداء المنيو
 * GET /api/v1/analytics/kitchen/:id/revenue      — الإيرادات
 * GET /api/v1/analytics/kitchen/:id/ratings      — التقييمات
 * GET /api/v1/analytics/kitchen/:id/peak-hours   — أوقات الذروة
 * GET /api/v1/analytics/kitchen/:id/customers    — تحليل العملاء
 * GET /api/v1/analytics/admin/platform           — إحصائيات المنصة (admin)
 */

const express = require('express');
const db      = require('../db');
const { authenticate, requireRole, ownsKitchen } = require('../middleware/auth');

const analyticsRouter = express.Router();

// ── Helper: date range ────────────────────────────────────
const getRange = (period = '7d') => {
  const days = period === '1d' ? 1 : period === '30d' ? 30 : period === '90d' ? 90 : 7;
  return new Date(Date.now() - days * 86400000);
};

// ── Kitchen: Overview ─────────────────────────────────────
analyticsRouter.get('/kitchen/:id/overview', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '7d' } = req.query;
    const from   = getRange(period);
    const prevFrom = getRange(period === '1d' ? '2d' : period === '30d' ? '60d' : '14d');

    // Current period stats
    const [current] = await db('orders')
      .where({ kitchen_id: id, status: 'delivered' })
      .where('created_at', '>=', from)
      .select(
        db.raw('COUNT(*) as order_count'),
        db.raw('SUM(subtotal) as gross_revenue'),
        db.raw('SUM(chef_net_amount) as net_revenue'),
        db.raw('AVG(subtotal) as avg_order_value'),
        db.raw('AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/60) as avg_delivery_min'),
      );

    // Previous period for comparison
    const [previous] = await db('orders')
      .where({ kitchen_id: id, status: 'delivered' })
      .where('created_at', '>=', prevFrom)
      .where('created_at', '<', from)
      .select(
        db.raw('COUNT(*) as order_count'),
        db.raw('SUM(subtotal) as gross_revenue'),
      );

    // Cancellation rate
    const [cancelled] = await db('orders')
      .where({ kitchen_id: id, status: 'cancelled' })
      .where('created_at', '>=', from)
      .count('id as c').first();

    const totalOrders = parseInt(current.order_count) + parseInt(cancelled?.c || 0);
    const cancelRate  = totalOrders > 0
      ? ((parseInt(cancelled?.c || 0) / totalOrders) * 100).toFixed(1) : 0;

    // Rating
    const [rating] = await db('order_ratings as r')
      .join('orders as o', 'o.id', 'r.order_id')
      .where({ 'o.kitchen_id': id })
      .where('r.created_at', '>=', from)
      .select(
        db.raw('AVG(r.kitchen_rating) as avg_rating'),
        db.raw('COUNT(r.id) as rating_count'),
      );

    // Growth %
    const prevOrders  = parseInt(previous?.order_count || 0);
    const currOrders  = parseInt(current.order_count || 0);
    const orderGrowth = prevOrders > 0
      ? (((currOrders - prevOrders) / prevOrders) * 100).toFixed(1) : 0;

    const prevRevenue  = parseFloat(previous?.gross_revenue || 0);
    const currRevenue  = parseFloat(current.gross_revenue || 0);
    const revenueGrowth = prevRevenue > 0
      ? (((currRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : 0;

    res.json({
      period,
      overview: {
        order_count:       currOrders,
        gross_revenue:     +currRevenue.toFixed(2),
        net_revenue:       +parseFloat(current.net_revenue || 0).toFixed(2),
        avg_order_value:   +parseFloat(current.avg_order_value || 0).toFixed(2),
        avg_delivery_min:  +parseFloat(current.avg_delivery_min || 0).toFixed(0),
        cancellation_rate: +cancelRate,
        avg_rating:        +parseFloat(rating?.avg_rating || 0).toFixed(2),
        rating_count:      parseInt(rating?.rating_count || 0),
      },
      growth: {
        orders:  +orderGrowth,
        revenue: +revenueGrowth,
      },
    });
  } catch (err) { next(err); }
});

// ── Kitchen: Revenue over time ────────────────────────────
analyticsRouter.get('/kitchen/:id/revenue', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '7d' } = req.query;
    const from  = getRange(period);
    const group = period === '1d' ? 'hour' : 'day';

    const data = await db('orders')
      .where({ kitchen_id: id, status: 'delivered' })
      .where('created_at', '>=', from)
      .select(
        db.raw(`DATE_TRUNC('${group}', created_at) as period`),
        db.raw('COUNT(*) as orders'),
        db.raw('SUM(subtotal) as revenue'),
        db.raw('SUM(chef_net_amount) as net'),
      )
      .groupByRaw(`DATE_TRUNC('${group}', created_at)`)
      .orderBy('period', 'asc');

    res.json({ period, data });
  } catch (err) { next(err); }
});

// ── Kitchen: Menu performance ─────────────────────────────
analyticsRouter.get('/kitchen/:id/menu', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;
    const from = getRange(period);

    const items = await db('order_items as oi')
      .join('orders as o', 'o.id', 'oi.order_id')
      .join('menu_items as mi', 'mi.id', 'oi.menu_item_id')
      .where({ 'o.kitchen_id': id, 'o.status': 'delivered' })
      .where('o.created_at', '>=', from)
      .select(
        'mi.id', 'mi.name_ar', 'mi.name_en', 'mi.price',
        db.raw('SUM(oi.quantity) as total_sold'),
        db.raw('SUM(oi.subtotal) as total_revenue'),
        db.raw('COUNT(DISTINCT o.id) as order_count'),
      )
      .groupBy('mi.id', 'mi.name_ar', 'mi.name_en', 'mi.price')
      .orderBy('total_sold', 'desc')
      .limit(20);

    // Add ratings per item
    for (const item of items) {
      const r = await db('order_ratings as r')
        .join('order_items as oi', 'oi.order_id', 'r.order_id')
        .where({ 'oi.menu_item_id': item.id })
        .avg('r.kitchen_rating as avg').first();
      item.avg_rating = r?.avg ? +parseFloat(r.avg).toFixed(2) : null;
    }

    res.json({ period, items });
  } catch (err) { next(err); }
});

// ── Kitchen: Peak hours heatmap ───────────────────────────
analyticsRouter.get('/kitchen/:id/peak-hours', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;
    const from = getRange(period);

    const data = await db('orders')
      .where({ kitchen_id: id, status: 'delivered' })
      .where('created_at', '>=', from)
      .select(
        db.raw('EXTRACT(DOW FROM created_at) as day_of_week'),
        db.raw('EXTRACT(HOUR FROM created_at) as hour'),
        db.raw('COUNT(*) as orders'),
        db.raw('SUM(subtotal) as revenue'),
      )
      .groupByRaw('EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)')
      .orderBy('day_of_week').orderBy('hour');

    // Format as 7×24 matrix
    const matrix = Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => {
        const found = data.find(r => +r.day_of_week === d && +r.hour === h);
        return { day: d, hour: h, orders: parseInt(found?.orders || 0), revenue: parseFloat(found?.revenue || 0) };
      })
    );

    res.json({ period, matrix, raw: data });
  } catch (err) { next(err); }
});

// ── Kitchen: Customer analysis ────────────────────────────
analyticsRouter.get('/kitchen/:id/customers', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;
    const from = getRange(period);

    const [stats] = await db('orders as o')
      .where({ 'o.kitchen_id': id, 'o.status': 'delivered' })
      .where('o.created_at', '>=', from)
      .select(
        db.raw('COUNT(DISTINCT o.customer_id) as unique_customers'),
        db.raw('COUNT(*) as total_orders'),
        db.raw('AVG(o.subtotal) as avg_order_value'),
      );

    // Repeat vs new customers
    const repeatCustomers = await db('orders')
      .where({ kitchen_id: id, status: 'delivered' })
      .where('created_at', '>=', from)
      .groupBy('customer_id')
      .havingRaw('COUNT(*) > 1')
      .count('customer_id as c').first();

    const uniqueCustomers = parseInt(stats.unique_customers || 0);
    const repeatCount     = parseInt(repeatCustomers?.c || 0);
    const newCount        = uniqueCustomers - repeatCount;
    const repeatRate      = uniqueCustomers > 0
      ? ((repeatCount / uniqueCustomers) * 100).toFixed(1) : 0;

    // Top customers (anonymized)
    const topCustomers = await db('orders as o')
      .join('users as u', 'u.id', 'o.customer_id')
      .where({ 'o.kitchen_id': id, 'o.status': 'delivered' })
      .where('o.created_at', '>=', from)
      .groupBy('o.customer_id', 'u.full_name')
      .select(
        db.raw("SUBSTRING(u.full_name FROM 1 FOR 1) || '***' as name"),
        db.raw('COUNT(*) as orders'),
        db.raw('SUM(o.subtotal) as spent'),
      )
      .orderBy('orders', 'desc')
      .limit(10);

    res.json({
      period,
      stats: {
        unique_customers: uniqueCustomers,
        new_customers:    newCount,
        repeat_customers: repeatCount,
        repeat_rate:      +repeatRate,
        avg_order_value:  +parseFloat(stats.avg_order_value || 0).toFixed(2),
      },
      top_customers: topCustomers,
    });
  } catch (err) { next(err); }
});

// ── Kitchen: Ratings breakdown ────────────────────────────
analyticsRouter.get('/kitchen/:id/ratings', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;
    const from = getRange(period);

    const breakdown = await db('order_ratings as r')
      .join('orders as o', 'o.id', 'r.order_id')
      .where({ 'o.kitchen_id': id })
      .where('r.created_at', '>=', from)
      .select(
        'r.kitchen_rating',
        db.raw('COUNT(*) as count'),
      )
      .groupBy('r.kitchen_rating')
      .orderBy('r.kitchen_rating', 'desc');

    const recentComments = await db('order_ratings as r')
      .join('orders as o', 'o.id', 'r.order_id')
      .where({ 'o.kitchen_id': id })
      .where('r.created_at', '>=', from)
      .whereNotNull('r.comment')
      .select('r.kitchen_rating', 'r.comment', 'r.created_at')
      .orderBy('r.created_at', 'desc')
      .limit(20);

    const total = breakdown.reduce((s, r) => s + parseInt(r.count), 0);
    const avg   = total > 0
      ? breakdown.reduce((s, r) => s + (r.kitchen_rating * parseInt(r.count)), 0) / total
      : 0;

    res.json({
      period,
      avg_rating:      +avg.toFixed(2),
      total_ratings:   total,
      breakdown:       breakdown.map(r => ({
        stars: r.kitchen_rating,
        count: parseInt(r.count),
        pct:   total > 0 ? +((parseInt(r.count) / total) * 100).toFixed(1) : 0,
      })),
      recent_comments: recentComments,
    });
  } catch (err) { next(err); }
});

// ── Admin: Platform analytics ─────────────────────────────
analyticsRouter.get('/admin/platform', authenticate,
  requireRole('super_admin','operations','finance'),
  async (req, res, next) => {
  try {
    const { period = '7d', country_id } = req.query;
    const from = getRange(period);
    const byCountry = q => { if (country_id) q.where({ country_id }); return q; };

    const [orders] = await db('orders')
      .where({ status: 'delivered' }).where('created_at', '>=', from)
      .modify(byCountry)
      .select(
        db.raw('COUNT(*) as total_orders'),
        db.raw('SUM(total_amount) as gmv'),
        db.raw('SUM(commission_amount) as platform_revenue'),
        db.raw('AVG(total_amount) as aov'),
      );

    const [users] = await db('users')
      .where('created_at', '>=', from)
      .modify(byCountry)
      .select(
        db.raw("COUNT(*) FILTER (WHERE role='customer') as new_customers"),
        db.raw("COUNT(*) FILTER (WHERE role='chef') as new_chefs"),
        db.raw("COUNT(*) FILTER (WHERE role='courier') as new_couriers"),
      );

    const topKitchens = await db('orders as o')
      .join('kitchens as k', 'k.id', 'o.kitchen_id')
      .where({ 'o.status': 'delivered' })
      .where('o.created_at', '>=', from)
      .modify(q => { if (country_id) q.where('o.country_id', country_id); })
      .groupBy('k.id', 'k.name_ar')
      .select('k.name_ar', db.raw('COUNT(*) as orders'), db.raw('SUM(o.subtotal) as revenue'))
      .orderBy('orders', 'desc').limit(5);

    res.json({ period, orders, users, top_kitchens: topKitchens });
  } catch (err) { next(err); }
});

module.exports = { analyticsRouter };
