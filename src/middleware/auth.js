const jwt = require('jsonwebtoken');
const db   = require('../db');

// ── Verify JWT and attach user to request ─────────────────
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await db('users').where({ id: payload.sub }).first(
      'id','role','full_name','phone','email','lang_preference','is_verified','country_id'
    );
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ── Role guard factory ────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Requires: ${roles.join(' or ')}` });
  }
  next();
};

// ── Predefined role guards ────────────────────────────────
const isAdmin      = requireRole('super_admin');
const isAdminOrOps = requireRole('super_admin','operations');
const isFinance    = requireRole('super_admin','finance');
const isMarketing  = requireRole('super_admin','marketing');
const isChef       = requireRole('chef');
const isCourier    = requireRole('courier');
const isCustomer   = requireRole('customer');

// ── Kitchen ownership guard ───────────────────────────────
const ownsKitchen = async (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  const kitchenId = req.params.kitchen_id || req.params.id || req.body.kitchen_id;
  if (!kitchenId) return next();
  const k = await db('kitchens').where({ id: kitchenId, user_id: req.user.id }).first('id');
  if (!k) return res.status(403).json({ error: 'You do not own this kitchen' });
  next();
};

module.exports = {
  authenticate, requireRole,
  isAdmin, isAdminOrOps, isFinance, isMarketing,
  isChef, isCourier, isCustomer, ownsKitchen,
};
