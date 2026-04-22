const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// ── Helpers ──
const genOrderNumber = () =>
  'KH-' + Math.floor(10000 + Math.random() * 90000);

const VALID_TRANSITIONS = {
  pending_payment:    ['paid', 'cancelled'],
  paid:               ['awaiting_acceptance', 'cancelled', 'refunded'],
  awaiting_acceptance:['accepted', 'cancelled'],
  accepted:           ['preparing', 'cancelled'],
  preparing:          ['ready_for_pickup', 'cancelled'],
  ready_for_pickup:   ['courier_assigned', 'picked_up'],
  courier_assigned:   ['picked_up', 'cancelled'],
  picked_up:          ['delivered'],
  delivered:          [],
  cancelled:          ['refunded'],
  refunded:           [],
};

const canTransition = (from, to) =>
  VALID_TRANSITIONS[from]?.includes(to) ?? false;

// ── POST /orders — create ──
router.post('/', authenticate, requireRole('customer'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const { kitchen_id, items, delivery_address, delivery_lat, delivery_lng,
            payment_method, coupon_code, notes, scheduled_for } = req.body;

    // Validate kitchen
    const kitchen = await trx('kitchens').where({ id: kitchen_id, status: 'active', is_open: true }).first();
    if (!kitchen) return res.status(400).json({ error: 'Kitchen not available' });

    // Validate & price items
    let subtotal = 0;
    const resolvedItems = [];
    for (const item of items) {
      const menuItem = await trx('menu_items')
        .where({ id: item.menu_item_id, kitchen_id, is_available: true }).first();
      if (!menuItem) {
        await trx.rollback();
        return res.status(400).json({ error: `Item ${item.menu_item_id} not available` });
      }
      const lineTotal = menuItem.price * item.quantity;
      subtotal += lineTotal;
      resolvedItems.push({ ...item, name_snapshot: menuItem.name_en, price_snapshot: menuItem.price, subtotal: lineTotal });
    }

    // Min order check
    if (subtotal < kitchen.min_order_amount)
      return res.status(400).json({ error: `Minimum order is ${kitchen.min_order_amount}` });

    // Coupon
    let discountAmount = 0, couponId = null;
    if (coupon_code) {
      const coupon = await trx('coupons')
        .where({ code: coupon_code, is_active: true })
        .where('valid_from', '<=', new Date())
        .where(q => q.whereNull('valid_until').orWhere('valid_until', '>=', new Date()))
        .first();
      if (coupon && subtotal >= coupon.min_order_value) {
        if (coupon.type === 'percentage') discountAmount = Math.min(subtotal * coupon.value / 100, coupon.max_discount || Infinity);
        else if (coupon.type === 'fixed_amount') discountAmount = coupon.value;
        couponId = coupon.id;
        await trx('coupons').where({ id: coupon.id }).increment('usage_count', 1);
      }
    }

    // Get country for delivery fee & tax
    const country = await trx('countries').where({ id: kitchen.country_id || req.user.country_id }).first();
    const deliveryFee = 8;
    const taxRate = parseFloat(country?.tax_rate || 0) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = parseFloat((taxableAmount * taxRate).toFixed(2));
    const totalAmount = parseFloat((taxableAmount + deliveryFee + taxAmount).toFixed(2));

    // Commission split
    const commissionRate = parseFloat(kitchen.commission_rate) / 100;
    const platformCommission = parseFloat((subtotal * commissionRate).toFixed(2));
    const chefPayout = parseFloat((subtotal - platformCommission - discountAmount).toFixed(2));
    const courierPayout = deliveryFee * 0.85;

    const orderId = uuid();
    const orderNumber = genOrderNumber();

    await trx('orders').insert({
      id: orderId,
      order_number: orderNumber,
      customer_id: req.user.id,
      kitchen_id,
      country_id: kitchen.country_id || req.user.country_id,
      delivery_address,
      delivery_lat,
      delivery_lng,
      subtotal,
      delivery_fee: deliveryFee,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency_code: country?.currency_code || 'SAR',
      platform_commission: platformCommission,
      chef_payout: chefPayout,
      courier_payout: courierPayout,
      status: 'pending_payment',
      coupon_id: couponId,
      notes,
      scheduled_for: scheduled_for || null,
    });

    // Insert order items
    await trx('order_items').insert(resolvedItems.map(i => ({
      id: uuid(),
      order_id: orderId,
      menu_item_id: i.menu_item_id,
      name_snapshot: i.name_snapshot,
      price_snapshot: i.price_snapshot,
      quantity: i.quantity,
      options: i.options ? JSON.stringify(i.options) : null,
      notes: i.notes,
      subtotal: i.subtotal,
    })));

    // Status log
    await trx('order_status_log').insert({
      id: uuid(), order_id: orderId,
      from_status: null, to_status: 'pending_payment',
      changed_by: req.user.id,
    });

    await trx.commit();

    const order = await db('orders').where({ id: orderId }).first();
    res.status(201).json({ order });
  } catch (err) { await trx.rollback(); next(err); }
});

// ── GET /orders — list for current user ──
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('orders as o')
      .select('o.*', 'k.name_en as kitchen_name', 'k.logo_url as kitchen_logo')
      .join('kitchens as k', 'o.kitchen_id', 'k.id')
      .orderBy('o.created_at', 'desc')
      .limit(limit).offset(offset);

    const role = req.user.role;
    if (role === 'customer')    query = query.where('o.customer_id', req.user.id);
    else if (role === 'chef')   query = query.whereIn('o.kitchen_id',
      db('kitchens').where('user_id', req.user.id).select('id'));
    else if (role === 'courier') query = query.where('o.courier_id',
      db('couriers').where('user_id', req.user.id).select('id').first());

    if (status) query = query.where('o.status', status);

    const orders = await query;
    res.json({ orders, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// ── GET /orders/:id ──
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await db('orders as o')
      .select('o.*',
        'k.name_en as kitchen_name', 'k.logo_url as kitchen_logo', 'k.phone as kitchen_phone',
        'u.full_name as customer_name', 'u.phone as customer_phone')
      .join('kitchens as k', 'o.kitchen_id', 'k.id')
      .join('users as u', 'o.customer_id', 'u.id')
      .where('o.id', req.params.id)
      .first();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = await db('order_items').where({ order_id: order.id });
    const statusLog = await db('order_status_log')
      .where({ order_id: order.id }).orderBy('created_at', 'asc');

    res.json({ order: { ...order, items, status_log: statusLog } });
  } catch (err) { next(err); }
});

// ── PATCH /orders/:id/status — transition status ──
router.patch('/:id/status', authenticate, async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const { status: newStatus, note } = req.body;
    const order = await trx('orders').where({ id: req.params.id }).first();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!canTransition(order.status, newStatus))
      return res.status(400).json({ error: `Cannot transition from ${order.status} to ${newStatus}` });

    // Permission check per role
    const role = req.user.role;
    const chefAllowed   = ['accepted', 'preparing', 'ready_for_pickup'];
    const courierAllowed = ['picked_up', 'delivered'];
    const adminAllowed   = Object.keys(VALID_TRANSITIONS);

    if (role === 'chef'    && !chefAllowed.includes(newStatus))
      return res.status(403).json({ error: 'Not allowed' });
    if (role === 'courier' && !courierAllowed.includes(newStatus))
      return res.status(403).json({ error: 'Not allowed' });
    if (role === 'customer' && newStatus !== 'cancelled')
      return res.status(403).json({ error: 'Not allowed' });

    // Timestamp field
    const tsMap = {
      accepted: 'accepted_at', preparing: null,
      ready_for_pickup: 'prepared_at', picked_up: 'picked_up_at',
      delivered: 'delivered_at', cancelled: 'cancelled_at',
    };
    const updates = { status: newStatus, updated_at: new Date() };
    if (tsMap[newStatus]) updates[tsMap[newStatus]] = new Date();
    if (newStatus === 'cancelled') { updates.cancel_reason = note; updates.cancelled_by = req.user.id; }

    await trx('orders').where({ id: order.id }).update(updates);
    await trx('order_status_log').insert({
      id: uuid(), order_id: order.id,
      from_status: order.status, to_status: newStatus,
      changed_by: req.user.id, note,
    });

    await trx.commit();

    // Real-time push via socket
    req.io?.to(`order_${order.id}`).emit('order:status', { order_id: order.id, status: newStatus });

    res.json({ order_id: order.id, status: newStatus });
  } catch (err) { await trx.rollback(); next(err); }
});

// ── POST /orders/:id/rate ──
router.post('/:id/rate', authenticate, requireRole('customer'), async (req, res, next) => {
  try {
    const { kitchen_rating, courier_rating, chef_rating, comment } = req.body;
    const order = await db('orders').where({ id: req.params.id, customer_id: req.user.id, status: 'delivered' }).first();
    if (!order) return res.status(404).json({ error: 'Order not found or not delivered' });

    await db('orders').where({ id: order.id }).update({
      customer_rating: kitchen_rating,
      chef_rating,
      courier_rating,
      customer_review: comment,
    });

    // Update kitchen average rating
    if (kitchen_rating) {
      const { avg } = await db('orders')
        .where({ kitchen_id: order.kitchen_id }).whereNotNull('customer_rating')
        .avg('customer_rating as avg').first();
      const cnt = await db('orders').where({ kitchen_id: order.kitchen_id }).whereNotNull('customer_rating').count('* as cnt').first();
      await db('kitchens').where({ id: order.kitchen_id }).update({ rating: parseFloat(avg).toFixed(2), rating_count: cnt.cnt });
    }

    res.json({ message: 'Rating submitted' });
  } catch (err) { next(err); }
});

module.exports = router;
