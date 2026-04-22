const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, isAdmin, isSuperAdmin } = require('../middleware/auth');

router.post('/tickets', authenticate, async (req, res, next) => {
  try {
    const { order_id, issue_type, subject, description } = req.body;
    const [ticket] = await db('support_tickets').insert({
      id: uuid(), order_id, reporter_id: req.user.id,
      issue_type, subject, description, status: 'open',
    }).returning('*');
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

router.get('/tickets', authenticate, async (req, res, next) => {
  try {
    const isStaff = ['super_admin','operations','customer_service','finance'].includes(req.user.role);
    let query = db('support_tickets').orderBy('created_at', 'desc');
    if (!isStaff) query = query.where({ reporter_id: req.user.id });
    const tickets = await query;
    res.json({ tickets });
  } catch (err) { next(err); }
});

router.get('/tickets/:id', authenticate, async (req, res, next) => {
  try {
    const ticket = await db('support_tickets').where({ id: req.params.id }).first();
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    const messages = await db('ticket_messages')
      .where({ ticket_id: ticket.id }).orderBy('created_at');
    res.json({ ticket: { ...ticket, messages } });
  } catch (err) { next(err); }
});

router.post('/tickets/:id/messages', authenticate, async (req, res, next) => {
  try {
    const [msg] = await db('ticket_messages').insert({
      id: uuid(), ticket_id: req.params.id,
      sender_id: req.user.id,
      message: req.body.message,
      attachments: req.body.attachments || [],
    }).returning('*');
    res.status(201).json({ message: msg });
  } catch (err) { next(err); }
});

router.patch('/tickets/:id/status', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { status, resolution } = req.body;
    const updates = { status, updated_at: new Date() };
    if (['resolved','closed'].includes(status)) {
      updates.resolved_by = req.user.id;
      updates.resolved_at = new Date();
      if (resolution) updates.resolution = resolution;
    }
    await db('support_tickets').where({ id: req.params.id }).update(updates);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/tickets/:id/compensate', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { user_id, type, amount, order_id } = req.body;
    const [comp] = await db('compensations').insert({
      id: uuid(), ticket_id: req.params.id,
      order_id, user_id, type, amount,
      approved_by: req.user.id, approved_at: new Date(),
    }).returning('*');
    if (type === 'credit' && amount) {
      await db('wallets').where({ user_id }).increment('balance', amount);
      const w = await db('wallets').where({ user_id }).first('id');
      await db('wallet_transactions').insert({
        id: uuid(), wallet_id: w.id, amount,
        type: 'refund', note: `Compensation ticket ${req.params.id}`,
      });
    }
    res.status(201).json({ compensation: comp });
  } catch (err) { next(err); }
});

module.exports = router;
