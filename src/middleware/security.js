/**
 * Khalto — Security Middleware v2.0
 * SQL Injection · XSS · CSRF · DDoS · Brute Force · Path Traversal
 */

const rateLimit     = require('express-rate-limit');
const helmet        = require('helmet');
const hpp           = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const crypto        = require('crypto');
const { v4: uuid }  = require('uuid');
const logger        = require('../utils/logger');

// ── 1. Helmet ─────────────────────────────────────────────
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
  hsts:       { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff:    true,
  xssFilter:  true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});

// ── 2. Rate Limiters ──────────────────────────────────────
const makeLimit = (windowMs, max, msg) => rateLimit({
  windowMs, max,
  standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit hit', { ip: req.ip, path: req.path });
    res.status(429).json({ error: msg, retry_after: Math.ceil(windowMs / 1000) });
  },
});

const limiters = {
  api:           makeLimit(15 * 60 * 1000, 300,  'Too many requests.'),
  auth:          makeLimit(15 * 60 * 1000, 10,   'Too many login attempts. Wait 15 minutes.'),
  otpSend:       makeLimit(60 * 60 * 1000, 5,    'Too many OTP requests. Wait 1 hour.'),
  otpVerify:     makeLimit(15 * 60 * 1000, 10,   'Too many OTP attempts.'),
  payment:       makeLimit(60 * 1000,       20,   'Too many payment requests.'),
  upload:        makeLimit(5  * 60 * 1000,  10,   'Upload limit exceeded.'),
  admin:         makeLimit(15 * 60 * 1000,  500,  'Admin rate limit.'),
  registration:  makeLimit(60 * 60 * 1000,  5,    'Too many registrations.'),
  passwordReset: makeLimit(60 * 60 * 1000,  3,    'Too many password reset attempts.'),
  publicSearch:  makeLimit(60 * 1000,        30,   'Search limit exceeded.'),
};

// OTP rate limit by phone number
const otpByPhone = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  keyGenerator: req => `otp:${req.body?.phone || req.ip}`,
  handler: (_, res) => res.status(429).json({ error: 'تجاوزت الحد. حاول بعد ساعة.' }),
});

// ── 3. Input Sanitization ─────────────────────────────────

// Strip MongoDB operators (SQL injection layer 1)
const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ key, req }) => logger.warn('Input sanitized', { key, ip: req?.ip }),
});

// HTTP Parameter Pollution prevention
const preventHPP = hpp({
  whitelist: ['status', 'role', 'channel', 'type', 'platform', 'ids'],
});

// XSS sanitizer
const xssClean = (req, res, next) => {
  const clean = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
        .replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '');
    }
    if (Array.isArray(obj)) return obj.map(clean);
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [clean(k), clean(v)]));
    }
    return obj;
  };
  if (req.body)  req.body  = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
};

// Block path traversal
const blockPathTraversal = (req, res, next) => {
  if (/(\.\.|%2e%2e|%252e)/i.test(req.path)) {
    logger.warn('Path traversal attempt', { ip: req.ip, path: req.path });
    return res.status(400).json({ error: 'Invalid request' });
  }
  next();
};

// Block SQL injection patterns
const blockSQLInjection = (req, res, next) => {
  const patterns = [
    /(\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b|\bEXEC\b)/i,
    /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i,
    /(--|\bxp_|\bsp_)/i,
  ];
  const check = (val) => typeof val === 'string' && patterns.some(p => p.test(val));
  const checkObj = (obj) => obj && typeof obj === 'object' &&
    Object.values(obj).some(v => check(String(v ?? '')));

  if (checkObj(req.body) || checkObj(req.query)) {
    logger.warn('SQL injection attempt', { ip: req.ip, path: req.path });
    return res.status(400).json({ error: 'Invalid input' });
  }
  next();
};

// ── 4. CSRF Protection ────────────────────────────────────
const csrfStore = new Map();

const generateCSRF = (req, res, next) => {
  if (req.headers['x-mobile-app']) return next(); // mobile exempt
  const token     = crypto.randomBytes(32).toString('hex');
  const sessionId = req.headers['x-session-id'] || uuid();
  csrfStore.set(sessionId, { token, exp: Date.now() + 3600000 });
  res.setHeader('X-CSRF-Token', token);
  res.setHeader('X-Session-ID', sessionId);
  next();
};

const verifyCSRF = (req, res, next) => {
  if (req.headers['x-mobile-app']) return next();
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (/\/webhook/.test(req.path)) return next();

  const sid   = req.headers['x-session-id'];
  const token = req.headers['x-csrf-token'];
  if (!sid || !token) return res.status(403).json({ error: 'CSRF token missing' });

  const stored = csrfStore.get(sid);
  if (!stored || stored.token !== token || stored.exp < Date.now()) {
    csrfStore.delete(sid);
    return res.status(403).json({ error: 'CSRF token invalid or expired' });
  }
  next();
};

// Cleanup CSRF store every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of csrfStore) if (v.exp < now) csrfStore.delete(k);
}, 600000);

// ── 5. CORS ───────────────────────────────────────────────
const corsOptions = {
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin || process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    logger.warn('CORS blocked', { origin });
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-ID','X-CSRF-Token','X-Session-ID','X-Mobile-App'],
  exposedHeaders: ['X-RateLimit-Limit','X-RateLimit-Remaining','X-Request-ID','X-CSRF-Token'],
  maxAge: 86400,
};

// ── 6. IP Blocklist ───────────────────────────────────────
const blockedIPs  = new Set((process.env.BLOCKED_IPS || '').split(',').filter(Boolean));
const failedAuths = new Map(); // ip -> { count, firstAt }

const ipBlocklist = (req, res, next) => {
  if (blockedIPs.has(req.ip)) {
    logger.warn('Blocked IP', { ip: req.ip });
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

const trackFailedAuth = (req, res, next) => {
  const origEnd = res.end.bind(res);
  res.end = (...args) => {
    if ([401, 403].includes(res.statusCode)) {
      const rec = failedAuths.get(req.ip) || { count: 0, firstAt: Date.now() };
      rec.count++;
      if (rec.count >= 20 && Date.now() - rec.firstAt < 3600000) {
        blockedIPs.add(req.ip);
        logger.warn('Auto-blocked IP', { ip: req.ip, count: rec.count });
      }
      failedAuths.set(req.ip, rec);
    }
    return origEnd(...args);
  };
  next();
};

// ── 7. Request Tracking ───────────────────────────────────
const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || uuid();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const lvl = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[lvl](`${req.method} ${req.path} ${res.statusCode} ${ms}ms`, {
      ip: req.ip, userId: req.user?.id, requestId: req.requestId,
    });
  });
  next();
};

// ── 8. Webhook Signature Verification ────────────────────

const verifyTapWebhook = (req, res, next) => {
  if (!process.env.TAP_SECRET_KEY) return next();
  const sig  = req.headers['hashstring'];
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const exp  = crypto.createHmac('sha256', process.env.TAP_SECRET_KEY).update(body).digest('hex');
  if (sig && sig !== exp) {
    logger.warn('Tap webhook signature mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
};

const verifyPaymobWebhook = (req, res, next) => {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) return next();
  const { obj } = req.body || {};
  if (!obj) return next();

  const fields = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order.id','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const hashStr  = fields.map(f => f.split('.').reduce((o, k) => o?.[k], obj) ?? '').join('');
  const computed = crypto.createHmac('sha512', secret).update(hashStr).digest('hex');
  const received = req.query.hmac || req.body.hmac;

  if (received && computed !== received) {
    logger.warn('Paymob HMAC mismatch');
  }
  next();
};

module.exports = {
  securityHeaders, corsOptions,
  requestId, requestLogger,
  ...limiters, limiters,
  otpByPhone,
  sanitizeInput, preventHPP, xssClean,
  blockPathTraversal, blockSQLInjection,
  generateCSRF, verifyCSRF,
  ipBlocklist, trackFailedAuth,
  verifyTapWebhook, verifyPaymobWebhook,
};
