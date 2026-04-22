const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id })
      .first('id','role','email','phone','full_name','avatar_url','lang_preference','country_id','is_verified','created_at');
    res.json({ user });
  } catch (err) { next(err); }
});

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const allowed = ['full_name','avatar_url','lang_preference','country_id'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date();
    const [user] = await db('users').where({ id: req.user.id }).update(updates)
      .returning('id','role','email','phone','full_name','avatar_url','lang_preference');
    res.json({ user });
  } catch (err) { next(err); }
});

router.get('/me/addresses', authenticate, async (req, res, next) => {
  try {
    const addresses = await db('addresses').where({ user_id: req.user.id });
    res.json({ addresses });
  } catch (err) { next(err); }
});

router.post('/me/addresses', authenticate, async (req, res, next) => {
  try {
    const { label, address_line, city_id, zone_id, lat, lng, is_default } = req.body;
    if (is_default) await db('addresses').where({ user_id: req.user.id }).update({ is_default: false });
    const [address] = await db('addresses').insert({
      id: uuid(), user_id: req.user.id, label, address_line,
      city_id, zone_id, lat, lng, is_default: !!is_default,
    }).returning('*');
    res.status(201).json({ address });
  } catch (err) { next(err); }
});

router.patch('/me/addresses/:id', authenticate, async (req, res, next) => {
  try {
    const addr = await db('addresses').where({ id: req.params.id, user_id: req.user.id }).first();
    if (!addr) return res.status(404).json({ error: 'Not found' });
    if (req.body.is_default) await db('addresses').where({ user_id: req.user.id }).update({ is_default: false });
    const [updated] = await db('addresses').where({ id: req.params.id }).update(req.body).returning('*');
    res.json({ address: updated });
  } catch (err) { next(err); }
});

router.delete('/me/addresses/:id', authenticate, async (req, res, next) => {
  try {
    await db('addresses').where({ id: req.params.id, user_id: req.user.id }).del();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me/wallet', authenticate, async (req, res, next) => {
  try {
    const wallet = await db('wallets').where({ user_id: req.user.id }).first();
    const transactions = await db('wallet_transactions')
      .where({ wallet_id: wallet?.id }).orderBy('created_at', 'desc').limit(30);
    res.json({ wallet, transactions });
  } catch (err) { next(err); }
});

module.exports = router;
