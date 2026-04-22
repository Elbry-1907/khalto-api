const router  = require('express').Router();
const { v4: uuid } = require('uuid');
const axios   = require('axios');
const db      = require('../db');
const { authenticate, requireRole, isFinance } = require('../middleware/auth');

// ── POST /payments/initiate ──
router.post('/initiate', authenticate, requireRole('customer'), async (req, res, next) => {
  try {
    const { order_id, payment_method, return_url } = req.body;

    const order = await db('orders')
      .where({ id: order_id, customer_id: req.user.id, status: 'pending_payment' })
      .first();
    if (!order) return res.status(404).json({ error: 'Order not found or already paid' });

    const user = await db('users').where({ id: req.user.id }).first('full_name','email','phone');

    let gatewayResponse = {};

    if (payment_method === 'tap' || payment_method === 'mada' || payment_method === 'visa') {
      // Tap.company charge
      const tapRes = await axios.post('https://api.tap.company/v2/charges', {
        amount: order.total_amount,
        currency: order.currency_code,
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `Khalto Order ${order.order_number}`,
        metadata: { order_id: order.id, order_number: order.order_number },
        reference: { transaction: order.order_number, order: order.order_number },
        receipt: { email: true, sms: true },
        customer: {
          first_name: user.full_name?.split(' ')[0] || 'Customer',
          email: user.email,
          phone: { country_code: '966', number: user.phone?.replace(/\D/g,'').slice(-9) },
        },
        source: { id: payment_method === 'mada' ? 'src_bh.mada' : 'src_all' },
        redirect: { url: return_url || `${process.env.APP_URL}/payment/callback` },
      }, {
        headers: { Authorization: `Bearer ${process.env.TAP_SECRET_KEY}` }
      });

      gatewayResponse = tapRes.data;

      await db('payments').insert({
        id: uuid(),
        order_id: order.id,
        user_id: req.user.id,
        amount: order.total_amount,
        currency_code: order.currency_code,
        method: payment_method,
        gateway: 'tap',
        gateway_tx_id: tapRes.data.id,
        status: 'pending',
        metadata: JSON.stringify(tapRes.data),
      });

      return res.json({
        payment_url: tapRes.data.transaction?.url,
        gateway_tx_id: tapRes.data.id,
        status: 'pending',
      });
    }

    if (payment_method === 'paymob') {
      // Step 1: Auth token
      const authRes = await axios.post('https://accept.paymob.com/api/auth/tokens', {
        api_key: process.env.PAYMOB_API_KEY,
      });
      const authToken = authRes.data.token;

      // Step 2: Order registration
      const paymobOrder = await axios.post('https://accept.paymob.com/api/ecommerce/orders', {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: Math.round(order.total_amount * 100),
        currency: order.currency_code,
        merchant_order_id: order.order_number,
        items: [],
      });

      // Step 3: Payment key
      const paymentKey = await axios.post('https://accept.paymob.com/api/acceptance/payment_keys', {
        auth_token: authToken,
        amount_cents: Math.round(order.total_amount * 100),
        expiration: 3600,
        order_id: paymobOrder.data.id,
        billing_data: {
          first_name: user.full_name?.split(' ')[0] || 'Customer',
          last_name: user.full_name?.split(' ').slice(1).join(' ') || 'User',
          email: user.email || 'n/a@n.a',
          phone_number: user.phone || '+20000000000',
          apartment: 'NA', floor: 'NA', street: 'NA',
          building: 'NA', shipping_method: 'NA', postal_code: 'NA',
          city: 'NA', country: 'NA', state: 'NA',
        },
        currency: order.currency_code,
        integration_id: process.env.PAYMOB_INTEGRATION_ID,
      });

      await db('payments').insert({
        id: uuid(),
        order_id: order.id,
        user_id: req.user.id,
        amount: order.total_amount,
        currency_code: order.currency_code,
        method: 'paymob',
        gateway: 'paymob',
        gateway_tx_id: String(paymobOrder.data.id),
        status: 'pending',
        metadata: JSON.stringify({ paymob_order_id: paymobOrder.data.id }),
      });

      return res.json({
        payment_url: `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKey.data.token}`,
        gateway_tx_id: paymobOrder.data.id,
        status: 'pending',
      });
    }

    if (payment_method === 'wallet') {
      const wallet = await db('wallets').where({ user_id: req.user.id }).first();
      if (!wallet || parseFloat(wallet.balance) < parseFloat(order.total_amount))
        return res.status(400).json({ error: 'Insufficient wallet balance' });

      const trx = await db.transaction();
      try {
        await trx('wallets').where({ id: wallet.id })
          .decrement('balance', order.total_amount);
        await trx('wallet_transactions').insert({
          id: uuid(), wallet_id: wallet.id,
          amount: -order.total_amount,
          type: 'order_payment', reference: order.id,
          note: `Payment for order ${order.order_number}`,
        });
        const [payment] = await trx('payments').insert({
          id: uuid(), order_id: order.id, user_id: req.user.id,
          amount: order.total_amount, currency_code: order.currency_code,
          method: 'wallet', gateway: 'wallet', status: 'completed', paid_at: new Date(),
        }).returning('*');
        await trx('orders').where({ id: order.id })
          .update({ status: 'awaiting_acceptance', updated_at: new Date() });
        await trx('order_status_log').insert({
          id: uuid(), order_id: order.id,
          from_status: 'pending_payment', to_status: 'awaiting_acceptance',
          changed_by: req.user.id, note: 'Wallet payment',
        });
        await trx.commit();
        req.io?.emit(`kitchen:${order.kitchen_id}:new_order`, { order_id: order.id });
        return res.json({ payment, status: 'completed' });
      } catch (e) { await trx.rollback(); throw e; }
    }

    res.status(400).json({ error: 'Invalid payment method' });
  } catch (err) { next(err); }
});

// ── POST /payments/webhook/tap ──
router.post('/webhook/tap', async (req, res, next) => {
  try {
    const event = req.body;
    const charge = event.object === 'charge' ? event : null;
    if (!charge) return res.sendStatus(200);

    const orderId = charge.metadata?.order_id;
    if (!orderId) return res.sendStatus(200);

    const trx = await db.transaction();
    try {
      if (charge.status === 'CAPTURED') {
        await trx('payments')
          .where({ gateway_tx_id: charge.id })
          .update({ status: 'completed', paid_at: new Date() });
        await trx('orders').where({ id: orderId })
          .update({ status: 'awaiting_acceptance', updated_at: new Date() });
        await trx('order_status_log').insert({
          id: uuid(), order_id: orderId,
          from_status: 'pending_payment', to_status: 'awaiting_acceptance',
          note: `Tap webhook - charge ${charge.id}`,
        });
        // Notify chef via socket
        const order = await trx('orders').where({ id: orderId })
          .first('kitchen_id','customer_id','total_amount');
        if (order && req.app?.get) {
          const io = req.app.get('io');
          if (io) {
            io.to(`kitchen:${order.kitchen_id}`).emit('chef:new_order', { order_id: orderId });
          }
        }
      } else if (['FAILED','DECLINED','CANCELLED'].includes(charge.status)) {
        await trx('payments')
          .where({ gateway_tx_id: charge.id })
          .update({ status: 'failed', failed_at: new Date(), failure_reason: charge.response?.message });
      }
      await trx.commit();
    } catch (e) { await trx.rollback(); throw e; }

    res.sendStatus(200);
  } catch (err) { next(err); }
});

// ── POST /payments/webhook/paymob ──
router.post('/webhook/paymob', async (req, res, next) => {
  try {
    // HMAC verification
    const secret = process.env.PAYMOB_HMAC_SECRET;
    if (secret) {
      const crypto = require('crypto');
      const { obj } = req.body || {};
      if (obj) {
        const fields = ['amount_cents','created_at','currency','error_occured',
          'has_parent_transaction','id','integration_id','is_3d_secure','is_auth',
          'is_capture','is_refunded','is_standalone_payment','is_voided','order.id',
          'owner','pending','source_data.pan','source_data.sub_type',
          'source_data.type','success'];
        const hashStr = fields.map(f => {
          const val = f.split('.').reduce((o,k) => o?.[k], obj);
          return val ?? '';
        }).join('');
        const computed = crypto.createHmac('sha512', secret).update(hashStr).digest('hex');
        const received = req.query.hmac || req.body?.hmac;
        if (received && computed !== received) {
          logger.warn('Paymob HMAC mismatch', { ip: req.ip });
          return res.sendStatus(401);
        }
      }
    }
    const { obj: transaction } = req.body;
    if (!transaction) return res.sendStatus(200);

    const orderId = transaction.order?.merchant_order_id
      ? await db('orders').where({ order_number: transaction.order.merchant_order_id }).first('id').then(r => r?.id)
      : null;
    if (!orderId) return res.sendStatus(200);

    const trx = await db.transaction();
    try {
      if (transaction.success) {
        await trx('payments')
          .where({ gateway_tx_id: String(transaction.order_id) })
          .update({ status: 'completed', paid_at: new Date(), gateway_ref: String(transaction.id) });
        await trx('orders').where({ id: orderId })
          .update({ status: 'awaiting_acceptance', updated_at: new Date() });
        await trx('order_status_log').insert({
          id: uuid(), order_id: orderId,
          from_status: 'pending_payment', to_status: 'awaiting_acceptance',
          note: `Paymob webhook - tx ${transaction.id}`,
        });
      } else {
        await trx('payments')
          .where({ gateway_tx_id: String(transaction.order_id) })
          .update({ status: 'failed', failed_at: new Date() });
      }
      await trx.commit();
    } catch (e) { await trx.rollback(); throw e; }

    res.sendStatus(200);
  } catch (err) { next(err); }
});

// ── POST /payments/:id/refund ──
router.post('/:id/refund', authenticate, isFinance, async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const payment = await db('payments').where({ id: req.params.id, status: 'completed' }).first();
    if (!payment) return res.status(404).json({ error: 'Payment not found or not completed' });

    // Tap refund
    if (payment.gateway === 'tap' && payment.gateway_tx_id) {
      await axios.post(`https://api.tap.company/v2/refunds`, {
        charge_id: payment.gateway_tx_id,
        amount: amount || payment.amount,
        currency: payment.currency_code,
        description: reason || 'Customer refund',
      }, { headers: { Authorization: `Bearer ${process.env.TAP_SECRET_KEY}` } });
    }

    const [refund] = await db('refunds').insert({
      id: uuid(),
      payment_id: payment.id,
      order_id: payment.order_id,
      amount: amount || payment.amount,
      reason,
      initiated_by: req.user.id,
      status: 'pending',
    }).returning('*');

    res.json({ refund });
  } catch (err) { next(err); }
});

// ── GET /payments/order/:order_id ──
router.get('/order/:order_id', authenticate, async (req, res, next) => {
  try {
    const payment = await db('payments')
      .where({ order_id: req.params.order_id })
      .orderBy('created_at', 'desc')
      .first();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment });
  } catch (err) { next(err); }
});

module.exports = router;

// ── Auto-fire pixel on purchase (called from webhook) ─────
// Imported by ads.js auto-fire logic
