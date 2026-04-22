/**
 * Khalto — Commission Engine Routes
 *
 * GET    /api/v1/commission/config          — إعدادات العمولة
 * PUT    /api/v1/commission/config          — تحديث الإعدادات
 * GET    /api/v1/commission/rules           — قواعد العمولة
 * POST   /api/v1/commission/rules           — قاعدة جديدة
 * PATCH  /api/v1/commission/rules/:id       — تحديث قاعدة
 * DELETE /api/v1/commission/rules/:id       — حذف قاعدة
 * POST   /api/v1/commission/calculate/chef  — حساب دفعة الشيف
 * POST   /api/v1/commission/calculate/courier — حساب دفعة المندوب
 * POST   /api/v1/commission/calculate/order — حساب كامل للطلب
 * GET    /api/v1/commission/stats           — إحصائيات العمولة
 * GET    /api/v1/commission/history         — سجل التغييرات
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');

// ── Default commission config ─────────────────────────────
const DEFAULTS = {
  chef_commission_pct:       15,   // % from order subtotal
  payment_fee_pct:           2.5,  // % payment gateway fee
  vat_on_commission_pct:     15,   // % VAT on commission (SA)
  courier_share_pct:         80,   // % of delivery fee to courier
  distance_bonus_per_km:     0.50, // SAR per km
  peak_multiplier:           1.5,  // × during peak hours
  peak_hours:                [[12,14],[18,21]], // [start,end]
  min_courier_payout:        5.0,  // SAR minimum per trip
  weekly_incentive_trips:    50,   // trips needed for bonus
  weekly_incentive_bonus:    30.0, // SAR bonus
};

// ── Check if current time is peak ────────────────────────
const isPeakHour = (peakHours = DEFAULTS.peak_hours) => {
  const h = new Date().getHours();
  return peakHours.some(([start, end]) => h >= start && h < end);
};

// ═══════════════════════════════════════════════════════════
// GET /config — إعدادات العمولة
// ═══════════════════════════════════════════════════════════
router.get('/config', authenticate, requireRole('super_admin','finance','operations'), async (req, res, next) => {
  try {
    const { country_id } = req.query;
    const q = db('commission_configs').orderBy('country_id');
    const configs = country_id ? await q.where({ country_id }) : await q;

    if (!configs.length) return res.json({ config: DEFAULTS });
    res.json({ config: configs[0], all: configs });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// PUT /config
// ═══════════════════════════════════════════════════════════
router.put('/config', authenticate, requireRole('super_admin','finance'), async (req, res, next) => {
  try {
    const { country_id, ...fields } = req.body;
    const allowed = ['chef_commission_pct','payment_fee_pct','vat_on_commission_pct',
      'courier_share_pct','distance_bonus_per_km','peak_multiplier','peak_hours',
      'min_courier_payout','weekly_incentive_trips','weekly_incentive_bonus'];
    const data = {};
    allowed.forEach(f => { if (fields[f] !== undefined) data[f] = fields[f]; });

    const existing = await db('commission_configs').where({ country_id: country_id||null }).first();
    let config;
    if (existing) {
      [config] = await db('commission_configs')
        .where({ country_id: country_id||null })
        .update({ ...data, updated_at: new Date(), updated_by: req.user.id })
        .returning('*');
    } else {
      [config] = await db('commission_configs').insert({
        id: uuid(), country_id: country_id||null, ...data,
        created_at: new Date(), updated_by: req.user.id,
      }).returning('*');
    }

    // Audit log
    await db('audit_logs').insert({
      id: uuid(), user_id: req.user.id,
      action: 'Updated commission config',
      module: 'commission', entity_id: country_id||'global',
      created_at: new Date(),
    }).catch(() => {});

    res.json({ ok: true, config });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /rules
// ═══════════════════════════════════════════════════════════
router.get('/rules', authenticate, requireRole('super_admin','finance','operations'), async (req, res, next) => {
  try {
    const rules = await db('commission_rules')
      .where({ is_active: true }).orderBy('priority','asc');
    res.json({ rules });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /rules
// ═══════════════════════════════════════════════════════════
router.post('/rules', authenticate, requireRole('super_admin','finance'), async (req, res, next) => {
  try {
    const { name, rule_type, value, unit, condition, country_id, priority=10, valid_until } = req.body;
    if (!name || !rule_type || value === undefined) {
      return res.status(400).json({ error: 'name, rule_type, value مطلوبة' });
    }

    const [rule] = await db('commission_rules').insert({
      id: uuid(), name, rule_type, value, unit: unit||'percentage',
      condition: condition||null, country_id: country_id||null,
      priority, is_active: true,
      valid_until: valid_until ? new Date(valid_until) : null,
      created_by: req.user.id, created_at: new Date(),
    }).returning('*');

    res.status(201).json({ rule });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// PATCH /rules/:id
// ═══════════════════════════════════════════════════════════
router.patch('/rules/:id', authenticate, requireRole('super_admin','finance'), async (req, res, next) => {
  try {
    const allowed = ['name','value','unit','condition','is_active','priority','valid_until'];
    const upd = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) upd[f] = req.body[f]; });
    upd.updated_at = new Date();
    const [rule] = await db('commission_rules').where({ id:req.params.id }).update(upd).returning('*');
    if (!rule) return res.status(404).json({ error: 'القاعدة غير موجودة' });
    res.json({ rule });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// DELETE /rules/:id
// ═══════════════════════════════════════════════════════════
router.delete('/rules/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await db('commission_rules').where({ id:req.params.id }).update({ is_active:false });
    res.json({ ok:true });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /calculate/chef — حساب دفعة الشيف
// ═══════════════════════════════════════════════════════════
router.post('/calculate/chef', authenticate, async (req, res, next) => {
  try {
    const { order_total, kitchen_id, country_id, category } = req.body;
    if (!order_total) return res.status(400).json({ error: 'order_total مطلوب' });

    const total = parseFloat(order_total);

    // Load config
    const config = await db('commission_configs')
      .where({ country_id: country_id||null }).first() || DEFAULTS;

    // Load applicable rules (priority order)
    let commPct = Number(config.chef_commission_pct || DEFAULTS.chef_commission_pct);
    const rules = await db('commission_rules')
      .where({ is_active:true, rule_type:'chef_commission' })
      .modify(q => { if (country_id) q.where(b => b.whereNull('country_id').orWhere({ country_id })); })
      .orderBy('priority','asc');

    // Apply first matching rule
    let appliedRule = null;
    if (kitchen_id) {
      const kitchen = await db('kitchens').where({ id:kitchen_id }).first('rating','created_at');
      for (const rule of rules) {
        if (rule.condition) {
          try {
            const cond = rule.condition;
            // Evaluate simple conditions
            if (cond.includes('rating') && kitchen?.rating) {
              const [op, val] = cond.replace('rating','').trim().split(/\s+/);
              const rVal = parseFloat(val);
              if ((op==='>=' && kitchen.rating >= rVal) ||
                  (op==='>' && kitchen.rating > rVal) ||
                  (op==='<' && kitchen.rating < rVal)) {
                commPct = rule.unit === 'percentage' ? Number(rule.value) : commPct;
                appliedRule = rule;
                break;
              }
            }
            if (cond.includes('category') && category && cond.includes(category)) {
              commPct = Number(rule.value);
              appliedRule = rule;
              break;
            }
          } catch (_) {}
        }
      }
    }

    const commission   = total * (commPct / 100);
    const paymentFee   = total * (Number(config.payment_fee_pct||DEFAULTS.payment_fee_pct) / 100);
    const vatOnComm    = commission * (Number(config.vat_on_commission_pct||DEFAULTS.vat_on_commission_pct) / 100);
    const net          = total - commission - paymentFee - vatOnComm;

    res.json({
      breakdown: {
        order_total:     total,
        commission_pct:  commPct,
        commission:      +commission.toFixed(2),
        payment_fee:     +paymentFee.toFixed(2),
        vat_on_commission: +vatOnComm.toFixed(2),
        chef_net:        +Math.max(0, net).toFixed(2),
      },
      applied_rule: appliedRule?.name || 'default',
      currency: 'SAR',
    });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /calculate/courier — حساب دفعة المندوب
// ═══════════════════════════════════════════════════════════
router.post('/calculate/courier', authenticate, async (req, res, next) => {
  try {
    const { delivery_fee, distance_km, country_id, courier_id, is_peak } = req.body;
    if (!delivery_fee) return res.status(400).json({ error: 'delivery_fee مطلوب' });

    const fee  = parseFloat(delivery_fee);
    const dist = parseFloat(distance_km || 0);

    const config = await db('commission_configs')
      .where({ country_id: country_id||null }).first() || DEFAULTS;

    const sharePct       = Number(config.courier_share_pct || DEFAULTS.courier_share_pct) / 100;
    const distBonus      = dist * Number(config.distance_bonus_per_km || DEFAULTS.distance_bonus_per_km);
    const peakMultiplier = (is_peak ?? isPeakHour(config.peak_hours || DEFAULTS.peak_hours))
                           ? Number(config.peak_multiplier || DEFAULTS.peak_multiplier) : 1;
    const gross          = fee + distBonus;
    const platformCut    = gross * (1 - sharePct);
    const peakBonus      = peakMultiplier > 1 ? (gross * sharePct * (peakMultiplier - 1)) : 0;
    const minPayout      = Number(config.min_courier_payout || DEFAULTS.min_courier_payout);
    const net            = Math.max(minPayout, gross - platformCut + peakBonus);

    // Check weekly incentive progress
    let weeklyProgress = null;
    if (courier_id) {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const tripCount = await db('orders')
        .where({ status:'delivered' })
        .where('updated_at', '>=', weekStart)
        .whereExists(
          db('couriers').where({ user_id: courier_id }).select('id')
        ).count('id as c').first();
      const trips    = parseInt(tripCount?.c||0);
      const target   = Number(config.weekly_incentive_trips || DEFAULTS.weekly_incentive_trips);
      const bonus    = Number(config.weekly_incentive_bonus || DEFAULTS.weekly_incentive_bonus);
      weeklyProgress = { trips, target, remaining: Math.max(0, target-trips), bonus_amount: bonus };
    }

    res.json({
      breakdown: {
        delivery_fee:    +fee.toFixed(2),
        distance_bonus:  +distBonus.toFixed(2),
        gross:           +gross.toFixed(2),
        platform_cut:    +platformCut.toFixed(2),
        peak_bonus:      +peakBonus.toFixed(2),
        courier_net:     +net.toFixed(2),
      },
      is_peak:         peakMultiplier > 1,
      peak_multiplier: peakMultiplier,
      min_guaranteed:  minPayout,
      weekly_incentive: weeklyProgress,
      currency: 'SAR',
    });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /calculate/order — حساب كامل لطلب
// ═══════════════════════════════════════════════════════════
router.post('/calculate/order', authenticate, async (req, res, next) => {
  try {
    const {
      subtotal, delivery_fee, discount, payment_method,
      kitchen_id, courier_id, country_id, distance_km,
    } = req.body;

    const sub  = parseFloat(subtotal || 0);
    const dfee = parseFloat(delivery_fee || 0);
    const disc = parseFloat(discount || 0);
    const total = sub + dfee - disc;

    const [chefRes, courierRes] = await Promise.all([
      fetch(`http://localhost:${process.env.PORT||3000}/api/v1/commission/calculate/chef`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization },
        body: JSON.stringify({ order_total: sub, kitchen_id, country_id }),
      }).then(r => r.json()).catch(() => null),
      fetch(`http://localhost:${process.env.PORT||3000}/api/v1/commission/calculate/courier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization },
        body: JSON.stringify({ delivery_fee: dfee, distance_km, courier_id, country_id }),
      }).then(r => r.json()).catch(() => null),
    ]);

    const platformRevenue = (chefRes?.breakdown?.commission||0) + (total * 0.025);

    res.json({
      order: { subtotal: sub, delivery_fee: dfee, discount: disc, total },
      chef:    chefRes?.breakdown || null,
      courier: courierRes?.breakdown || null,
      platform: {
        commission: +(chefRes?.breakdown?.commission||0).toFixed(2),
        payment_fee: +(total * 0.025).toFixed(2),
        total_revenue: +platformRevenue.toFixed(2),
      },
      currency: 'SAR',
    });
  } catch(err){ next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /stats
// ═══════════════════════════════════════════════════════════
router.get('/stats', authenticate, requireRole('super_admin','finance'), async (req, res, next) => {
  try {
    const { period='month', country_id } = req.query;
    const days = period==='week' ? 7 : period==='year' ? 365 : 30;
    const from = new Date(Date.now() - days*86400000);

    let q = db('orders').where({ status:'delivered' }).where('updated_at','>=',from);
    if (country_id) q = q.where({ country_id });

    const [stats] = await q.select(
      db.raw('COUNT(*) as order_count'),
      db.raw('SUM(subtotal) as total_subtotal'),
      db.raw('SUM(commission_amount) as total_commission'),
      db.raw('SUM(delivery_fee) as total_delivery'),
      db.raw('SUM(total_amount) as gmv'),
    );

    res.json({ period, stats: stats||{}, currency:'SAR' });
  } catch(err){ next(err); }
});

module.exports = router;
