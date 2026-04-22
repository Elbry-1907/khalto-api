/**
 * Khalto — Live Chat System
 *
 * 3 أنواع شات:
 * 1. عميل ↔ خدمة العملاء  (support chat)
 * 2. عميل ↔ مندوب          (delivery chat — مرتبط بطلب)
 * 3. عميل ↔ شيف            (order questions)
 *
 * GET    /api/v1/chat/conversations          — محادثات المستخدم
 * GET    /api/v1/chat/conversations/:id      — تفاصيل محادثة
 * POST   /api/v1/chat/conversations          — بدء محادثة جديدة
 * GET    /api/v1/chat/conversations/:id/messages — رسائل محادثة
 * POST   /api/v1/chat/conversations/:id/messages — إرسال رسالة
 * PATCH  /api/v1/chat/conversations/:id/read    — تعليم مقروء
 * POST   /api/v1/chat/conversations/:id/close   — إغلاق محادثة
 * GET    /api/v1/chat/admin/queue               — طابور خدمة العملاء
 * POST   /api/v1/chat/admin/assign              — تعيين موظف
 */

const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db     = require('../db');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { notify } = require('../services/push.service');

// ── Helper: emit socket to room ───────────────────────────
const emitToRoom = (io, room, event, data) => {
  if (io) io.to(room).emit(event, data);
};

// ── Helper: get or create conversation ───────────────────
const findOrCreateConversation = async ({ type, orderId, customerId, participantId }) => {
  // Check existing open conversation
  let conv = await db('chat_conversations')
    .where({ type, customer_id: customerId, status: 'open' })
    .modify(q => { if (orderId) q.where({ order_id: orderId }); })
    .first();

  if (!conv) {
    [conv] = await db('chat_conversations').insert({
      id:             uuid(),
      type,           // support | courier | chef
      order_id:       orderId || null,
      customer_id:    customerId,
      participant_id: participantId || null, // courier_id or kitchen user_id
      status:         'open',
      unread_customer: 0,
      unread_agent:    0,
      created_at:     new Date(),
      updated_at:     new Date(),
    }).returning('*');
  }
  return conv;
};

// ═══════════════════════════════════════════════════════════
// GET /conversations
// ═══════════════════════════════════════════════════════════
router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const { status = 'open' } = req.query;
    const userId = req.user.id;
    const role   = req.user.role;

    let q = db('chat_conversations as c')
      .leftJoin('orders as o',  'o.id', 'c.order_id')
      .leftJoin('users as cu',  'cu.id', 'c.customer_id')
      .orderBy('c.updated_at', 'desc');

    if (status !== 'all') q = q.where('c.status', status);

    // Filter by role
    if (role === 'customer') {
      q = q.where('c.customer_id', userId);
    } else if (role === 'courier') {
      const courier = await db('couriers').where({ user_id: userId }).first('id');
      if (courier) q = q.where('c.type', 'courier').where('c.participant_id', courier.id);
    } else if (role === 'chef') {
      const kitchen = await db('kitchens').where({ user_id: userId }).first('id');
      if (kitchen) q = q.where('c.type', 'chef').where('c.participant_id', kitchen.id);
    } else {
      // Support agents: see all support conversations
      q = q.where('c.type', 'support');
      if (role === 'customer_service') {
        q = q.where(b => b.where('c.assigned_to', userId).orWhereNull('c.assigned_to'));
      }
    }

    const convs = await q.select(
      'c.*',
      'cu.full_name as customer_name',
      'cu.avatar_url as customer_avatar',
      'o.order_number',
    );

    // Attach last message to each
    for (const conv of convs) {
      conv.last_message = await db('chat_messages')
        .where({ conversation_id: conv.id })
        .orderBy('created_at', 'desc')
        .first('content','created_at','sender_id');
    }

    res.json({ conversations: convs });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /conversations — start new conversation
// ═══════════════════════════════════════════════════════════
router.post('/conversations', authenticate, async (req, res, next) => {
  try {
    const { type, order_id, initial_message } = req.body;
    // type: support | courier | chef

    if (!['support','courier','chef'].includes(type)) {
      return res.status(400).json({ error: 'type must be: support | courier | chef' });
    }

    let participantId = null;

    // Validate order and get participant
    if (order_id) {
      const order = await db('orders').where({ id: order_id }).first();
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (order.customer_id !== req.user.id) return res.status(403).json({ error: 'ليس طلبك' });

      if (type === 'courier' && order.courier_id) participantId = order.courier_id;
      if (type === 'chef')    participantId = order.kitchen_id;
    }

    const conv = await findOrCreateConversation({
      type,
      orderId:       order_id,
      customerId:    req.user.id,
      participantId,
    });

    // Send initial message if provided
    if (initial_message?.trim()) {
      const [msg] = await db('chat_messages').insert({
        id:              uuid(),
        conversation_id: conv.id,
        sender_id:       req.user.id,
        sender_role:     req.user.role,
        content:         initial_message.trim(),
        type:            'text',
        created_at:      new Date(),
      }).returning('*');

      // Notify participant
      if (type === 'support') {
        // Notify all available support agents
        const agents = await db('users')
          .where({ role: 'customer_service', is_active: true }).pluck('id');
        for (const agentId of agents) {
          await notify.orderConfirmed(agentId, { orderNumber: conv.id.slice(0,8), kitchenName: 'Support', eta: 0 })
            .catch(() => {});
        }
      }

      // Emit via Socket.IO
      emitToRoom(req.io, `conv:${conv.id}`, 'chat:message', {
        ...msg, sender_name: req.user.full_name,
      });
    }

    res.status(201).json({ conversation: conv });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// GET /conversations/:id/messages
// ═══════════════════════════════════════════════════════════
router.get('/conversations/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const conv = await db('chat_conversations').where({ id: req.params.id }).first();
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const messages = await db('chat_messages as m')
      .leftJoin('users as u', 'u.id', 'm.sender_id')
      .where({ 'm.conversation_id': req.params.id })
      .orderBy('m.created_at', 'asc')
      .limit(limit).offset((page - 1) * limit)
      .select(
        'm.*',
        'u.full_name as sender_name',
        'u.avatar_url as sender_avatar',
        'u.role as sender_role',
      );

    res.json({ messages, conversation: conv });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /conversations/:id/messages — send message
// ═══════════════════════════════════════════════════════════
router.post('/conversations/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { content, type = 'text', attachment_url } = req.body;
    if (!content?.trim() && !attachment_url) {
      return res.status(400).json({ error: 'الرسالة فارغة' });
    }

    const conv = await db('chat_conversations').where({ id: req.params.id, status: 'open' }).first();
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة أو مغلقة' });

    const [msg] = await db('chat_messages').insert({
      id:              uuid(),
      conversation_id: req.params.id,
      sender_id:       req.user.id,
      sender_role:     req.user.role,
      content:         content?.trim() || '',
      type,            // text | image | location | quick_reply
      attachment_url:  attachment_url || null,
      is_read:         false,
      created_at:      new Date(),
    }).returning('*');

    // Update conversation last activity + unread count
    const isAgent = ['customer_service','operations','super_admin'].includes(req.user.role);
    await db('chat_conversations').where({ id: req.params.id }).update({
      updated_at:      new Date(),
      last_message_at: new Date(),
      unread_customer: isAgent
        ? db.raw('unread_customer + 1')
        : db.raw('unread_customer'),
      unread_agent: !isAgent
        ? db.raw('unread_agent + 1')
        : db.raw('unread_agent'),
    });

    const msgWithSender = {
      ...msg,
      sender_name:   req.user.full_name,
      sender_avatar: req.user.avatar_url,
    };

    // Emit to conversation room via Socket.IO
    emitToRoom(req.io, `conv:${req.params.id}`, 'chat:message', msgWithSender);

    // Push notification to the other party
    const recipientId = isAgent ? conv.customer_id : conv.assigned_to;
    if (recipientId) {
      await sendToUser(recipientId, {
        titleAr: 'رسالة جديدة 💬',
        titleEn: 'New message 💬',
        bodyAr:  content?.slice(0, 80) || 'تم إرسال ملف',
        bodyEn:  content?.slice(0, 80) || 'File sent',
        data:    { type: 'chat', conversation_id: req.params.id },
        lang:    req.user.lang_preference || 'ar',
      }).catch(() => {});
    }

    res.status(201).json({ message: msgWithSender });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// PATCH /conversations/:id/read
// ═══════════════════════════════════════════════════════════
router.patch('/conversations/:id/read', authenticate, async (req, res, next) => {
  try {
    const isAgent = ['customer_service','operations','super_admin'].includes(req.user.role);

    await db('chat_messages')
      .where({ conversation_id: req.params.id, is_read: false })
      .whereNot({ sender_id: req.user.id })
      .update({ is_read: true, read_at: new Date() });

    await db('chat_conversations').where({ id: req.params.id }).update(
      isAgent ? { unread_agent: 0 } : { unread_customer: 0 }
    );

    emitToRoom(req.io, `conv:${req.params.id}`, 'chat:read', {
      conversation_id: req.params.id,
      read_by:         req.user.id,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// POST /conversations/:id/close
// ═══════════════════════════════════════════════════════════
router.post('/conversations/:id/close', authenticate, async (req, res, next) => {
  try {
    const { resolution } = req.body;
    await db('chat_conversations').where({ id: req.params.id }).update({
      status:      'closed',
      resolved_at: new Date(),
      resolution:  resolution || null,
    });
    emitToRoom(req.io, `conv:${req.params.id}`, 'chat:closed', { conversation_id: req.params.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// Admin: GET /admin/queue — support queue
// ═══════════════════════════════════════════════════════════
router.get('/admin/queue', authenticate,
  requireRole('super_admin','customer_service','operations'),
  async (req, res, next) => {
  try {
    const queue = await db('chat_conversations as c')
      .leftJoin('users as cu', 'cu.id', 'c.customer_id')
      .leftJoin('users as ag', 'ag.id', 'c.assigned_to')
      .where({ 'c.type': 'support', 'c.status': 'open' })
      .orderBy('c.created_at', 'asc')
      .select(
        'c.*',
        'cu.full_name as customer_name', 'cu.phone as customer_phone',
        'ag.full_name as agent_name',
      );

    const stats = {
      total_open:     queue.length,
      unassigned:     queue.filter(q => !q.assigned_to).length,
      assigned:       queue.filter(q =>  q.assigned_to).length,
      avg_wait_min:   queue.length ? Math.round(
        queue.reduce((s, q) => s + (Date.now() - new Date(q.created_at)) / 60000, 0) / queue.length
      ) : 0,
    };

    res.json({ queue, stats });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// Admin: POST /admin/assign — assign to agent
// ═══════════════════════════════════════════════════════════
router.post('/admin/assign', authenticate,
  requireRole('super_admin','customer_service'),
  async (req, res, next) => {
  try {
    const { conversation_id, agent_id } = req.body;
    await db('chat_conversations')
      .where({ id: conversation_id })
      .update({ assigned_to: agent_id, assigned_at: new Date() });

    // Notify agent
    await sendToUser(agent_id, {
      titleAr: '📋 محادثة معيّنة لك',
      titleEn: '📋 Conversation assigned to you',
      bodyAr:  'انقر للرد على العميل',
      bodyEn:  'Click to reply to the customer',
      data:    { type: 'chat_assigned', conversation_id },
      lang:    'ar',
    }).catch(() => {});

    emitToRoom(req.io, `conv:${conversation_id}`, 'chat:assigned', { agent_id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// Quick replies (pre-defined responses)
// ═══════════════════════════════════════════════════════════
router.get('/quick-replies', authenticate,
  requireRole('super_admin','customer_service','operations'),
  async (req, res, next) => {
  try {
    const replies = await db('chat_quick_replies')
      .where({ is_active: true, lang: req.query.lang || 'ar' })
      .orderBy('sort_order');
    res.json({ replies });
  } catch (err) { next(err); }
});

const { sendToUser } = require('../services/push.service');
module.exports = router;
