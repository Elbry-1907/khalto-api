process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.PGSSLMODE = 'no-verify';
require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const compression   = require('compression');
const { createServer } = require('http');
const { Server }    = require('socket.io');

const db            = require('./db');
const logger        = require('./utils/logger');
const { setupSwagger } = require('./utils/swagger');
const { initFirebase } = require('./services/push.service');
const { errorHandler, notFound } = require('./middleware/errors');
const { handleMulterError }      = require('./services/upload.service');
const {
  securityHeaders, corsOptions, api: apiLimiter,
  auth: authLimiter, otpByPhone, payment: paymentLimiter,
  upload: uploadLimiter, admin: adminLimiter,
  sanitizeInput, preventHPP, requestId, requestLogger,
  xssClean, blockPathTraversal, blockSQLInjection, ipBlocklist,
} = require('./middleware/security');

// ── Routes ────────────────────────────────────────────────
let routes = {};
const routeFiles = {
  auth:          './routes/auth',
  users:         './routes/users',
  kitchens:      './routes/kitchens',
  menu:          './routes/menu',
  orders:        './routes/orders',
  couriers:      './routes/couriers',
  payments:      './routes/payments',
  settlements:   './routes/settlements',
  coupons:       './routes/coupons',
  notifications: './routes/notifications',
  support:       './routes/support',
  admin:         './routes/admin',
  countries:     './routes/countries',
  uploads:       './routes/uploads',
  ads:           './routes/ads',
  commission:    './routes/commission',
  chat:          './routes/chat',
};

for (const [name, path] of Object.entries(routeFiles)) {
  try {
    routes[name] = require(path);
    logger.info(`✅ Route loaded: ${name}`);
  } catch (err) {
    logger.error(`❌ Failed to load route: ${name}`, { path, error: err.message });
    routes[name] = null; // Mark as failed but don't throw
  }
}

// ── App setup ─────────────────────────────────────────────
const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: corsOptions,
  transports: ['websocket','polling'],
});

app.set('trust proxy', 1);
app.set('io', io);
// -- Dashboard static files --
const path = require('path');
app.use('/khalto-api-dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// ── Core middleware ───────────────────────────────────────
app.use(requestId);
app.use(requestLogger);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(compression());
app.use(sanitizeInput);
app.use(preventHPP);
app.use(xssClean);
app.use(blockPathTraversal);
app.use(blockSQLInjection);
app.use(ipBlocklist);

// Raw body for webhook signature verification
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limits ───────────────────────────────────────────
app.use('/api/', apiLimiter);
app.use('/api/v1/auth/login',       authLimiter);
app.use('/api/v1/auth/register',    authLimiter);
app.use('/api/v1/auth/otp/send',    otpByPhone);
app.use('/api/v1/payments/initiate',paymentLimiter);
app.use('/api/v1/upload',           uploadLimiter);
app.use('/api/v1/admin',            adminLimiter);

// Attach socket.io to request
app.use((req, _, next) => { req.io = io; next(); });

// ── Health check ──────────────────────────────────────────
app.get('/health', async (_, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({
      status:  'ok',
      version: process.env.npm_package_version || '2.0.0',
      env:     process.env.NODE_ENV,
      ts:      new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── API routes ────────────────────────────────────────────
const v1 = '/api/v1';
Object.entries(routes).forEach(([name, router]) => {
  if (!router) {
    logger.warn(`⚠️  Skipping undefined route: ${name}`);
    return;
  }
  app.use(`${v1}/${name}`, router);
});

// Extra feature routes
let loyaltyRouter, walletRouter, referralRouter, scheduledRouter;
let pricingRouter, analyticsRouter, foodSafetyRouter;
let smartNotifRouter, batchingRouter, kitchenScoreRouter, subscriptionsRouter, processSmartNotifications;

try {
  ({ loyaltyRouter, walletRouter, referralRouter, scheduledRouter } = require('./routes/extras'));
  app.use(`${v1}/loyalty`,           loyaltyRouter);
  app.use(`${v1}/wallet`,            walletRouter);
  app.use(`${v1}/referral`,          referralRouter);
  app.use(`${v1}/orders/scheduled`,  scheduledRouter);
} catch (err) {
  logger.error('Failed to load extras routes', { error: err.message });
  throw err;
}

// New feature routes
try {
  ({ pricingRouter } = require('./routes/pricing'));
  ({ analyticsRouter } = require('./routes/analytics'));
  ({ foodSafetyRouter } = require('./routes/food-safety'));
  app.use(`${v1}/pricing`,      pricingRouter);
  app.use(`${v1}/analytics`,    analyticsRouter);
  app.use(`${v1}/food-safety`,  foodSafetyRouter);
} catch (err) {
  logger.error('Failed to load pricing/analytics/food-safety routes', { error: err.message });
  throw err;
}

// Branding and privacy routes
try {
  app.use(`${v1}/branding`,     require('./routes/branding'));
  app.use(`${v1}/privacy`,      require('./routes/privacy'));
} catch (err) {
  logger.error('Failed to load branding/privacy routes', { error: err.message });
  throw err;
}

// Advanced features
try {
  ({ smartNotifRouter, batchingRouter, kitchenScoreRouter, subscriptionsRouter, processSmartNotifications } = require('./routes/advanced'));
  app.use(`${v1}/smart-notifications`, smartNotifRouter);
  app.use(`${v1}/batching`,            batchingRouter);
  app.use(`${v1}/kitchen-score`,       kitchenScoreRouter);
  app.use(`${v1}/subscriptions`,       subscriptionsRouter);
} catch (err) {
  logger.error('Failed to load advanced routes', { error: err.message });
  throw err;
}

// Smart notification worker — runs every 5 minutes
if (processSmartNotifications && typeof processSmartNotifications === 'function') {
  setInterval(processSmartNotifications, 5 * 60 * 1000);
}

// ── Swagger docs (non-production) ─────────────────────────
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
  logger.info('📖 Swagger docs: http://localhost:3000/api/docs');
}

// ── Socket.IO ─────────────────────────────────────────────
try {
  require('./sockets')(io);
} catch (err) {
  logger.error('Failed to initialize Socket.IO', { error: err.message });
  throw err;
}

// ── Error handlers ────────────────────────────────────────
app.use(handleMulterError);
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');

// Wrap startup in async to catch any errors
(async () => {
  try {
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Khalto API v2.0.0 running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      logger.info(`📋 Routes: ${Object.keys(routes).map(r => `/api/v1/${r}`).join(', ')}`);
      initFirebase();
    });
  } catch (err) {
    logger.error('🔥 Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
})();

// ── Graceful shutdown ─────────────────────────────────────
const shutdown = async signal => {
  logger.info(`${signal} — shutting down gracefully`);
  httpServer.close(async () => {
    await db.destroy();
    logger.info('💤 Server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('Force exit'); process.exit(1); }, 15000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', reason => logger.error('Unhandled rejection', { reason }));
process.on('uncaughtException', err => { logger.error('Uncaught exception', { err }); });

module.exports = { app, io };




