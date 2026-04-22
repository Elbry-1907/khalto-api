/**
 * Khalto — Dynamic Pricing Engine
 *
 * GET  /api/v1/pricing/calculate        — حساب السعر الديناميكي لطلب
 * GET  /api/v1/pricing/config           — إعدادات التسعير
 * PUT  /api/v1/pricing/config           — تحديث الإعدادات (admin)
 * GET  /api/v1/pricing/surge            — حالة الذروة الحالية
 * GET  /api/v1/pricing/history          — سجل تغييرات الأسعار
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const db      = require('../db');
const logger  = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');

const pricingRouter = express.Router();

// ── Surge calculation engine ──────────────────────────────
const calculateSurge = async ({ city_id, kitchen_id, country_id }) => {
  const now  = new Date();
  const hour = now.getHours();
  const day  = now.getDay(); // 0=Sun
  const isWeekend = [5, 6].includes(day); // Fri/Sat in SA

  // Peak hours: lunch 12-14, dinner 18-21
  const isPeakHour = (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21);
  const isLateNight = hour >= 22 || hour < 2;

  // Active orders in last 15 min (demand signal)
  const activeOrders = await db('orders')
    .where('created_at', '>=', new Date(Date.now() - 15 * 60 * 1000))
    .where({ status: 'awaiting_acceptance' })
    .modify(q => { if (city_id) q.where({ country_id }); })
    .count('id as c').first();

  const demandCount = parseInt(activeOrders?.c || 0);

  // Available couriers in area
  const availableCouriers = await db('couriers')
    .where({ availability: 'online', status: 'active' })
    .modify(q => { if (city_id) q.where({ city_id }); })
    .count('id as c').first();

  const courierCount = parseInt(availableCouriers?.c || 0);

  // Demand/supply ratio
  const ratio = courierCount > 0 ? demandCount / courierCount : demandCount;

  // Calculate surge multiplier
  let multiplier = 1.0;
  let reason     = 'سعر عادي';

  if (ratio > 3)       { multiplier = 1.8; reason = 'طلب مرتفع جداً 🔥'; }
  else if (ratio > 2)  { multiplier = 1.5; reason = 'طلب مرتفع 📈'; }
  else if (ratio > 1.5){ multiplier = 1.3; reason = 'ازدحام متوسط'; }

  if (isPeakHour)  multiplier = Math.max(multiplier, 1.3);
  if (isWeekend)   multiplier = Math.min(multiplier * 1.1, 2.0);
  if (isLateNight) multiplier = Math.min(multiplier * 1.2, 2.0);

  // Cap at 2x
  multiplier = Math.min(multiplier, 2.0);
  multiplier = Math.round(multiplier * 10) / 10;

  return {
    multiplier,
    is_surge:         multiplier > 1.0,
    reason,
    reason_en:        reason,
    demand_count:     demandCount,
    courier_count:    courierCount,
    is_peak_hour:     isPeakHour,
    is_weekend:       isWeekend,
    calculated_at:    now.toISOString(),
  };
};

// GET /pricing/surge
pricingRouter.get('/surge', authenticate, async (req, res, next) => {
  try {
    const { city_id, country_id } = req.query;
    const surge = await calculateSurge({ city_id, country_id });
    res.json({ surge });
  } catch (err) { next(err); }
});

// GET /pricing/calculate
pricingRouter.get('/calculate', authenticate, async (req, res, next) => {
  try {
    const { kitchen_id, subtotal, delivery_distance_km, city_id, country_id } = req.query;

    const config = await db('pricing_configs')
      .where({ country_id: country_id || null }).first() || {
        base_delivery_fee: 8,
        per_km_rate:       1.5,
        min_delivery_fee:  5,
        max_delivery_fee:  30,
        surge_enabled:     true,
        small_order_fee:   3,
        small_order_threshold: 20,
      };

    const surge    = config.surge_enabled
      ? await calculateSurge({ city_id, country_id, kitchen_id })
      : { multiplier: 1.0, is_surge: false };

    const dist     = parseFloat(delivery_distance_km || 3);
    const sub      = parseFloat(subtotal || 0);

    // Delivery fee calculation
    let deliveryFee = parseFloat(config.base_delivery_fee) +
      (dist * parseFloat(config.per_km_rate));
    deliveryFee = Math.max(deliveryFee, parseFloat(config.min_delivery_fee));
    deliveryFee = Math.min(deliveryFee, parseFloat(config.max_delivery_fee));
    deliveryFee = deliveryFee * surge.multiplier;
    deliveryFee = Math.round(deliveryFee * 10) / 10;

    // Small order fee
    const smallOrderFee = sub > 0 && sub < parseFloat(config.small_order_threshold)
      ? parseFloat(config.small_order_fee) : 0;

    res.json({
      delivery_fee:     deliveryFee,
      small_order_fee:  smallOrderFee,
      surge,
      breakdown: {
        base_fee:      parseFloat(config.base_delivery_fee),
        distance_fee:  +(dist * parseFloat(config.per_km_rate)).toFixed(2),
        surge_added:   +(deliveryFee - (parseFloat(config.base_delivery_fee) + dist * parseFloat(config.per_km_rate))).toFixed(2),
        total:         +(deliveryFee + smallOrderFee).toFixed(2),
      },
    });
  } catch (err) { next(err); }
});

// GET /pricing/config
pricingRouter.get('/config', authenticate, requireRole('super_admin','finance','operations'),
  async (req, res, next) => {
  try {
    const configs = await db('pricing_configs').orderBy('country_id');
    res.json({ configs });
  } catch (err) { next(err); }
});

// PUT /pricing/config
pricingRouter.put('/config', authenticate, requireRole('super_admin','finance'),
  async (req, res, next) => {
  try {
    const { country_id, ...fields } = req.body;
    const allowed = ['base_delivery_fee','per_km_rate','min_delivery_fee','max_delivery_fee',
      'surge_enabled','surge_max_multiplier','small_order_fee','small_order_threshold',
      'peak_hours','weekend_multiplier'];
    const data = {};
    allowed.forEach(f => { if (fields[f] !== undefined) data[f] = fields[f]; });

    const existing = await db('pricing_configs').where({ country_id: country_id || null }).first();
    let config;
    if (existing) {
      [config] = await db('pricing_configs')
        .where({ country_id: country_id || null })
        .update({ ...data, updated_at: new Date() }).returning('*');
    } else {
      [config] = await db('pricing_configs').insert({
        id: uuid(), country_id: country_id || null, ...data, created_at: new Date(),
      }).returning('*');
    }

    await db('audit_logs').insert({
      id: uuid(), user_id: req.user.id,
      action: 'Updated pricing config', module: 'pricing',
      entity_id: country_id || 'global', created_at: new Date(),
    }).catch(() => {});

    res.json({ ok: true, config });
  } catch (err) { next(err); }
});

module.exports = { pricingRouter, calculateSurge };
