const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { code, type, value, min_order_amount = 0, max_discount,
            country_id, kitchen_id, usage_limit, per_user_limit = 1,
            valid_from, valid_until } = req.body;
    const existing = await db('coupons').where({ code: code.toUpperCase() }).first();
    if (existing) return res.status(409).json({ error: 'Code already exists' });
    const [coupon] = await db('coupons').insert({
      id: uuid(), code: code.toUpperCase(), type, value,
      min_order_amount, max_discount, country_id, kitchen_id,
      usage_limit, per_user_limit, valid_from, valid_until,
      created_by: req.user.id,
    }).returning('*');
    res.status(201).json({ coupon });
  } catch (err) { next(err); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const coupons = await db('coupons').orderBy('created_at', 'desc');
    res.json({ coupons });
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const allowed = ['value','min_order_amount','usage_limit','valid_until','is_active'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const [coupon] = await db('coupons').where({ id: req.params.id }).update(updates).returning('*');
    res.json({ coupon });
  } catch (err) { next(err); }
});

router.post('/validate', authenticate, async (req, res, next) => {
  try {
    const { code, order_total } = req.body;
    const coupon = await db('coupons')
      .where({ code: code?.toUpperCase(), is_active: true })
      .where('valid_from', '<=', new Date())
      .where(q => q.whereNull('valid_until').orWhere('valid_until', '>=', new Date()))
      .first();
    if (!coupon) return res.status(404).json({ valid: false, error: 'Invalid or expired coupon' });
    if (order_total < coupon.min_order_amount)
      return res.status(400).json({ valid: false, error: `Min order: ${coupon.min_order_amount}` });
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit)
      return res.status(400).json({ valid: false, error: 'Usage limit reached' });
    const used = await db('coupon_redemptions')
      .where({ coupon_id: coupon.id, user_id: req.user.id }).count('* as cnt').first();
    if (parseInt(used.cnt) >= coupon.per_user_limit)
      return res.status(400).json({ valid: false, error: 'Already used' });
    let discount = 0;
    if (coupon.type === 'percentage') discount = Math.min(order_total * coupon.value / 100, coupon.max_discount || Infinity);
    else if (coupon.type === 'fixed_amount') discount = coupon.value;
    res.json({ valid: true, coupon, discount: parseFloat(discount.toFixed(2)) });
  } catch (err) { next(err); }
});

router.post('/gifts', authenticate, async (req, res, next) => {
  try {
    const { recipient_phone, amount, message } = req.body;
    const wallet = await db('wallets').where({ user_id: req.user.id }).first();
    if (!wallet || wallet.balance < amount)
      return res.status(400).json({ error: 'Insufficient balance' });
    const code = 'GIFT-' + uuid().split('-')[0].toUpperCase();
    const [gift] = await db('gift_cards').insert({
      id: uuid(), sender_id: req.user.id, recipient_phone,
      amount, currency_code: wallet.currency, message, code,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning('*');
    await db('wallets').where({ user_id: req.user.id }).decrement('balance', amount);
    res.status(201).json({ gift });
  } catch (err) { next(err); }
});

module.exports = router;

