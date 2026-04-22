const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi    = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Khalto API',
      version:     '1.0.0',
      description: 'Home-cooked food delivery marketplace — REST API',
      contact:     { name: 'Khalto Dev', email: 'dev@khalto.app' },
    },
    servers: [
      { url: 'https://api.khalto.app/api/v1',  description: 'Production' },
      { url: 'https://staging.khalto.app/api/v1', description: 'Staging' },
      { url: 'http://localhost:3000/api/v1',    description: 'Development' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT token from /auth/login or /auth/otp/verify',
        },
      },
      schemas: {
        // ── Common ──
        Error: {
          type: 'object',
          properties: {
            error:   { type: 'string' },
            details: { type: 'array', items: { type: 'object', properties: {
              field:   { type: 'string' },
              message: { type: 'string' },
            }}},
          },
        },
        PaginatedMeta: {
          type: 'object',
          properties: {
            page:  { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
        // ── User ──
        User: {
          type: 'object',
          properties: {
            id:              { type: 'string', format: 'uuid' },
            role:            { type: 'string', enum: ['customer','chef','courier','super_admin','operations','finance','customer_service','marketing','country_manager'] },
            email:           { type: 'string', format: 'email' },
            phone:           { type: 'string' },
            full_name:       { type: 'string' },
            avatar_url:      { type: 'string', format: 'uri' },
            lang_preference: { type: 'string', enum: ['ar','en'] },
            is_verified:     { type: 'boolean' },
            created_at:      { type: 'string', format: 'date-time' },
          },
        },
        // ── Kitchen ──
        Kitchen: {
          type: 'object',
          properties: {
            id:                { type: 'string', format: 'uuid' },
            name_en:           { type: 'string' },
            name_ar:           { type: 'string' },
            bio_en:            { type: 'string' },
            bio_ar:            { type: 'string' },
            logo_url:          { type: 'string' },
            rating:            { type: 'number', minimum: 0, maximum: 5 },
            rating_count:      { type: 'integer' },
            avg_prep_time:     { type: 'integer', description: 'Minutes' },
            delivery_fee:      { type: 'number' },
            min_order_amount:  { type: 'number' },
            is_open:           { type: 'boolean' },
            status:            { type: 'string', enum: ['pending_review','active','paused','suspended','rejected'] },
          },
        },
        // ── Menu Item ──
        MenuItem: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            name_en:        { type: 'string' },
            name_ar:        { type: 'string' },
            description_en: { type: 'string' },
            description_ar: { type: 'string' },
            price:          { type: 'number' },
            image_url:      { type: 'string' },
            prep_time_min:  { type: 'integer' },
            is_available:   { type: 'boolean' },
            is_featured:    { type: 'boolean' },
            rating:         { type: 'number' },
          },
        },
        // ── Order ──
        Order: {
          type: 'object',
          properties: {
            id:               { type: 'string', format: 'uuid' },
            order_number:     { type: 'string', example: 'KH-20490' },
            status:           { type: 'string', enum: ['pending_payment','paid','awaiting_acceptance','accepted','preparing','ready_for_pickup','courier_assigned','picked_up','delivered','cancelled','refunded'] },
            subtotal:         { type: 'number' },
            delivery_fee:     { type: 'number' },
            discount_amount:  { type: 'number' },
            total_amount:     { type: 'number' },
            currency_code:    { type: 'string', example: 'SAR' },
            kitchen_name:     { type: 'string' },
            created_at:       { type: 'string', format: 'date-time' },
          },
        },
        // ── Payment ──
        Payment: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            amount:         { type: 'number' },
            currency_code:  { type: 'string' },
            method:         { type: 'string', enum: ['tap','paymob','apple_pay','mada','visa','mastercard','cash','wallet'] },
            gateway:        { type: 'string' },
            status:         { type: 'string', enum: ['pending','processing','completed','failed','refunded'] },
            payment_url:    { type: 'string', format: 'uri' },
          },
        },
        // ── Coupon ──
        Coupon: {
          type: 'object',
          properties: {
            code:             { type: 'string', example: 'KHALTO20' },
            type:             { type: 'string', enum: ['percentage','fixed_amount','free_delivery'] },
            value:            { type: 'number' },
            min_order_amount: { type: 'number' },
            max_discount:     { type: 'number' },
            valid_until:      { type: 'string', format: 'date-time' },
            is_active:        { type: 'boolean' },
          },
        },
        // ── Settlement ──
        Settlement: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            recipient_type: { type: 'string', enum: ['chef','courier'] },
            period_start:   { type: 'string', format: 'date' },
            period_end:     { type: 'string', format: 'date' },
            gross_amount:   { type: 'number' },
            commission:     { type: 'number' },
            net_amount:     { type: 'number' },
            order_count:    { type: 'integer' },
            status:         { type: 'string', enum: ['pending','under_review','approved','paid','failed','disputed'] },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth',          description: 'Authentication & OTP' },
      { name: 'Users',         description: 'User profile & addresses' },
      { name: 'Kitchens',      description: 'Kitchen management & discovery' },
      { name: 'Menu',          description: 'Menu categories & items' },
      { name: 'Orders',        description: 'Order lifecycle' },
      { name: 'Couriers',      description: 'Courier management & jobs' },
      { name: 'Payments',      description: 'Payment initiation & webhooks' },
      { name: 'Settlements',   description: 'Chef & courier settlements' },
      { name: 'Coupons',       description: 'Coupons, gifts & incentives' },
      { name: 'Notifications', description: 'Push, SMS & email notifications' },
      { name: 'Support',       description: 'Tickets & disputes' },
      { name: 'Countries',     description: 'Countries, cities & zones' },
      { name: 'Admin',         description: 'Admin dashboard & operations' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Khalto API Docs',
    customCss: `
      .topbar { background: #1a1a2e !important; }
      .topbar-wrapper img { content: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text y="24" font-size="22" font-weight="900" fill="white" font-family="sans-serif">Khal<tspan fill="%23E8603C">to</tspan></text></svg>'); }
      .swagger-ui .info .title { color: #1a1a2e; }
      .swagger-ui .btn.authorize { background: #E8603C; border-color: #E8603C; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  }));

  // Raw JSON spec endpoint
  app.get('/api/docs.json', (_, res) => res.json(swaggerSpec));
};

module.exports = { setupSwagger, swaggerSpec };
