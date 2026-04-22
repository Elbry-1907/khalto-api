const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole, isFinance } = require('../middleware/auth');

// ── GET /settlements — admin ──
router.get('/', authenticate, isFinance, async (req, res, next) => {
  try {
    const { status, recipient_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('settlements')
      .orderBy('created_at', 'desc')
      .limit(limit).offset(offset);

    if (status)         query = query.where({ status });
    if (recipient_type) query = query.where({ recipient_type });

    const settlements = await query;
    res.json({ settlements, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// ── GET /settlements/me — chef or courier ──
router.get('/me', authenticate, requireRole('chef', 'courier'), async (req, res, next) => {
  try {
    const { period = 'all', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let recipientId;
    if (req.user.role === 'chef') {
      const kitchen = await db('kitchens').where({ user_id: req.user.id }).first('id');
      if (!kitchen) return res.status(404).json({ error: 'Kitchen not found' });
      recipientId = kitchen.id;
    } else {
      const courier = await db('couriers').where({ user_id: req.user.id }).first('id');
      if (!courier) return res.status(404).json({ error: 'Courier not found' });
      recipientId = courier.id;
    }

    let query = db('settlements')
      .where({ recipient_id: recipientId })
      .orderBy('period_start', 'desc')
      .limit(limit).offset(offset);

    if (period === 'month') query = query.whereRaw("period_start >= NOW() - INTERVAL '30 days'");
    if (period === 'week')  query = query.whereRaw("period_start >= NOW() - INTERVAL '7 days'");

    const settlements = await query;

    // Summary totals
    const summary = await db('settlements')
      .where({ recipient_id: recipientId })
      .select(
        db.raw('SUM(gross_amount) as total_gross'),
        db.raw('SUM(net_amount) as total_net'),
        db.raw('SUM(order_count) as total_orders'),
        db.raw('COUNT(*) as settlement_count'),
      ).first();

    res.json({ settlements, summary, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// ── GET /settlements/:id ──
router.get('/:id', authenticate, isFinance, async (req, res, next) => {
  try {
    const settlement = await db('settlements').where({ id: req.params.id }).first();
    if (!settlement) return res.status(404).json({ error: 'Not found' });
    const items = await db('orders')
      .where({ settlement_id: settlement.id })
      .select('id', 'order_number', 'total_amount', 'chef_net_amount', 'courier_net_amount', 'delivered_at');
    res.json({ settlement: { ...settlement, items } });
  } catch (err) { next(err); }
});

// ── POST /settlements/:id/approve ──
router.post('/:id/approve', authenticate, isFinance, async (req, res, next) => {
  try {
    const settlement = await db('settlements')
      .where({ id: req.params.id })
      .whereIn('status', ['pending', 'under_review'])
      .first();
    if (!settlement) return res.status(404).json({ error: 'Settlement not found or not approvable' });

    await db('settlements').where({ id: req.params.id }).update({
      status: 'approved',
      approved_by: req.user.id,
      approved_at: new Date(),
      updated_at: new Date(),
    });

    await db('audit_logs').insert({
      id: uuid(),
      actor_id: req.user.id,
      action: 'settlement.approved',
      entity_type: 'settlement',
      entity_id: settlement.id,
      old_value: JSON.stringify({ status: settlement.status }),
      new_value: JSON.stringify({ status: 'approved' }),
    });

    res.json({ message: 'Settlement approved', settlement_id: req.params.id });
  } catch (err) { next(err); }
});

// ── POST /settlements/run — calculate & create settlement batch ──
router.post('/run', authenticate, isFinance, async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const { period_start, period_end, recipient_type = 'chef', country_id } = req.body;

    if (!period_start || !period_end)
      return res.status(400).json({ error: 'period_start and period_end required' });

    const from = new Date(period_start);
    const to   = new Date(period_end);
    to.setHours(23, 59, 59, 999);

    let settlements = [];

    if (recipient_type === 'chef') {
      // Group delivered orders by kitchen
      let query = trx('orders as o')
        .select('o.kitchen_id',
          trx.raw('COUNT(*) as order_count'),
          trx.raw('SUM(o.subtotal) as gross_amount'),
          trx.raw('SUM(o.platform_commission) as commission'),
          trx.raw('SUM(o.chef_payout) as net_amount'),
          'k.commission_rate', 'k.country_id as kitchen_country_id')
        .join('kitchens as k', 'o.kitchen_id', 'k.id')
        .where('o.status', 'delivered')
        .whereBetween('o.delivered_at', [from, to])
        .whereNull('o.settlement_id')
        .groupBy('o.kitchen_id', 'k.commission_rate', 'k.country_id');

      if (country_id) query = query.where('k.country_id', country_id);

      const groups = await query;

      for (const g of groups) {
        const currency = await trx('countries')
          .where({ id: g.kitchen_country_id }).first('currency_code').then(r => r?.currency_code || 'SAR');

        const [s] = await trx('settlements').insert({
          id: uuid(),
          recipient_type: 'chef',
          recipient_id: g.kitchen_id,
          country_id: g.kitchen_country_id,
          period_start: from,
          period_end: to,
          order_count: parseInt(g.order_count),
          gross_amount: parseFloat(g.gross_amount),
          commission: parseFloat(g.commission),
          net_amount: parseFloat(g.net_amount),
          currency_code: currency,
          status: 'pending',
        }).returning('*');

        // Mark orders as included
        await trx('orders')
          .where('kitchen_id', g.kitchen_id)
          .where('status', 'delivered')
          .whereBetween('delivered_at', [from, to])
          .whereNull('settlement_id')
          .update({ settlement_id: s.id });

        settlements.push(s);
      }
    }

    if (recipient_type === 'courier') {
      let query = trx('orders as o')
        .select('o.courier_id',
          trx.raw('COUNT(*) as order_count'),
          trx.raw('SUM(o.courier_payout) as net_amount'),
          'c.city_id', 'ci.country_id')
        .join('couriers as c', 'o.courier_id', 'c.id')
        .join('cities as ci', 'c.city_id', 'ci.id')
        .where('o.status', 'delivered')
        .whereBetween('o.delivered_at', [from, to])
        .whereNotNull('o.courier_id')
        .groupBy('o.courier_id', 'c.city_id', 'ci.country_id');

      if (country_id) query = query.where('ci.country_id', country_id);

      const groups = await query;

      for (const g of groups) {
        const currency = await trx('countries')
          .where({ id: g.country_id }).first('currency_code').then(r => r?.currency_code || 'SAR');

        const [s] = await trx('settlements').insert({
          id: uuid(),
          recipient_type: 'courier',
          recipient_id: g.courier_id,
          country_id: g.country_id,
          period_start: from,
          period_end: to,
          order_count: parseInt(g.order_count),
          gross_amount: parseFloat(g.net_amount),
          commission: 0,
          net_amount: parseFloat(g.net_amount),
          currency_code: currency,
          status: 'pending',
        }).returning('*');

        settlements.push(s);
      }
    }

    await trx.commit();
    res.json({ message: `${settlements.length} settlements created`, settlements });
  } catch (err) { await trx.rollback(); next(err); }
});

module.exports = router;
