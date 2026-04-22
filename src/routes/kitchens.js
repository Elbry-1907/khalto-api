// ============================================================
// src/routes/kitchens.js
// ============================================================
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole, isAdmin, isOperations } = require('../middleware/auth');

// GET /kitchens — public browse
router.get('/', async (req, res, next) => {
  try {
    const { city_id, category, search, lat, lng, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('kitchens as k')
      .select('k.id','k.name_en','k.name_ar','k.logo_url','k.banner_url',
        'k.rating','k.rating_count','k.avg_prep_time','k.delivery_radius_km',
        'k.min_order_amount','k.is_open','k.city_id')
      .where({ 'k.status': 'active' })
      .orderBy('k.rating', 'desc')
      .limit(limit).offset(offset);

    if (city_id)  query = query.where('k.city_id', city_id);
    if (search)   query = query.whereILike('k.name_en', `%${search}%`);

    const kitchens = await query;
    res.json({ kitchens, page: +page, limit: +limit });
  } catch (err) { next(err); }
});

// GET /kitchens/:id
router.get('/:id', async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'Kitchen not found' });
    const schedules = await db('kitchen_schedules').where({ kitchen_id: kitchen.id, is_active: true });
    res.json({ kitchen: { ...kitchen, schedules } });
  } catch (err) { next(err); }
});

// POST /kitchens — chef registers kitchen
router.post('/', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const { name_en, name_ar, bio_en, bio_ar, city_id, lat, lng, min_order_amount } = req.body;
    const [kitchen] = await db('kitchens').insert({
      id: uuid(), user_id: req.user.id, name_en, name_ar, bio_en, bio_ar,
      city_id, lat, lng, min_order_amount, status: 'pending_review',
    }).returning('*');
    res.status(201).json({ kitchen });
  } catch (err) { next(err); }
});

// PATCH /kitchens/:id — update
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const kitchen = await db('kitchens').where({ id: req.params.id }).first();
    if (!kitchen) return res.status(404).json({ error: 'Not found' });
    // chef can only update their own
    if (req.user.role === 'chef') {
      if (kitchen.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }
    const allowed = ['name_en','name_ar','bio_en','bio_ar','logo_url','banner_url',
      'is_open','avg_prep_time','min_order_amount'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date();
    const [updated] = await db('kitchens').where({ id: req.params.id }).update(updates).returning('*');
    res.json({ kitchen: updated });
  } catch (err) { next(err); }
});

// POST /kitchens/:id/approve — admin
router.post('/:id/approve', authenticate, isOperations, async (req, res, next) => {
  try {
    await db('kitchens').where({ id: req.params.id }).update({
      status: 'active', approved_by: req.user.id, approved_at: new Date()
    });
    res.json({ message: 'Kitchen approved' });
  } catch (err) { next(err); }
});

module.exports = router;
