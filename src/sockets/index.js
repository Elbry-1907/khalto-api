const jwt    = require('jsonwebtoken');
const db     = require('../db');
const { v4: uuid } = require('uuid');

module.exports = (io) => {
  // ── Socket auth ───────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Auth required'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await db('users').where({ id: payload.sub })
        .first('id','role','full_name','avatar_url');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    socket.join(`user:${user.id}`);

    // ── Chat: join conversation ───────────────────────────
    socket.on('chat:join', async ({ conversation_id }) => {
      const conv = await db('chat_conversations').where({ id: conversation_id }).first();
      if (!conv) return socket.emit('error', { message: 'Not found' });
      const ok = conv.customer_id === user.id ||
        conv.assigned_to === user.id ||
        ['customer_service','operations','super_admin'].includes(user.role);
      if (!ok) return socket.emit('error', { message: 'Access denied' });
      socket.join(`conv:${conversation_id}`);
      socket.emit('chat:joined', { conversation_id });
      io.to(`conv:${conversation_id}`).emit('chat:presence', {
        user_id: user.id, name: user.full_name, status: 'online', conv_id: conversation_id,
      });
    });

    socket.on('chat:leave', ({ conversation_id }) => {
      socket.leave(`conv:${conversation_id}`);
      io.to(`conv:${conversation_id}`).emit('chat:presence', {
        user_id: user.id, status: 'offline', conv_id: conversation_id,
      });
    });

    // ── Typing indicator ──────────────────────────────────
    socket.on('chat:typing', ({ conversation_id, is_typing }) => {
      socket.to(`conv:${conversation_id}`).emit('chat:typing', {
        user_id: user.id, name: user.full_name, is_typing,
      });
    });

    // ── Send message via socket ───────────────────────────
    socket.on('chat:send', async ({ conversation_id, content, type = 'text' }) => {
      try {
        if (!content?.trim()) return;
        const conv = await db('chat_conversations')
          .where({ id: conversation_id, status: 'open' }).first();
        if (!conv) return socket.emit('error', { message: 'Conversation closed' });

        const [msg] = await db('chat_messages').insert({
          id: uuid(), conversation_id,
          sender_id: user.id, sender_role: user.role,
          content: content.trim(), type, is_read: false, created_at: new Date(),
        }).returning('*');

        await db('chat_conversations').where({ id: conversation_id })
          .update({ updated_at: new Date(), last_message_at: new Date() });

        io.to(`conv:${conversation_id}`).emit('chat:message', {
          ...msg, sender_name: user.full_name, sender_avatar: user.avatar_url,
        });
      } catch (err) { socket.emit('error', { message: err.message }); }
    });

    // ── Order tracking ────────────────────────────────────
    socket.on('order:join', ({ order_id }) => socket.join(`order:${order_id}`));

    // Mark messages as read
    socket.on('chat:read', async ({ conversation_id }) => {
      try {
        await require('../db')('chat_messages')
          .where({ conversation_id, is_read: false })
          .whereNot({ sender_id: user.id })
          .update({ is_read: true, read_at: new Date() });
        io.to(`conv:${conversation_id}`).emit('chat:read', {
          conversation_id, read_by: user.id,
        });
      } catch { /* ignore */ }
    });

    socket.on('courier:location', async ({ order_id, lat, lng }) => {
      if (user.role !== 'courier') return;
      io.to(`order:${order_id}`).emit('courier:location', { lat, lng, ts: Date.now() });
      await db('couriers').where({ user_id: user.id })
        .update({ current_lat: lat, current_lng: lng, last_seen_at: new Date() }).catch(() => {});
    });

    socket.on('order:status', ({ order_id, status }) => {
      io.to(`order:${order_id}`).emit('order:status', { order_id, status, ts: Date.now() });
    });

    // ── Chef: new order alert ─────────────────────────────
    socket.on('chef:join', ({ kitchen_id }) => socket.join(`kitchen:${kitchen_id}`));

    // ── Support queue ─────────────────────────────────────
    if (['customer_service','operations','super_admin'].includes(user.role)) {
      socket.join('support:queue');
    }

    // ── Disconnect ────────────────────────────────────────
    socket.on('disconnect', () => {
      socket.rooms.forEach(room => {
        if (room.startsWith('conv:')) {
          io.to(room).emit('chat:presence', { user_id: user.id, status: 'offline' });
        }
      });
    });
  });
};
