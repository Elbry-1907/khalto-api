const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// helper: verify chef owns kitchen
const chefOwnsKitchen = async (userId, kitchenId) => {
  const k = await db('kitchens').where({ id: kitchenId, user_id: userId }).first('id');
  return !!k;
};

// ── GET /menu/kitchens/:kitchen_id — public full menu ──
router.get('/kitchens/:kitchen_id', async (req, res, next) => {
  try {
    const kitchen = await db('kitchens')
      .where({ id: req.params.kitchen_id, status: 'active' }).first();
    if (!kitchen) return res.status(404).json({ error: 'Kitchen not found' });

    const categories = await db('menu_categories')
      .where({ kitchen_id: kitchen.id, is_active: true })
      .orderBy('sort_order');

    const items = await db('menu_items')
      .where({ kitchen_id: kitchen.id })
      .orderBy('sort_order');

    const options = await db('menu_options')
      .whereIn('item_id', items.map(i => i.id));

    const itemsWithOptions = items.map(item => ({
      ...item,
      options: options.filter(o => o.item_id === item.id),
    }));

    const result = categories.map(cat => ({
      ...cat,
      items: itemsWithOptions.filter(i => i.category_id === cat.id),
    }));

    res.json({ categories: result });
  } catch (err) { next(err); }
});

// ── POST /menu/categories ──
router.post('/categories', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const { kitchen_id, name_en, name_ar, sort_order = 0 } = req.body;
    if (!await chefOwnsKitchen(req.user.id, kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });
    const [cat] = await db('menu_categories')
      .insert({ id: uuid(), kitchen_id, name_en, name_ar, sort_order })
      .returning('*');
    res.status(201).json({ category: cat });
  } catch (err) { next(err); }
});

// ── PATCH /menu/categories/:id ──
router.patch('/categories/:id', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const cat = await db('menu_categories').where({ id: req.params.id }).first();
    if (!cat) return res.status(404).json({ error: 'Not found' });
    if (!await chefOwnsKitchen(req.user.id, cat.kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });
    const [updated] = await db('menu_categories')
      .where({ id: req.params.id })
      .update({ ...req.body })
      .returning('*');
    res.json({ category: updated });
  } catch (err) { next(err); }
});

// ── DELETE /menu/categories/:id ──
router.delete('/categories/:id', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const cat = await db('menu_categories').where({ id: req.params.id }).first();
    if (!cat) return res.status(404).json({ error: 'Not found' });
    if (!await chefOwnsKitchen(req.user.id, cat.kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });
    await db('menu_categories').where({ id: req.params.id }).del();
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── POST /menu/items ──
router.post('/items', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const { kitchen_id, category_id, name_en, name_ar, description_en, description_ar,
            price, image_url, prep_time_min = 20, sort_order = 0, options = [] } = req.body;

    if (!await chefOwnsKitchen(req.user.id, kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });

    const itemId = uuid();
    const [item] = await db('menu_items').insert({
      id: itemId, kitchen_id, category_id, name_en, name_ar,
      description_en, description_ar, price, image_url,
      prep_time_min, sort_order,
    }).returning('*');

    if (options.length) {
      await db('menu_options').insert(
        options.map(o => ({ id: uuid(), item_id: itemId, ...o }))
      );
    }

    res.status(201).json({ item });
  } catch (err) { next(err); }
});

// ── PATCH /menu/items/:id ──
router.patch('/items/:id', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const item = await db('menu_items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!await chefOwnsKitchen(req.user.id, item.kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });

    const allowed = ['name_en','name_ar','description_en','description_ar',
      'price','image_url','prep_time_min','is_available','is_featured',
      'sort_order','category_id'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date();

    const [updated] = await db('menu_items')
      .where({ id: req.params.id }).update(updates).returning('*');
    res.json({ item: updated });
  } catch (err) { next(err); }
});

// ── PATCH /menu/items/:id/availability ──
router.patch('/items/:id/availability', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const item = await db('menu_items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!await chefOwnsKitchen(req.user.id, item.kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });
    const { is_available } = req.body;
    await db('menu_items').where({ id: req.params.id }).update({ is_available, updated_at: new Date() });
    res.json({ item_id: req.params.id, is_available });
  } catch (err) { next(err); }
});

// ── DELETE /menu/items/:id ──
router.delete('/items/:id', authenticate, requireRole('chef'), async (req, res, next) => {
  try {
    const item = await db('menu_items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!await chefOwnsKitchen(req.user.id, item.kitchen_id))
      return res.status(403).json({ error: 'Forbidden' });
    await db('menu_items').where({ id: req.params.id }).del();
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
