/**
 * Khalto — Loyalty, Wallet, Referral & Scheduled Orders
 *
 * LOYALTY  /api/v1/loyalty/...
 * WALLET   /api/v1/wallet/...
 * REFERRAL /api/v1/referral/...
 * SCHEDULE /api/v1/orders/schedule (added to orders route)
 */

const express  = require('express');
const { v4: uuid } = require('uuid');
const db       = require('../db');
const logger   = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { notify } = require('../services/push.service');
const { sms }    = require('../services/sms.service');

// ══════════════════════════════════════════════════════════
// LOYALTY SYSTEM — نظام النقاط والولاء
// ══════════════════════════════════════════════════════════
const loyaltyRouter = express.Router();

// Tier thresholds
const TIERS = [
  { name: 'bronze', name_ar: 'برونزي 🥉', min: 0,    points_per_sar: 1,   discount_pct: 0  },
  { name: 'silver', name_ar: 'فضي 🥈',    min: 500,  points_per_sar: 1.5, discount_pct: 5  },
  { name: 'gold',   name_ar: 'ذهبي 🥇',   min: 1500, points_per_sar: 2,   discount_pct: 8  },
  { name: 'vip',    name_ar: 'VIP 💎',     min: 5000, points_per_sar: 3,   discount_pct: 12 },
];

const getTier = (points) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
};

const getNextTier = (points) => {
  for (const tier of TIERS) {
    if (points < tier.min) return tier;
  }
  return null;
};

// GET /loyalty — نقاطي وتيري
loyaltyRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const loyalty = await db('loyalty_accounts').where({ user_id: req.user.id }).first();
    if (!loyalty) {
      // Create on first access
      const [newAcc] = await db('loyalty_accounts').insert({
        id: uuid(), user_id: req.user.id,
        points: 0, total_earned: 0, tier: 'bronze', created_at: new Date(),
      }).returning('*');
      return res.json({ loyalty: { ...newAcc, tier_info: TIERS[0], next_tier: TIERS[1] } });
    }

    const tier     = getTier(loyalty.points);
    const nextTier = getNextTier(loyalty.points);
    const history  = await db('loyalty_transactions')
      .where({ user_id: req.user.id }).orderBy('created_at','desc').limit(20);

    res.json({
      loyalty: {
        ...loyalty,
        tier_info:      tier,
        next_tier:      nextTier,
        points_to_next: nextTier ? nextTier.min - loyalty.points : 0,
        progress_pct:   nextTier
          ? Math.round(((loyalty.points - tier.min) / (nextTier.min - tier.min)) * 100)
          : 100,
      },
      history,
    });
  } catch (err) { next(err); }
});

// POST /loyalty/earn — كسب نقاط (يُستدعى داخلياً عند اكتمال الطلب)
loyaltyRouter.post('/earn', authenticate, async (req, res, next) => {
  try {
    const { order_id, order_total } = req.body;
    const userId = req.user.id;

    const loyalty = await db('loyalty_accounts').where({ user_id: userId }).first();
    const tier    = getTier(loyalty?.points || 0);
    const earned  = Math.floor(order_total * tier.points_per_sar);

    if (!loyalty) {
      await db('loyalty_accounts').insert({
        id: uuid(), user_id: userId, points: earned,
        total_earned: earned, tier: 'bronze', created_at: new Date(),
      });
    } else {
      const newPoints = loyalty.points + earned;
      const newTier   = getTier(newPoints).name;
      const tierUp    = newTier !== loyalty.tier;

      await db('loyalty_accounts').where({ user_id: userId }).update({
        points: newPoints, total_earned: loyalty.total_earned + earned,
        tier: newTier, updated_at: new Date(),
      });

      if (tierUp) {
        const tierInfo = getTier(newPoints);
        await notify.sendToUser?.(userId, {
          titleAr: `🎉 ترقية! أنت الآن ${tierInfo.name_ar}`,
          titleEn: `🎉 Level Up! You're now ${tierInfo.name}`,
          bodyAr:  `استمتع بـ ${tierInfo.discount_pct}٪ خصم على طلباتك القادمة`,
          bodyEn:  `Enjoy ${tierInfo.discount_pct}% off on your next orders`,
          data: { type: 'loyalty_tier_up', tier: newTier },
          lang: req.user.lang_preference || 'ar',
        }).catch(() => {});
      }
    }

    await db('loyalty_transactions').insert({
      id: uuid(), user_id: userId, order_id,
      type: 'earn', points: earned, description: `طلب #${order_id?.slice(0,8)}`,
      created_at: new Date(),
    });

    logger.info('Loyalty points earned', { userId, earned, order_id });
    res.json({ ok: true, points_earned: earned });
  } catch (err) { next(err); }
});

// POST /loyalty/redeem — استخدام النقاط
loyaltyRouter.post('/redeem', authenticate, async (req, res, next) => {
  try {
    const { points_to_redeem, order_id } = req.body;
    if (!points_to_redeem || points_to_redeem < 50) {
      return res.status(400).json({ error: 'الحد الأدنى للاستبدال 50 نقطة' });
    }

    const loyalty = await db('loyalty_accounts').where({ user_id: req.user.id }).first();
    if (!loyalty || loyalty.points < points_to_redeem) {
      return res.status(400).json({ error: 'رصيد النقاط غير كافٍ' });
    }

    // 1 point = 0.10 SAR
    const discount = +(points_to_redeem * 0.10).toFixed(2);

    await db('loyalty_accounts').where({ user_id: req.user.id }).update({
      points: loyalty.points - points_to_redeem, updated_at: new Date(),
    });

    await db('loyalty_transactions').insert({
      id: uuid(), user_id: req.user.id, order_id: order_id || null,
      type: 'redeem', points: -points_to_redeem,
      description: `استبدال نقاط بخصم SAR ${discount}`,
      created_at: new Date(),
    });

    res.json({ ok: true, points_redeemed: points_to_redeem, discount_sar: discount });
  } catch (err) { next(err); }
});

// GET /loyalty/leaderboard — لوحة المتصدرين (تشجيعية)
loyaltyRouter.get('/leaderboard', authenticate, async (req, res, next) => {
  try {
    const top = await db('loyalty_accounts as l')
      .join('users as u', 'u.id', 'l.user_id')
      .where('l.tier', '!=', 'bronze')
      .orderBy('l.points', 'desc')
      .limit(10)
      .select('u.full_name', 'l.points', 'l.tier');
    // Mask names for privacy
    const masked = top.map(r => ({
      ...r,
      full_name: r.full_name?.split(' ')[0] + ' ' + (r.full_name?.split(' ')[1]?.[0] || '') + '.',
    }));
    res.json({ leaderboard: masked });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// WALLET — محفظة رقمية
// ══════════════════════════════════════════════════════════
const walletRouter = express.Router();

// GET /wallet — رصيد المحفظة
walletRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const wallet = await db('wallets').where({ user_id: req.user.id }).first();
    if (!wallet) {
      const [w] = await db('wallets').insert({
        id: uuid(), user_id: req.user.id, balance: 0, currency: 'SAR',
      }).returning('*');
      return res.json({ wallet: w, transactions: [] });
    }
    const transactions = await db('wallet_transactions')
      .where({ wallet_id: wallet.id }).orderBy('created_at','desc').limit(30);
    res.json({ wallet, transactions });
  } catch (err) { next(err); }
});

// POST /wallet/topup — شحن رصيد
walletRouter.post('/topup', authenticate, async (req, res, next) => {
  try {
    const { amount, payment_method } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'الحد الأدنى للشحن SAR 10' });
    if (amount > 1000) return res.status(400).json({ error: 'الحد الأقصى للشحن SAR 1000' });

    const wallet = await db('wallets').where({ user_id: req.user.id }).first();
    if (!wallet) return res.status(404).json({ error: 'المحفظة غير موجودة' });

    // In production: initiate payment via Tap/Paymob first, then credit on success
    // Here we simulate direct credit for the route structure
    const newBalance = +wallet.balance + +amount;
    await db('wallets').where({ id: wallet.id }).update({
      balance: newBalance, updated_at: new Date(),
    });
    await db('wallet_transactions').insert({
      id: uuid(), wallet_id: wallet.id,
      type: 'credit', amount, balance_after: newBalance,
      description: `شحن رصيد عبر ${payment_method || 'بطاقة'}`,
      created_at: new Date(),
    });

    await notify.sendToUser?.(req.user.id, {
      titleAr: '💰 تم شحن رصيدك',
      titleEn: '💰 Wallet topped up',
      bodyAr:  `تمت إضافة SAR ${amount} لمحفظتك. الرصيد الحالي: SAR ${newBalance}`,
      bodyEn:  `SAR ${amount} added. Balance: SAR ${newBalance}`,
      data: { type: 'wallet_topup' },
      lang: req.user.lang_preference || 'ar',
    }).catch(() => {});

    res.json({ ok: true, new_balance: newBalance });
  } catch (err) { next(err); }
});

// POST /wallet/pay — دفع من المحفظة (يُستدعى من checkout)
walletRouter.post('/pay', authenticate, async (req, res, next) => {
  try {
    const { amount, order_id } = req.body;
    const wallet = await db('wallets').where({ user_id: req.user.id }).first();
    if (!wallet || +wallet.balance < +amount) {
      return res.status(400).json({ error: 'رصيد المحفظة غير كافٍ' });
    }
    const newBalance = +wallet.balance - +amount;
    await db('wallets').where({ id: wallet.id }).update({
      balance: newBalance, updated_at: new Date(),
    });
    await db('wallet_transactions').insert({
      id: uuid(), wallet_id: wallet.id,
      type: 'debit', amount: -amount, balance_after: newBalance,
      description: `دفع طلب #${order_id?.slice(0,8)}`,
      ref_id: order_id, created_at: new Date(),
    });
    res.json({ ok: true, new_balance: newBalance });
  } catch (err) { next(err); }
});

// POST /wallet/transfer — تحويل لمستخدم آخر (اختياري)
walletRouter.post('/transfer', authenticate, async (req, res, next) => {
  try {
    const { to_phone, amount, note } = req.body;
    if (!amount || amount < 5) return res.status(400).json({ error: 'الحد الأدنى SAR 5' });

    const sender   = await db('wallets').where({ user_id: req.user.id }).first();
    const recipient = await db('users').where({ phone: to_phone }).first();
    if (!recipient) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (recipient.id === req.user.id) return res.status(400).json({ error: 'لا يمكن التحويل لنفسك' });

    const recvWallet = await db('wallets').where({ user_id: recipient.id }).first();
    if (!sender || +sender.balance < +amount) {
      return res.status(400).json({ error: 'رصيد غير كافٍ' });
    }

    await db.transaction(async trx => {
      const newSenderBal = +sender.balance - +amount;
      const newRecvBal   = +recvWallet.balance + +amount;

      await trx('wallets').where({ id: sender.id }).update({ balance: newSenderBal });
      await trx('wallets').where({ id: recvWallet.id }).update({ balance: newRecvBal });

      await trx('wallet_transactions').insert([
        { id: uuid(), wallet_id: sender.id, type: 'debit',
          amount: -amount, balance_after: newSenderBal,
          description: `تحويل لـ ${recipient.full_name}${note ? ': ' + note : ''}`,
          created_at: new Date() },
        { id: uuid(), wallet_id: recvWallet.id, type: 'credit',
          amount, balance_after: newRecvBal,
          description: `تحويل من ${req.user.full_name}${note ? ': ' + note : ''}`,
          created_at: new Date() },
      ]);
    });

    res.json({ ok: true, message: `تم تحويل SAR ${amount} بنجاح` });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// REFERRAL — نظام الإحالة
// ══════════════════════════════════════════════════════════
const referralRouter = express.Router();

// GET /referral — كود الإحالة الخاص بي
referralRouter.get('/', authenticate, async (req, res, next) => {
  try {
    let ref = await db('referrals').where({ referrer_id: req.user.id }).first();
    if (!ref) {
      // Generate unique code
      const code = req.user.full_name?.split(' ')[0]?.toUpperCase().slice(0,5) +
        Math.floor(1000 + Math.random() * 9000);
      [ref] = await db('referrals').insert({
        id: uuid(), referrer_id: req.user.id,
        code, total_referrals: 0, total_earned: 0,
        created_at: new Date(),
      }).returning('*');
    }

    const referrals = await db('referral_uses as ru')
      .join('users as u', 'u.id', 'ru.referee_id')
      .where({ 'ru.referrer_id': req.user.id })
      .select('u.full_name', 'ru.bonus_earned', 'ru.created_at')
      .orderBy('ru.created_at', 'desc').limit(20);

    res.json({
      code:           ref.code,
      total_referrals: ref.total_referrals,
      total_earned:   ref.total_earned,
      bonus_per_referral: 15, // SAR
      referrals,
      share_text_ar: `انضم لخالتو واطلب أكل بيتي أصيل! استخدم كودي ${ref.code} واحصل على خصم ٢٠٪ على أول طلب 🍽️`,
      share_text_en: `Join Khalto for authentic home-cooked meals! Use my code ${ref.code} for 20% off your first order 🍽️`,
    });
  } catch (err) { next(err); }
});

// POST /referral/apply — تطبيق كود إحالة عند التسجيل
referralRouter.post('/apply', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'الكود مطلوب' });

    // Check already used
    const alreadyUsed = await db('referral_uses').where({ referee_id: req.user.id }).first();
    if (alreadyUsed) return res.status(400).json({ error: 'استخدمت كود إحالة مسبقاً' });

    const ref = await db('referrals').where({ code: code.toUpperCase() }).first();
    if (!ref) return res.status(404).json({ error: 'الكود غير موجود' });
    if (ref.referrer_id === req.user.id) return res.status(400).json({ error: 'لا يمكن استخدام كودك الخاص' });

    const REFERRER_BONUS = 15; // SAR to referrer wallet
    const REFEREE_BONUS  = 20; // % discount for new user (KHALTO20 applied)

    await db.transaction(async trx => {
      // Credit referrer wallet
      const wallet = await trx('wallets').where({ user_id: ref.referrer_id }).first();
      if (wallet) {
        const newBal = +wallet.balance + REFERRER_BONUS;
        await trx('wallets').where({ id: wallet.id }).update({ balance: newBal });
        await trx('wallet_transactions').insert({
          id: uuid(), wallet_id: wallet.id, type: 'credit',
          amount: REFERRER_BONUS, balance_after: newBal,
          description: `مكافأة إحالة — ${req.user.full_name}`, created_at: new Date(),
        });
      }

      // Record referral use
      await trx('referral_uses').insert({
        id: uuid(), referrer_id: ref.referrer_id, referee_id: req.user.id,
        code, bonus_earned: REFERRER_BONUS, created_at: new Date(),
      });

      // Update referral stats
      await trx('referrals').where({ id: ref.id }).update({
        total_referrals: trx.raw('total_referrals + 1'),
        total_earned:    trx.raw(`total_earned + ${REFERRER_BONUS}`),
      });
    });

    // Notify referrer
    await notify.sendToUser?.(ref.referrer_id, {
      titleAr: '🎉 صديق جديد انضم بكودك!',
      titleEn: '🎉 New friend joined with your code!',
      bodyAr:  `${req.user.full_name} انضم باستخدام كودك. تم إضافة SAR ${REFERRER_BONUS} لمحفظتك!`,
      bodyEn:  `${req.user.full_name} joined using your code. SAR ${REFERRER_BONUS} added to your wallet!`,
      data: { type: 'referral_bonus' },
      lang: 'ar',
    }).catch(() => {});

    res.json({ ok: true, message: 'تم تطبيق كود الإحالة بنجاح' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// SCHEDULED ORDERS — جدولة الطلبات
// ══════════════════════════════════════════════════════════
const scheduledRouter = express.Router();

// GET /orders/scheduled — طلباتي المجدولة
scheduledRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const orders = await db('orders')
      .where({ customer_id: req.user.id })
      .whereNotNull('scheduled_for')
      .where('scheduled_for', '>', new Date())
      .where('status', 'pending_payment')
      .orderBy('scheduled_for', 'asc')
      .select('id','order_number','scheduled_for','total_amount','status');
    res.json({ scheduled_orders: orders });
  } catch (err) { next(err); }
});

// POST /orders/scheduled — جدولة طلب جديد
scheduledRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const { kitchen_id, items, delivery_address, delivery_lat, delivery_lng,
      payment_method, scheduled_for, notes } = req.body;

    if (!scheduled_for) return res.status(400).json({ error: 'scheduled_for مطلوب' });
    const schedDate = new Date(scheduled_for);
    const minDate   = new Date(Date.now() + 30 * 60 * 1000); // at least 30 min ahead
    const maxDate   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // max 7 days

    if (schedDate < minDate) return res.status(400).json({ error: 'الطلب يجب أن يكون بعد 30 دقيقة على الأقل' });
    if (schedDate > maxDate) return res.status(400).json({ error: 'لا يمكن الجدولة لأكثر من 7 أيام' });

    // Calculate totals
    const menuItems = await db('menu_items').whereIn('id', items.map(i => i.menu_item_id));
    const subtotal  = items.reduce((sum, item) => {
      const mi = menuItems.find(m => m.id === item.menu_item_id);
      return sum + (mi ? mi.price * item.quantity : 0);
    }, 0);

    const orderNumber = 'KH-S' + Date.now().toString().slice(-6);

    const [order] = await db('orders').insert({
      id: uuid(), order_number: orderNumber,
      customer_id: req.user.id, kitchen_id,
      status: 'scheduled',
      subtotal, delivery_fee: 8, total_amount: subtotal + 8,
      currency_code: 'SAR', delivery_address,
      delivery_lat, delivery_lng,
      payment_method, notes,
      scheduled_for: schedDate,
      created_at: new Date(), updated_at: new Date(),
    }).returning('*');

    // Insert order items
    await db('order_items').insert(items.map(item => {
      const mi = menuItems.find(m => m.id === item.menu_item_id);
      return {
        id: uuid(), order_id: order.id,
        menu_item_id: item.menu_item_id,
        name_ar: mi?.name_ar, name_en: mi?.name_en,
        quantity: item.quantity,
        unit_price: mi?.price || 0,
        subtotal: (mi?.price || 0) * item.quantity,
      };
    }));

    // Schedule reminder notification 30 min before
    const reminderTime = new Date(schedDate.getTime() - 30 * 60 * 1000);
    await db('notification_scheduled').insert({
      id: uuid(), template_key: 'order.reminder',
      user_ids: JSON.stringify([req.user.id]),
      title_ar: '⏰ طلبك المجدول قريباً!',
      title_en: '⏰ Your scheduled order is coming up!',
      body_ar:  `طلبك من ${orderNumber} سيُبدأ تحضيره خلال 30 دقيقة`,
      body_en:  `Your order ${orderNumber} will start preparation in 30 minutes`,
      channels: JSON.stringify(['push']),
      vars: JSON.stringify({ order_number: orderNumber }),
      schedule_at: reminderTime, status: 'scheduled',
      created_at: new Date(),
    }).catch(() => {});

    logger.info('Scheduled order created', { orderId: order.id, scheduledFor: schedDate });
    res.status(201).json({ order });
  } catch (err) { next(err); }
});

// DELETE /orders/scheduled/:id — إلغاء طلب مجدول
scheduledRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await db('orders')
      .where({ id: req.params.id, customer_id: req.user.id, status: 'scheduled' }).first();
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

    // Can cancel if > 30 min before scheduled time
    const timeLeft = new Date(order.scheduled_for) - Date.now();
    if (timeLeft < 30 * 60 * 1000) {
      return res.status(400).json({ error: 'لا يمكن إلغاء الطلب قبل 30 دقيقة من موعده' });
    }

    await db('orders').where({ id: req.params.id }).update({
      status: 'cancelled', cancel_reason: 'ألغاه العميل', cancelled_at: new Date(),
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { loyaltyRouter, walletRouter, referralRouter, scheduledRouter };
