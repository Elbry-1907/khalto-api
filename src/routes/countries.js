const router = require('express').Router();
const db = require('../db');

router.get('/', async (_req, res, next) => {
  try {
    const countries = await db('countries').where({ is_active: true });
    res.json({ countries });
  } catch (err) { next(err); }
});

router.get('/:code/cities', async (req, res, next) => {
  try {
    const country = await db('countries').where({ code: req.params.code.toUpperCase() }).first();
    if (!country) return res.status(404).json({ error: 'Country not found' });
    const cities = await db('cities').where({ country_id: country.id, is_active: true });
    res.json({ cities });
  } catch (err) { next(err); }
});

router.get('/:code/zones', async (req, res, next) => {
  try {
    const country = await db('countries').where({ code: req.params.code.toUpperCase() }).first();
    if (!country) return res.status(404).json({ error: 'Country not found' });
    const zones = await db('zones as z')
      .join('cities as c','z.city_id','c.id')
      .where({ 'c.country_id': country.id, 'z.is_active': true })
      .select('z.*','c.name_en as city_name');
    res.json({ zones });
  } catch (err) { next(err); }
});

module.exports = router;
