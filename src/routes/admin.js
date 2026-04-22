const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, isAdmin, isSuperAdmin, isFinance, isOperations } = require('../middleware/auth');

router.get('/dashboard', authenticate, isAdmin, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [orders, gmv, kitchens, couriers, pending, tickets] = await Promise.all([
      db('orders').where('created_at', '>=', today).count('* as cnt').first(),
      db('orders').where({ status:'delivered' }).where('delivered_at','>=',today).sum('total_amount as total').first(),
      db('kitchens').where({ status:'active', is_open:true }).count('* as cnt').first(),
      db('couriers').where({ status:'active' }).whereIn('availability',['online','delivering']).count('* as cnt').first(),
      db('settlements').where({ status:'pending' }).sum('net_amount as total').first(),
      db('support_tickets').whereIn('status',['open','in_progress']).count('* as cnt').first(),
    ]);
    const last7 = await db('orders')
      .whereRaw("created_at >= NOW() - INTERVAL '7 days'")
      .select(db.raw("DATE(created_at) as date"), db.raw('COUNT(*) as count'), db.raw('SUM(total_amount) as gmv'))
      .groupBy(db.raw('DATE(created_at)')).orderBy('date');
    res.json({
      kpis: {
        orders_today: parseInt(orders.cnt),
        gmv_today: parseFloat(gmv.total)||0,
        active_kitchens: parseInt(kitchens.cnt),
        online_couriers: parseInt(couriers.cnt),
        pending_settlements: parseFloat(pending.total)||0,
        open_tickets: parseInt(tickets.cnt),
      },
      charts: { last_7_days: last7 },
    });
  } catch (err) { next(err); }
});

router.get('/orders', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { status, country_id, kitchen_id, page=1, limit=50 } = req.query;
    let query = db('orders as o')
      .select('o.*','k.name_en as kitchen_name','u.full_name as customer_name','u.phone as customer_phone')
      .join('kitchens as k','o.kitchen_id','k.id')
      .join('users as u','o.customer_id','u.id')
      .orderBy('o.created_at','desc')
      .limit(limit).offset((page-1)*limit);
    if (status)     query = query.where('o.status', status);
    if (country_id) query = query.where('o.country_id', country_id);
    if (kitchen_id) query = query.where('o.kitchen_id', kitchen_id);
    const orders = await query;
    const total = await db('orders').count('* as cnt').first();
    res.json({ orders, total: parseInt(total.cnt), page:+page, limit:+limit });
  } catch (err) { next(err); }
});

router.get('/users', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { role, page=1, limit=50 } = req.query;
    let query = db('users').select('id','role','email','phone','full_name','is_active','created_at')
      .orderBy('created_at','desc').limit(limit).offset((page-1)*limit);
    if (role) query = query.where({ role });
    const users = await query;
    res.json({ users, page:+page, limit:+limit });
  } catch (err) { next(err); }
});

router.get('/audit-logs', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { entity_type, actor_id, page=1, limit=50 } = req.query;
    let query = db('audit_logs as a')
      .select('a.*','u.full_name as actor_name')
      .leftJoin('users as u','a.actor_id','u.id')
      .orderBy('a.created_at','desc').limit(limit).offset((page-1)*limit);
    if (entity_type) query = query.where('a.entity_type', entity_type);
    if (actor_id)    query = query.where('a.actor_id', actor_id);
    const logs = await query;
    res.json({ logs, page:+page, limit:+limit });
  } catch (err) { next(err); }
});

router.get('/reports/financial', authenticate, isFinance, async (req, res, next) => {
  try {
    const { from, to, country_id } = req.query;
    let query = db('orders').where({ status:'delivered' });
    if (from) query = query.where('delivered_at','>=',new Date(from));
    if (to)   query = query.where('delivered_at','<=',new Date(to));
    if (country_id) query = query.where({ country_id });
    const summary = await query.select(
      db.raw('COUNT(*) as order_count'),
      db.raw('SUM(total_amount) as gross_gmv'),
      db.raw('SUM(platform_commission) as platform_revenue'),
      db.raw('SUM(delivery_fee) as delivery_revenue'),
      db.raw('SUM(discount_amount) as total_discounts'),
      db.raw('SUM(chef_payout) as chef_payouts'),
      db.raw('SUM(courier_payout) as courier_payouts'),
    ).first();
    res.json({ summary });
  } catch (err) { next(err); }
});

router.get('/reports/operations', authenticate, isOperations, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let base = db('orders');
    if (from) base = base.where('created_at','>=',new Date(from));
    if (to)   base = base.where('created_at','<=',new Date(to));
    const [total, delivered, cancelled, avgDelivery] = await Promise.all([
      base.clone().count('* as cnt').first(),
      base.clone().where({ status:'delivered' }).count('* as cnt').first(),
      base.clone().where({ status:'cancelled' }).count('* as cnt').first(),
      base.clone().where({ status:'delivered' })
        .whereNotNull('picked_up_at').whereNotNull('delivered_at')
        .select(db.raw("AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at))/60) as avg_min")).first(),
    ]);
    res.json({
      total_orders: parseInt(total.cnt),
      delivered: parseInt(delivered.cnt),
      cancelled: parseInt(cancelled.cnt),
      cancellation_rate: total.cnt > 0 ? (parseInt(cancelled.cnt)/parseInt(total.cnt)*100).toFixed(1)+'%' : '0%',
      avg_delivery_min: parseFloat(avgDelivery?.avg_min||0).toFixed(1),
    });
  } catch (err) { next(err); }
});

module.exports = router;
