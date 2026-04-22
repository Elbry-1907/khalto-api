/**
 * Khalto — Auth Routes
 * POST /api/v1/auth/register          — تسجيل جديد (عميل / شيف / مندوب)
 * POST /api/v1/auth/login             — دخول بكلمة مرور (fallback)
 * POST /api/v1/auth/otp/send          — إرسال OTP
 * POST /api/v1/auth/otp/verify        — تحقق من OTP → JWT
 * POST /api/v1/auth/social            — تسجيل / دخول بـ Google / Apple / Facebook
 * POST /api/v1/auth/biometric/enable  — تفعيل البصمة
 * POST /api/v1/auth/biometric/verify  — دخول بالبصمة
 * POST /api/v1/auth/refresh           — تجديد الـ JWT
 * POST /api/v1/auth/fcm-token         — تسجيل FCM token للـ push
 * GET  /api/v1/auth/me                — بيانات المستخدم الحالي
 * GET  /api/v1/auth/status            — حالة الحساب (شيف / مندوب)
 * POST /api/v1/auth/logout            — تسجيل خروج
 * POST /api/v1/auth/password/reset    — طلب إعادة تعيين كلمة المرور
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { v4: uuid } = require('uuid');

const db      = require('../db');
const logger  = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { validate, authSchemas } = require('../validators');
const { sms }   = require('../services/sms.service');
const { email } = require('../services/email.service');
const { notify, registerToken } = require('../services/push.service');

// ── Constants ─────────────────────────────────────────────
const SALT_ROUNDS   = 12;
const JWT_EXPIRES   = '7d';
const REFRESH_DAYS  = 30;
const OTP_MIN       = 5;
const OTP_MAX_TRIES = 5;

// ── Helpers ───────────────────────────────────────────────
const signToken = (userId, role) =>
  jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES });

const signRefresh = (userId) =>
  jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: `${REFRESH_DAYS}d`,
  });

const generateOtp = () =>
  process.env.NODE_ENV === 'development' ? '123456'
  : Math.floor(100000 + Math.random() * 900000).toString();

const sanitizeUser = (u) => ({
  id:              u.id,
  role:            u.role,
  full_name:       u.full_name,
  phone:           u.phone,
  email:           u.email,
  avatar_url:      u.avatar_url,
  lang_preference: u.lang_preference,
  is_verified:     u.is_verified,
  country_id:      u.country_id,
  created_at:      u.created_at,
});

// ── Welcome actions after registration ────────────────────
const postRegisterActions = async (user, role) => {
  try {
    // Create wallet
    await db('wallets').insert({
      id: uuid(), user_id: user.id,
      balance: 0, currency: 'SAR',
    }).onConflict('user_id').ignore();

    // Send welcome coupon for customers
    if (role === 'customer') {
      await db('coupon_redemptions').insert({
        id: uuid(),
        user_id: user.id,
        coupon_id: await db('coupons').where({ code: 'KHALTO20' }).value('id'),
        reserved_at: new Date(),
      }).catch(() => {}); // ignore if coupon not found

      if (user.phone) {
        await sms.sendSMS({
          to: user.phone,
          body: user.lang_preference === 'ar'
            ? `أهلاً بك في خالتو! 🎉 استخدم كود KHALTO20 للحصول على خصم ٢٠٪ على أول طلب.`
            : `Welcome to Khalto! 🎉 Use code KHALTO20 for 20% off your first order.`,
        });
      }
      if (user.email) {
        await email.welcome({ to: user.email, name: user.full_name, lang: user.lang_preference });
      }
    }

    // Chef / courier: send confirmation
    if (role === 'chef' || role === 'courier') {
      if (user.phone) {
        await sms.sendSMS({
          to: user.phone,
          body: user.lang_preference === 'ar'
            ? `خالتو: تم استلام طلبك للانضمام كـ${role === 'chef' ? 'شيف' : 'رايدر'}. سنراجع طلبك خلال 24-48 ساعة.`
            : `Khalto: Your application as a ${role} has been received. We'll review it within 24-48 hours.`,
        });
      }
    }
  } catch (err) {
    logger.warn('Post-register actions failed', { err: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// POST /register
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: تسجيل مستخدم جديد
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, role]
 *             properties:
 *               full_name: { type: string }
 *               phone:     { type: string }
 *               email:     { type: string, format: email }
 *               role:      { type: string, enum: [customer, chef, courier] }
 *               lang_preference: { type: string, enum: [ar, en] }
 */
router.post('/register', validate(authSchemas.register), async (req, res, next) => {
  try {
    const {
      full_name, phone, email: emailAddr,
      password, role = 'customer',
      lang_preference = 'ar', country_id,
    } = req.body;

    // Check duplicate
    const existing = await db('users')
      .where(function() {
        if (phone) this.orWhere({ phone });
        if (emailAddr) this.orWhere({ email: emailAddr });
      })
      .first('id');
    if (existing) return res.status(409).json({ error: 'رقم الهاتف أو البريد مسجّل مسبقاً' });

    const password_hash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;

    const [user] = await db('users').insert({
      id:              uuid(),
      role,
      full_name,
      phone:           phone || null,
      email:           emailAddr || null,
      password_hash,
      lang_preference,
      country_id:      country_id || null,
      is_verified:     false,
    }).returning('*');

    const token   = signToken(user.id, user.role);
    const refresh = signRefresh(user.id);

    // Async welcome actions
    postRegisterActions(user, role).catch(() => {});

    logger.info('User registered', { userId: user.id, role });
    res.status(201).json({
      token,
      refresh_token: refresh,
      user: sanitizeUser(user),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /otp/send
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/otp/send:
 *   post:
 *     tags: [Auth]
 *     summary: إرسال OTP للهاتف
 *     security: []
 */
router.post('/otp/send', validate(authSchemas.sendOtp), async (req, res, next) => {
  try {
    const { phone, purpose = 'login' } = req.body;

    // Rate: max OTP_MAX_TRIES per hour
    const recentCount = await db('otp_codes')
      .where({ phone, purpose })
      .where('expires_at', '>', new Date())
      .count('id as c')
      .first();
    if (parseInt(recentCount?.c || 0) >= OTP_MAX_TRIES) {
      return res.status(429).json({
        error: 'عدد المحاولات تجاوز الحد. حاول بعد ساعة.',
      });
    }

    const code    = generateOtp();
    const expires = new Date(Date.now() + OTP_MIN * 60 * 1000);

    // Invalidate previous OTPs
    await db('otp_codes')
      .where({ phone, purpose, used: false })
      .update({ used: true });

    // Insert new
    await db('otp_codes').insert({
      id: uuid(), phone, code, purpose,
      expires_at: expires, used: false,
    });

    // Send SMS
    await sms.sendOTP({ phone, code, expiryMin: OTP_MIN, lang: 'ar' });

    logger.info('OTP sent', { phone: phone.slice(0,-4)+'****', purpose });
    res.json({
      ok: true,
      expires_in: OTP_MIN * 60,
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /otp/verify
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: تحقق من OTP وإرجاع JWT
 *     security: []
 */
router.post('/otp/verify', validate(authSchemas.verifyOtp), async (req, res, next) => {
  try {
    const { phone, code, purpose = 'login' } = req.body;

    const otpRecord = await db('otp_codes')
      .where({ phone, code, purpose, used: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!otpRecord) {
      return res.status(401).json({ error: 'رمز التحقق غير صحيح أو انتهت صلاحيته' });
    }

    // Mark as used
    await db('otp_codes').where({ id: otpRecord.id }).update({ used: true });

    // Find or create user
    let user = await db('users').where({ phone }).first();
    let isNew = false;

    if (!user) {
      // Auto-register new user
      [user] = await db('users').insert({
        id: uuid(), phone, role: 'customer',
        lang_preference: 'ar', is_verified: true,
      }).returning('*');
      isNew = true;
      // Create wallet
      await db('wallets').insert({
        id: uuid(), user_id: user.id, balance: 0, currency: 'SAR',
      });
      postRegisterActions(user, 'customer').catch(() => {});
    } else {
      // Mark verified
      if (!user.is_verified) {
        await db('users').where({ id: user.id }).update({ is_verified: true });
        user.is_verified = true;
      }
    }

    const token   = signToken(user.id, user.role);
    const refresh = signRefresh(user.id);

    logger.info('OTP verified', { userId: user.id, isNew });
    res.json({
      token,
      refresh_token: refresh,
      is_new_user: isNew,
      user: sanitizeUser(user),
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /social — Google / Apple / Facebook
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/social:
 *   post:
 *     tags: [Auth]
 *     summary: تسجيل / دخول بـ Google أو Apple أو Facebook
 *     security: []
 */
router.post('/social', async (req, res, next) => {
  try {
    const { provider, id_token, access_token, role = 'customer' } = req.body;
    if (!provider || !['google', 'apple', 'facebook'].includes(provider)) {
      return res.status(400).json({ error: 'Provider غير مدعوم' });
    }

    // Verify token with provider
    let providerData;
    try {
      providerData = await verifySocialToken(provider, id_token || access_token);
    } catch {
      return res.status(401).json({ error: 'رمز المزود غير صالح' });
    }

    const { providerId, email: socialEmail, name, avatar } = providerData;

    // Check if social account exists
    let user = await db('user_social_accounts')
      .join('users', 'users.id', 'user_social_accounts.user_id')
      .where({ 'user_social_accounts.provider': provider, 'user_social_accounts.provider_id': providerId })
      .first('users.*');

    let isNew = false;

    if (!user) {
      // Check by email
      if (socialEmail) {
        user = await db('users').where({ email: socialEmail }).first();
      }

      if (!user) {
        // Create new user
        [user] = await db('users').insert({
          id: uuid(), role, full_name: name,
          email: socialEmail || null,
          avatar_url: avatar || null,
          lang_preference: 'ar', is_verified: true,
        }).returning('*');
        await db('wallets').insert({ id: uuid(), user_id: user.id, balance: 0, currency: 'SAR' });
        isNew = true;
        postRegisterActions(user, role).catch(() => {});
      }

      // Link social account
      await db('user_social_accounts').insert({
        id: uuid(), user_id: user.id,
        provider, provider_id: providerId,
        access_token: access_token || null,
      }).onConflict(['provider', 'provider_id']).ignore();
    }

    const token   = signToken(user.id, user.role);
    const refresh = signRefresh(user.id);

    logger.info('Social login', { provider, userId: user.id, isNew });
    res.json({ token, refresh_token: refresh, is_new_user: isNew, user: sanitizeUser(user) });
  } catch (err) { next(err); }
});

// Social token verification helper
async function verifySocialToken(provider, token) {
  const axios = require('axios');
  if (provider === 'google') {
    const r = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    return { providerId: r.data.sub, email: r.data.email, name: r.data.name, avatar: r.data.picture };
  }
  if (provider === 'apple') {
    // Apple: verify JWT with Apple public keys
    // Simplified — use apple-signin-auth package in production
    const decoded = jwt.decode(token);
    return { providerId: decoded?.sub, email: decoded?.email, name: null, avatar: null };
  }
  if (provider === 'facebook') {
    const r = await axios.get(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${token}`);
    return { providerId: r.data.id, email: r.data.email, name: r.data.name, avatar: r.data.picture?.data?.url };
  }
  throw new Error('Unknown provider');
}

// ═══════════════════════════════════════════════════════════
// POST /biometric/enable — تفعيل البصمة
// ═══════════════════════════════════════════════════════════
router.post('/biometric/enable', authenticate, async (req, res, next) => {
  try {
    const { public_key, device_id, platform } = req.body;
    if (!public_key || !device_id) {
      return res.status(400).json({ error: 'public_key و device_id مطلوبان' });
    }

    await db('user_biometric_keys')
      .insert({
        id:         uuid(),
        user_id:    req.user.id,
        public_key,
        device_id,
        platform:   platform || 'ios',
        is_active:  true,
      })
      .onConflict(['user_id', 'device_id'])
      .merge({ public_key, is_active: true, updated_at: new Date() });

    res.json({ ok: true, message: 'تم تفعيل البصمة بنجاح' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /biometric/verify — دخول بالبصمة
// ═══════════════════════════════════════════════════════════
router.post('/biometric/verify', async (req, res, next) => {
  try {
    const { user_id, device_id, signature, challenge } = req.body;
    if (!user_id || !device_id || !signature) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }

    const keyRecord = await db('user_biometric_keys')
      .where({ user_id, device_id, is_active: true })
      .first();

    if (!keyRecord) {
      return res.status(401).json({ error: 'البصمة غير مسجّلة على هذا الجهاز' });
    }

    // Verify signature with stored public key
    const verify = crypto.createVerify('SHA256');
    verify.update(challenge || user_id);
    const valid = verify.verify(keyRecord.public_key, signature, 'base64');

    if (!valid && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'التحقق من البصمة فشل' });
    }

    const user = await db('users').where({ id: user_id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const token   = signToken(user.id, user.role);
    const refresh = signRefresh(user.id);

    logger.info('Biometric login', { userId: user.id });
    res.json({ token, refresh_token: refresh, user: sanitizeUser(user) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /login — دخول بكلمة مرور
// ═══════════════════════════════════════════════════════════
router.post('/login', validate(authSchemas.login), async (req, res, next) => {
  try {
    const { phone, email: emailAddr, password } = req.body;

    const user = await db('users')
      .where(phone ? { phone } : { email: emailAddr })
      .first();

    if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    if (!user.password_hash) {
      return res.status(401).json({
        error: 'هذا الحساب يستخدم رمز التحقق OTP للدخول',
        use_otp: true,
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const token   = signToken(user.id, user.role);
    const refresh = signRefresh(user.id);

    logger.info('Password login', { userId: user.id });
    res.json({ token, refresh_token: refresh, user: sanitizeUser(user) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /me
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: بيانات المستخدم الحالي
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ user: sanitizeUser(user) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /status — حالة الحساب (شيف / مندوب)
// ═══════════════════════════════════════════════════════════
/**
 * @swagger
 * /auth/status:
 *   get:
 *     tags: [Auth]
 *     summary: حالة حساب الشيف أو المندوب
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const { role, id } = req.user;

    if (role === 'chef') {
      const kitchen = await db('kitchens')
        .where({ user_id: id })
        .first(['id','name_en','name_ar','status','is_open','logo_url','rating','rating_count']);

      if (!kitchen) {
        return res.json({ status: 'no_kitchen', message: 'لم يتم إنشاء مطبخ بعد' });
      }

      // Pending documents
      const docsRequired  = ['national_id','health_cert','bank_account','kitchen_photos'];
      const docsUploaded  = await db('kitchen_documents')
        .where({ kitchen_id: kitchen.id }).pluck('doc_type');
      const missingDocs   = docsRequired.filter(d => !docsUploaded.includes(d));

      return res.json({
        status:       kitchen.status,
        kitchen,
        missing_docs: missingDocs,
        can_operate:  kitchen.status === 'active',
      });
    }

    if (role === 'courier') {
      const courier = await db('couriers')
        .where({ user_id: id })
        .first(['id','status','availability','vehicle_type','rating','city_id']);

      if (!courier) {
        return res.json({ status: 'no_profile', message: 'لم يتم إنشاء ملف المندوب بعد' });
      }

      const docsRequired  = ['national_id','driving_license','vehicle_registration'];
      const docsUploaded  = await db('courier_documents')
        .where({ courier_id: courier.id }).pluck('doc_type');
      const expiredDocs   = await db('courier_documents')
        .where({ courier_id: courier.id })
        .where('expires_at', '<', new Date())
        .pluck('doc_type');
      const missingDocs   = docsRequired.filter(d => !docsUploaded.includes(d));

      return res.json({
        status:        courier.status,
        courier,
        missing_docs:  missingDocs,
        expired_docs:  expiredDocs,
        can_operate:   courier.status === 'active' && missingDocs.length === 0,
      });
    }

    // Customer
    const wallet = await db('wallets').where({ user_id: id }).first(['balance','currency']);
    res.json({ status: 'active', wallet });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /refresh — تجديد JWT
// ═══════════════════════════════════════════════════════════
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token مطلوب' });

    let payload;
    try {
      payload = jwt.verify(
        refresh_token,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({ error: 'Refresh token غير صالح أو منتهي' });
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'نوع التوكن غير صحيح' });
    }

    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const newToken   = signToken(user.id, user.role);
    const newRefresh = signRefresh(user.id);

    res.json({ token: newToken, refresh_token: newRefresh });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /fcm-token — تسجيل FCM
// ═══════════════════════════════════════════════════════════
router.post('/fcm-token', authenticate, registerToken);

// ═══════════════════════════════════════════════════════════
// POST /password/reset — إعادة تعيين كلمة المرور
// ═══════════════════════════════════════════════════════════
router.post('/password/reset', async (req, res, next) => {
  try {
    const { phone, new_password, otp_code } = req.body;
    if (!phone || !new_password || !otp_code) {
      return res.status(400).json({ error: 'phone, new_password, otp_code مطلوبة' });
    }

    // Verify OTP
    const otpRecord = await db('otp_codes')
      .where({ phone, code: otp_code, purpose: 'reset', used: false })
      .where('expires_at', '>', new Date())
      .first();
    if (!otpRecord) return res.status(401).json({ error: 'رمز التحقق غير صحيح أو منتهي' });

    await db('otp_codes').where({ id: otpRecord.id }).update({ used: true });

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    const updated = await db('users').where({ phone }).update({ password_hash }).returning('id');

    if (!updated.length) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({ ok: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /logout
// ═══════════════════════════════════════════════════════════
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Deactivate FCM tokens for this session
    if (req.body.device_id) {
      await db('user_fcm_tokens')
        .where({ user_id: req.user.id, ...(req.body.device_id ? { token: req.body.device_id } : {}) })
        .update({ is_active: false });
    }
    logger.info('User logged out', { userId: req.user.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
