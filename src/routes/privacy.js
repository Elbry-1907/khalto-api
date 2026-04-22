/**
 * Khalto — Data Privacy & PDPL/GDPR Compliance
 *
 * PDPL = نظام حماية البيانات الشخصية (السعودية)
 * GDPR = General Data Protection Regulation
 *
 * GET    /api/v1/privacy/my-data        — تصدير بيانات المستخدم
 * DELETE /api/v1/privacy/delete-account — حذف الحساب وكل البيانات
 * POST   /api/v1/privacy/consent        — تسجيل الموافقة
 * GET    /api/v1/privacy/consents       — سجل الموافقات
 */

const router  = require('express').Router();
const { v4: uuid } = require('uuid');
const db      = require('../db');
const logger  = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { maskPhone, maskEmail, maskIBAN } = require('../services/encryption.service');

// ═══════════════════════════════════════════════════════════
// GET /my-data — Data portability (PDPL Article 18)
// العميل يطلب كل بياناته المخزنة
// ═══════════════════════════════════════════════════════════
router.get('/my-data', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [user, orders, addresses, notifications, tickets, ratings] = await Promise.all([
      db('users').where({ id: userId }).first(
        'id','full_name','phone','email','lang_preference','created_at'
      ),
      db('orders').where({ customer_id: userId })
        .select('id','order_number','status','total_amount','created_at'),
      db('addresses').where({ user_id: userId }).select('label','address_line','created_at'),
      db('notifications').where({ user_id: userId }).select('title','body','created_at').limit(50),
      db('support_tickets').where({ customer_id: userId }).select('subject','status','created_at'),
      db('order_ratings').where({ customer_id: userId }).select('kitchen_rating','comment','created_at'),
    ]);

    // Mask sensitive fields in export
    const exportData = {
      exported_at:    new Date().toISOString(),
      personal_info:  {
        name:  user.full_name,
        phone: maskPhone(user.phone),
        email: maskEmail(user.email),
        joined: user.created_at,
      },
      orders:        orders.length,
      order_history: orders.slice(0, 50),
      saved_addresses: addresses,
      notifications: notifications,
      support_tickets: tickets,
      ratings:       ratings,
    };

    // Log data export for compliance
    await db('audit_logs').insert({
      id: uuid(), user_id: userId,
      action: 'DATA_EXPORT_REQUESTED',
      module: 'privacy', created_at: new Date(),
    });

    logger.info('User data exported', { userId });
    res.setHeader('Content-Disposition', `attachment; filename="khalto-data-${userId}.json"`);
    res.json({ data: exportData });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// DELETE /delete-account — Right to erasure (PDPL Article 19)
// ═══════════════════════════════════════════════════════════
router.delete('/delete-account', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { reason, password_confirm } = req.body;

    // Log deletion request
    await db('audit_logs').insert({
      id: uuid(), user_id: userId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      module: 'privacy',
      new_data: JSON.stringify({ reason }),
      created_at: new Date(),
    });

    // Anonymize instead of hard delete (for financial records compliance)
    await db.transaction(async trx => {
      // Anonymize user PII
      await trx('users').where({ id: userId }).update({
        full_name:  'Deleted User',
        phone:      null,
        email:      null,
        avatar_url: null,
        is_active:  false,
        deleted_at: new Date(),
      });

      // Anonymize addresses
      await trx('addresses').where({ user_id: userId }).delete();

      // Deactivate FCM tokens
      await trx('user_fcm_tokens').where({ user_id: userId }).delete();

      // Revoke social accounts
      await trx('user_social_accounts').where({ user_id: userId }).delete();

      // Deactivate biometrics
      await trx('user_biometric_keys').where({ user_id: userId }).delete();

      // Anonymize order customer data (keep for financial records)
      await trx('orders').where({ customer_id: userId })
        .update({ delivery_address: 'ANONYMIZED', delivery_lat: null, delivery_lng: null });

      // Delete notifications
      await trx('notifications').where({ user_id: userId }).delete();
    });

    logger.info('Account deleted/anonymized', { userId });
    res.json({ ok: true, message: 'تم حذف حسابك وأُخفيت بياناتك الشخصية بنجاح.' });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /consent — Record user consent
// ═══════════════════════════════════════════════════════════
router.post('/consent', authenticate, async (req, res, next) => {
  try {
    const { type, granted, version } = req.body;
    // types: terms_of_service | privacy_policy | marketing | analytics | cookies

    if (!type || granted === undefined) {
      return res.status(400).json({ error: 'type و granted مطلوبان' });
    }

    await db('user_consents').insert({
      id:         uuid(),
      user_id:    req.user.id,
      type,
      granted:    !!granted,
      version:    version || '1.0',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date(),
    }).onConflict(['user_id','type']).merge({ granted: !!granted, version, updated_at: new Date() });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /consents — View consent history
// ═══════════════════════════════════════════════════════════
router.get('/consents', authenticate, async (req, res, next) => {
  try {
    const consents = await db('user_consents')
      .where({ user_id: req.user.id })
      .select('type','granted','version','created_at');
    res.json({ consents });
  } catch (err) { next(err); }
});

module.exports = router;
