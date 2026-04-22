// ============================================================
// src/sockets/index.js  — Real-time events
// ============================================================
const jwt = require('jsonwebtoken');
const db  = require('./db');

module.exports = (io) => {

  // Auth middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {

    // Join order room (customer, chef, courier, admin)
    socket.on('order:join', ({ order_id }) => {
      socket.join(`order_${order_id}`);
    });

    // Courier location update (every 10s while delivering)
    socket.on('courier:location', async ({ order_id, lat, lng }) => {
      if (socket.userRole !== 'courier') return;
      // Update courier location in DB
      await db('couriers')
        .where(db.raw("user_id = ?", [socket.userId]))
        .update({ current_lat: lat, current_lng: lng, updated_at: new Date() });
      // Broadcast to order room
      io.to(`order_${order_id}`).emit('courier:location', { lat, lng, ts: Date.now() });
    });

    // Chef online/offline toggle
    socket.on('kitchen:toggle', async ({ is_open }) => {
      if (socket.userRole !== 'chef') return;
      await db('kitchens')
        .where({ user_id: socket.userId })
        .update({ is_open });
    });

    // Courier availability toggle
    socket.on('courier:availability', async ({ availability }) => {
      if (socket.userRole !== 'courier') return;
      await db('couriers')
        .where({ user_id: socket.userId })
        .update({ availability, updated_at: new Date() });
    });

    socket.on('disconnect', () => {});
  });
};
