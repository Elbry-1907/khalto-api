const admin   = require('firebase-admin');
const db      = require('../db');
const logger  = require('../utils/logger');

// ── Init Firebase ─────────────────────────────────────────
let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    logger.info('Firebase initialized');
  } catch (err) {
    logger.error('Firebase init failed', { err });
  }
  return firebaseApp;
};

// ── Send single push ──────────────────────────────────────
const sendPush = async ({ token, title, body, data = {}, imageUrl }) => {
  if (!token) return { success: false, error: 'No token' };
  try {
    initFirebase();
    const message = {
      token,
      notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          channelId: 'khalto_orders',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
        headers: { 'apns-priority': '10' },
      },
    };
    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (err) {
    logger.warn('Push send failed', { token: token?.slice(0,20), err: err.message });
    return { success: false, error: err.message };
  }
};

// ── Send to multiple tokens ───────────────────────────────
const sendMulticastPush = async ({ tokens, title, body, data = {} }) => {
  if (!tokens?.length) return;
  try {
    initFirebase();
    const message = {
      tokens,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: { priority: 'high' },
      apns:    { payload: { aps: { sound: 'default' } } },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(`Push multicast: ${response.successCount}/${tokens.length} sent`);
    return response;
  } catch (err) {
    logger.error('Multicast push failed', { err });
  }
};

// ── Send to user (looks up their FCM tokens from DB) ─────
const sendToUser = async (userId, { titleEn, titleAr, bodyEn, bodyAr, data = {}, lang = 'ar' }) => {
  try {
    const title = lang === 'ar' ? titleAr : titleEn;
    const body  = lang === 'ar' ? bodyAr  : bodyEn;

    // Get user's FCM tokens (stored when app registers)
    const tokens = await db('user_fcm_tokens')
      .where({ user_id: userId, is_active: true })
      .pluck('token');

    if (!tokens.length) return;

    await sendMulticastPush({ tokens, title, body, data });

    // Also save in-app notification
    await db('notifications').insert({
      id:      require('uuid').v4(),
      user_id: userId,
      channel: 'push',
      title,
      body,
      data:    JSON.stringify(data),
      status:  'sent',
      sent_at: new Date(),
    });
  } catch (err) {
    logger.error('sendToUser push failed', { userId, err });
  }
};

// ── Predefined notification templates ─────────────────────
const notify = {

  // Customer notifications
  orderConfirmed: (userId, { orderNumber, kitchenName, eta, lang = 'ar' }) =>
    sendToUser(userId, {
      titleEn: 'Order Confirmed ✅',
      titleAr: 'تم تأكيد طلبك ✅',
      bodyEn:  `Your order #${orderNumber} from ${kitchenName} is confirmed. ETA: ${eta} min`,
      bodyAr:  `طلبك #${orderNumber} من ${kitchenName} تم تأكيده. الوقت المتوقع: ${eta} دقيقة`,
      data:    { type: 'order_confirmed', order_number: orderNumber },
      lang,
    }),

  outForDelivery: (userId, { courierName, eta, orderId, lang = 'ar' }) =>
    sendToUser(userId, {
      titleEn: `${courierName} is on the way! 🛵`,
      titleAr: `${courierName} في الطريق إليك! 🛵`,
      bodyEn:  `ETA: ${eta} min — tap to track live`,
      bodyAr:  `الوقت المتوقع: ${eta} دقيقة — اضغط للتتبع`,
      data:    { type: 'out_for_delivery', order_id: orderId },
      lang,
    }),

  orderDelivered: (userId, { orderNumber, lang = 'ar' }) =>
    sendToUser(userId, {
      titleEn: 'Order Delivered! 🎉',
      titleAr: 'وصل طلبك! 🎉',
      bodyEn:  `Order #${orderNumber} delivered. Enjoy your meal! Rate your experience`,
      bodyAr:  `طلب #${orderNumber} وصل. بالعافية! قيّم تجربتك`,
      data:    { type: 'order_delivered', order_number: orderNumber },
      lang,
    }),

  orderCancelled: (userId, { orderNumber, reason, lang = 'ar' }) =>
    sendToUser(userId, {
      titleEn: 'Order Cancelled',
      titleAr: 'تم إلغاء طلبك',
      bodyEn:  `Order #${orderNumber} was cancelled. Reason: ${reason}`,
      bodyAr:  `تم إلغاء طلب #${orderNumber}. السبب: ${reason}`,
      data:    { type: 'order_cancelled', order_number: orderNumber },
      lang,
    }),

  // Chef notifications
  newOrderAlert: (chefUserId, { orderNumber, itemCount, payoutEstimate, lang = 'ar' }) =>
    sendToUser(chefUserId, {
      titleEn: '🔔 New Order! Accept within 2 min',
      titleAr: '🔔 طلب جديد! اقبله خلال دقيقتين',
      bodyEn:  `${itemCount} items · SAR ${payoutEstimate} payout · #${orderNumber}`,
      bodyAr:  `${itemCount} أصناف · ${payoutEstimate} ريال · #${orderNumber}`,
      data:    { type: 'new_order', order_number: orderNumber },
      lang,
    }),

  courierArriving: (chefUserId, { courierName, eta, lang = 'ar' }) =>
    sendToUser(chefUserId, {
      titleEn: `${courierName} is arriving in ${eta} min`,
      titleAr: `${courierName} سيصل خلال ${eta} دقيقة`,
      bodyEn:  'Please have the order ready for pickup',
      bodyAr:  'جهّز الطلب للاستلام',
      data:    { type: 'courier_arriving' },
      lang,
    }),

  settlementPaid: (userId, { amount, currency, weekRange, lang = 'ar' }) =>
    sendToUser(userId, {
      titleEn: `💰 Settlement Paid: ${currency} ${amount}`,
      titleAr: `💰 تم صرف دفعتك: ${amount} ${currency}`,
      bodyEn:  `Week ${weekRange} payout transferred to your bank`,
      bodyAr:  `دفعة أسبوع ${weekRange} حُوّلت لحسابك البنكي`,
      data:    { type: 'settlement_paid', amount: String(amount) },
      lang,
    }),

  // Courier notifications
  newJobAlert: (courierUserId, { kitchenName, distance, payout, jobId, lang = 'ar' }) =>
    sendToUser(courierUserId, {
      titleEn: '📦 New delivery job nearby',
      titleAr: '📦 طلب توصيل قريب منك',
      bodyEn:  `${kitchenName} · ${distance} km · SAR ${payout}`,
      bodyAr:  `${kitchenName} · ${distance} كم · ${payout} ريال`,
      data:    { type: 'new_job', job_id: jobId },
      lang,
    }),

  incentiveUnlocked: (courierUserId, { bonusAmount, tripCount, lang = 'ar' }) =>
    sendToUser(courierUserId, {
      titleEn: '🏆 Bonus Unlocked!',
      titleAr: '🏆 حصلت على بونص!',
      bodyEn:  `SAR ${bonusAmount} added — ${tripCount} trips completed`,
      bodyAr:  `تم إضافة ${bonusAmount} ريال — ${tripCount} رحلة منجزة`,
      data:    { type: 'incentive_unlocked', bonus: String(bonusAmount) },
      lang,
    }),
};

// ── FCM Token registration route handler ──────────────────
const registerToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body; // platform: ios | android
    if (!token) return res.status(400).json({ error: 'token required' });

    // Deactivate old tokens for same user+platform
    await db('user_fcm_tokens')
      .where({ user_id: req.user.id, platform })
      .update({ is_active: false });

    // Upsert new token
    await db('user_fcm_tokens')
      .insert({
        id:       require('uuid').v4(),
        user_id:  req.user.id,
        token,
        platform: platform || 'android',
        is_active: true,
      })
      .onConflict('token')
      .merge({ user_id: req.user.id, is_active: true, updated_at: new Date() });

    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { sendPush, sendMulticastPush, sendToUser, notify, registerToken, initFirebase };
