process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.PGSSLMODE = 'no-verify';
process.env.PGSSLMODE = 'no-verify';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
  securityHeaders, corsOptions, apiLimiter,
  authLimiter, otpByPhone, paymentLimiter,
  uploadLimiter, adminLimiter,
  sanitizeInput, preventHPP, requestId, requestLogger,
  xssClean, blockPathTraversal, blockSQLInjection, ipBlocklist,
} = require('./middleware/security');

// ── Routes ────────────────────────────────────────────────
const routes = {
  auth:          require('./routes/auth'),
  users:         require('./routes/users'),
  kitchens:      require('./routes/kitchens'),
  menu:          require('./routes/menu'),
  orders:        require('./routes/orders'),
  couriers:      require('./routes/couriers'),
  payments:      require('./routes/payments'),
  settlements:   require('./routes/settlements'),
  coupons:       require('./routes/coupons'),
  notifications: require('./routes/notifications'),
  support:       require('./routes/support'),
  admin:         require('./routes/admin'),
  countries:     require('./routes/countries'),
  uploads:       require('./routes/uploads'),
  ads:           require('./routes/ads'),
  commission:    require('./routes/commission'),
  chat:          require('./routes/chat'),
};

// ── App setup ─────────────────────────────────────────────
const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, {
  cors: corsOptions,
  transports: ['websocket','polling'],
});

app.set('trust proxy', 1);
app.set('io', io); // Make io accessible in webhooks via req.app.get('io')

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
  app.use(`${v1}/${name}`, router);
});

// Extra feature routes
const { loyaltyRouter, walletRouter, referralRouter, scheduledRouter } = require('./routes/extras');
app.use(`${v1}/loyalty`,           loyaltyRouter);
app.use(`${v1}/wallet`,            walletRouter);
app.use(`${v1}/referral`,          referralRouter);
app.use(`${v1}/orders/scheduled`,  scheduledRouter);

// New feature routes
const { pricingRouter }     = require('./routes/pricing');
const { analyticsRouter }   = require('./routes/analytics');
const { foodSafetyRouter }  = require('./routes/food-safety');
app.use(`${v1}/pricing`,      pricingRouter);
app.use(`${v1}/analytics`,    analyticsRouter);
app.use(`${v1}/food-safety`,  foodSafetyRouter);
app.use(`${v1}/branding`,     require('./routes/branding'));
app.use(`${v1}/privacy`,      require('./routes/privacy'));

// Advanced features
const { smartNotifRouter, batchingRouter, kitchenScoreRouter, subscriptionsRouter, processSmartNotifications } = require('./routes/advanced');
app.use(`${v1}/smart-notifications`, smartNotifRouter);
app.use(`${v1}/batching`,            batchingRouter);
app.use(`${v1}/kitchen-score`,       kitchenScoreRouter);
app.use(`${v1}/subscriptions`,       subscriptionsRouter);

// Smart notification worker — runs every 5 minutes
setInterval(processSmartNotifications, 5 * 60 * 1000);

// ── Swagger docs (non-production) ─────────────────────────
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
  logger.info('📖 Swagger docs: http://localhost:3000/api/docs');
}

// ── Socket.IO ─────────────────────────────────────────────
require('./sockets')(io);

// ── Error handlers ────────────────────────────────────────
app.use(handleMulterError);
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
httpServer.listen(PORT, () => {
  logger.info(`🚀 Khalto API v2.0.0 running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  logger.info(`📋 Routes: ${Object.keys(routes).map(r => `/api/v1/${r}`).join(', ')}`);
  initFirebase();
});

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
process.on('uncaughtException',  err    => { logger.error('Uncaught exception', { err }); process.exit(1); });

module.exports = { app, io };


