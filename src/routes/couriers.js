const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole, isOperations } = require('../middleware/auth');

// helper: get courier record for current user
const getMyCourier = (userId) =>
  db('couriers').where({ user_id: userId }).first();

// ── POST /couriers — register ──
router.post('/', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const { city_id, vehicle_type, vehicle_plate } = req.body;
    const existing = await getMyCourier(req.user.id);
    if (existing) return res.status(409).json({ error: 'Already registered as courier' });

    const [courier] = await db('couriers').insert({
      id: uuid(), user_id: req.user.id,
      city_id, vehicle_type, vehicle_plate,
      status: 'pending_review',
    }).returning('*');

    res.status(201).json({ courier });
  } catch (err) { next(err); }
});

// ── GET /couriers/me ──
router.get('/me', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Courier profile not found' });
    res.json({ courier });
  } catch (err) { next(err); }
});

// ── PATCH /couriers/me ──
router.patch('/me', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Not found' });
    const allowed = ['vehicle_type', 'vehicle_plate', 'city_id'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date();
    const [updated] = await db('couriers').where({ id: courier.id }).update(updates).returning('*');
    res.json({ courier: updated });
  } catch (err) { next(err); }
});

// ── PATCH /couriers/me/availability ──
router.patch('/me/availability', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const { availability } = req.body; // online | offline | delivering
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Not found' });
    if (courier.status !== 'active')
      return res.status(400).json({ error: 'Courier account not active' });

    await db('couriers').where({ id: courier.id }).update({ availability, updated_at: new Date() });
    req.io?.emit(`courier:${courier.id}:availability`, { availability });
    res.json({ courier_id: courier.id, availability });
  } catch (err) { next(err); }
});

// ── POST /couriers/me/location ──
router.post('/me/location', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const { lat, lng, order_id } = req.body;
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Not found' });

    await db('couriers').where({ id: courier.id })
      .update({ current_lat: lat, current_lng: lng, updated_at: new Date() });

    if (order_id) {
      req.io?.to(`order_${order_id}`).emit('courier:location', { lat, lng, ts: Date.now() });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /couriers/me/jobs ──
router.get('/me/jobs', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Not found' });

    const { type = 'active' } = req.query;

    let query = db('orders as o')
      .select('o.id','o.order_number','o.delivery_address','o.delivery_lat','o.delivery_lng',
        'o.courier_payout','o.status','o.created_at',
        'k.name_en as kitchen_name','k.lat as kitchen_lat','k.lng as kitchen_lng',
        'k.address as kitchen_address')
      .join('kitchens as k', 'o.kitchen_id', 'k.id');

    if (type === 'active') {
      query = query
        .where('o.courier_id', courier.id)
        .whereIn('o.status', ['courier_assigned','picked_up']);
    } else if (type === 'available') {
      // Jobs near courier that need a courier
      query = query
        .whereNull('o.courier_id')
        .where('o.status', 'ready_for_pickup')
        .where('k.city_id', courier.city_id)
        .limit(10);
    } else if (type === 'done') {
      query = query
        .where('o.courier_id', courier.id)
        .whereIn('o.status', ['delivered', 'cancelled'])
        .orderBy('o.delivered_at', 'desc')
        .limit(50);
    }

    const jobs = await query;
    res.json({ jobs });
  } catch (err) { next(err); }
});

// ── POST /couriers/me/jobs/:order_id/accept ──
router.post('/me/jobs/:order_id/accept', authenticate, requireRole('courier'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const courier = await getMyCourier(req.user.id);
    if (!courier || courier.status !== 'active')
      return res.status(400).json({ error: 'Courier not active' });

    const order = await trx('orders')
      .where({ id: req.params.order_id, status: 'ready_for_pickup' })
      .whereNull('courier_id')
      .first();

    if (!order) return res.status(400).json({ error: 'Job not available' });

    await trx('orders').where({ id: order.id }).update({
      courier_id: courier.id,
      status: 'courier_assigned',
      updated_at: new Date(),
    });

    await trx('order_status_log').insert({
      id: uuid(), order_id: order.id,
      from_status: 'ready_for_pickup', to_status: 'courier_assigned',
      changed_by: req.user.id,
    });

    await trx('couriers').where({ id: courier.id })
      .update({ availability: 'delivering', updated_at: new Date() });

    await trx.commit();

    req.io?.to(`order_${order.id}`).emit('order:status', {
      order_id: order.id, status: 'courier_assigned',
      courier: { id: courier.id, name: req.user.full_name },
    });

    res.json({ order_id: order.id, status: 'courier_assigned' });
  } catch (err) { await trx.rollback(); next(err); }
});

// ── GET /couriers/me/earnings ──
router.get('/me/earnings', authenticate, requireRole('courier'), async (req, res, next) => {
  try {
    const courier = await getMyCourier(req.user.id);
    if (!courier) return res.status(404).json({ error: 'Not found' });

    const { period = 'today' } = req.query;
    let fromDate = new Date();
    if (period === 'today') {
      fromDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      fromDate.setDate(fromDate.getDate() - 7);
    } else if (period === 'month') {
      fromDate.setDate(1); fromDate.setHours(0, 0, 0, 0);
    }

    const result = await db('orders')
      .where({ courier_id: courier.id, status: 'delivered' })
      .where('delivered_at', '>=', fromDate)
      .select(
        db.raw('COUNT(*) as trip_count'),
        db.raw('SUM(courier_payout) as total_earnings'),
        db.raw('AVG(courier_payout) as avg_per_trip'),
      )
      .first();

    const settlements = await db('settlements')
      .where({ recipient_type: 'courier', recipient_id: courier.id })
      .orderBy('created_at', 'desc')
      .limit(10);

    res.json({
      period,
      trip_count: parseInt(result.trip_count) || 0,
      total_earnings: parseFloat(result.total_earnings) || 0,
      avg_per_trip: parseFloat(result.avg_per_trip) || 0,
      settlements,
    });
  } catch (err) { next(err); }
});

// ── GET /couriers — admin list ──
router.get('/', authenticate, isOperations, async (req, res, next) => {
  try {
    const { status, city_id, availability, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('couriers as c')
      .select('c.*', 'u.full_name', 'u.phone', 'u.email', 'ci.name_en as city_name')
      .join('users as u', 'c.user_id', 'u.id')
      .leftJoin('cities as ci', 'c.city_id', 'ci.id')
      .orderBy('c.created_at', 'desc')
      .limit(limit).offset(offset);

    if (status)       query = query.where('c.status', status);
    if (city_id)      query = query.where('c.city_id', city_id);
    if (availability) query = query.where('c.availability', availability);

    const couriers = await query;
    res.json({ couriers, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// ── POST /couriers/:id/approve ──
router.post('/:id/approve', authenticate, isOperations, async (req, res, next) => {
  try {
    await db('couriers').where({ id: req.params.id }).update({
      status: 'active',
      approved_by: req.user.id,
      approved_at: new Date(),
      updated_at: new Date(),
    });
    res.json({ message: 'Courier approved' });
  } catch (err) { next(err); }
});

module.exports = router;
