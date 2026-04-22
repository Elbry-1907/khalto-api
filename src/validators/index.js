const Joi = require('joi');

// ── Middleware factory ────────────────────────────────────
const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false, stripUnknown: true, convert: true,
  });
  if (error) {
    return res.status(422).json({
      error: 'Validation failed',
      details: error.details.map(d => ({ field: d.path.join('.'), message: d.message.replace(/['"]/g,'') })),
    });
  }
  req[target] = value;
  next();
};
const validateQuery  = s => validate(s, 'query');
const validateParams = s => validate(s, 'params');

// ── Reusable field types ──────────────────────────────────
const phone  = Joi.string().pattern(/^\+?[0-9]{8,15}$/);
const id     = Joi.string().uuid({ version: 'uuidv4' });
const lang   = Joi.string().valid('ar','en').default('ar');
const page   = Joi.number().integer().min(1).default(1);
const limit  = Joi.number().integer().min(1).max(100).default(20);

// ══════════════════════════════════════════════════════════
const auth = {
  register: Joi.object({
    full_name: Joi.string().min(2).max(100).required(),
    phone:     phone.optional(),
    email:     Joi.string().email().optional(),
    password:  Joi.string().min(8).max(128).optional(),
    role:      Joi.string().valid('customer','chef','courier').default('customer'),
    lang_preference: lang,
    country_id: id.optional(),
  }).or('phone','email'),

  login: Joi.object({
    phone:    phone.optional(),
    email:    Joi.string().email().optional(),
    password: Joi.string().required(),
  }).or('phone','email'),

  sendOtp: Joi.object({
    phone:   phone.required(),
    purpose: Joi.string().valid('login','reset','verify').default('login'),
  }),

  verifyOtp: Joi.object({
    phone:   phone.required(),
    code:    Joi.string().length(6).pattern(/^\d+$/).required(),
    purpose: Joi.string().valid('login','reset','verify').default('login'),
  }),
};

const order = {
  create: Joi.object({
    kitchen_id:       id.required(),
    items: Joi.array().items(Joi.object({
      menu_item_id: id.required(),
      quantity:     Joi.number().integer().min(1).max(20).required(),
      options:      Joi.array().items(Joi.object({ option_id: id.required() })).optional(),
      notes:        Joi.string().max(500).optional(),
    })).min(1).required(),
    delivery_address: Joi.string().min(5).max(500).required(),
    delivery_lat:     Joi.number().optional(),
    delivery_lng:     Joi.number().optional(),
    payment_method:   Joi.string().valid('tap','paymob','apple_pay','mada','visa','mastercard','cash','wallet').required(),
    coupon_code:      Joi.string().uppercase().max(50).optional(),
    notes:            Joi.string().max(500).optional(),
    scheduled_for:    Joi.date().iso().optional(),
  }),
  updateStatus: Joi.object({
    status: Joi.string().valid(
      'paid','awaiting_acceptance','accepted','preparing','ready_for_pickup',
      'courier_assigned','picked_up','delivered','cancelled','refunded'
    ).required(),
    note: Joi.string().max(500).optional(),
  }),
  list: Joi.object({ status: Joi.string().optional(), page, limit }),
  rate: Joi.object({
    kitchen_rating: Joi.number().integer().min(1).max(5).optional(),
    courier_rating: Joi.number().integer().min(1).max(5).optional(),
    comment:        Joi.string().max(1000).optional(),
  }).or('kitchen_rating','courier_rating'),
};

const kitchen = {
  create: Joi.object({
    name_en: Joi.string().min(2).max(200).required(),
    name_ar: Joi.string().min(2).max(200).required(),
    bio_en:  Joi.string().max(2000).optional(),
    bio_ar:  Joi.string().max(2000).optional(),
    city_id: id.required(),
    lat: Joi.number().optional(), lng: Joi.number().optional(),
    min_order_amount: Joi.number().min(0).default(0),
    avg_prep_time:    Joi.number().integer().min(5).max(180).default(30),
  }),
  update: Joi.object({
    name_en: Joi.string().optional(), name_ar: Joi.string().optional(),
    bio_en:  Joi.string().optional(), bio_ar:  Joi.string().optional(),
    is_open: Joi.boolean().optional(),
    avg_prep_time: Joi.number().integer().optional(),
    min_order_amount: Joi.number().min(0).optional(),
  }),
  list: Joi.object({ city_id: id.optional(), search: Joi.string().max(100).optional(), lat: Joi.number().optional(), lng: Joi.number().optional(), page, limit }),
};

const menu = {
  createItem: Joi.object({
    kitchen_id:     id.required(),
    category_id:    id.optional(),
    name_en:        Joi.string().min(2).max(200).required(),
    name_ar:        Joi.string().min(2).max(200).required(),
    description_en: Joi.string().max(2000).optional(),
    description_ar: Joi.string().max(2000).optional(),
    price:          Joi.number().min(0.5).max(10000).required(),
    prep_time_min:  Joi.number().integer().min(1).max(300).default(20),
  }),
  updateItem: Joi.object({
    name_en: Joi.string().optional(), name_ar: Joi.string().optional(),
    price: Joi.number().optional(), prep_time_min: Joi.number().integer().optional(),
    is_available: Joi.boolean().optional(), is_featured: Joi.boolean().optional(),
    category_id: id.optional(),
  }),
};

const payment = {
  initiate: Joi.object({
    order_id:       id.required(),
    payment_method: Joi.string().valid('tap','paymob','apple_pay','mada','visa','mastercard','wallet').required(),
    return_url:     Joi.string().uri().optional(),
  }),
  refund: Joi.object({
    amount: Joi.number().min(0.01).optional(),
    reason: Joi.string().max(500).optional(),
  }),
};

const coupon = {
  create: Joi.object({
    code:             Joi.string().uppercase().alphanum().min(4).max(50).required(),
    type:             Joi.string().valid('percentage','fixed_amount','free_delivery').required(),
    value:            Joi.number().min(0).required(),
    min_order_amount: Joi.number().min(0).default(0),
    max_discount:     Joi.number().optional(),
    country_id:       id.optional(), kitchen_id: id.optional(),
    usage_limit:      Joi.number().integer().optional(),
    per_user_limit:   Joi.number().integer().default(1),
    valid_from:       Joi.date().iso().required(),
    valid_until:      Joi.date().iso().optional(),
  }),
  validate: Joi.object({
    code:        Joi.string().uppercase().required(),
    order_total: Joi.number().min(0).required(),
    kitchen_id:  id.optional(),
  }),
};

const courier = {
  register: Joi.object({
    city_id:       id.required(),
    vehicle_type:  Joi.string().valid('motorcycle','car','bicycle','walking').required(),
    vehicle_plate: Joi.string().max(20).optional(),
  }),
  updateLocation: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    order_id: id.optional(),
  }),
  availability: Joi.object({
    availability: Joi.string().valid('online','offline','delivering').required(),
  }),
};

const support = {
  createTicket: Joi.object({
    order_id:    id.optional(),
    issue_type:  Joi.string().valid('delay','wrong_item','missing_item','quality','courier_issue','payment','other').required(),
    subject:     Joi.string().min(5).max(300).required(),
    description: Joi.string().max(5000).optional(),
  }),
};

const notification = {
  send: Joi.object({
    template_key: Joi.string().max(100).optional(),
    user_ids:     Joi.array().items(id).min(1).max(1000).required(),
    title_ar:     Joi.string().max(200).optional(),
    body_ar:      Joi.string().max(2000).optional(),
    channels:     Joi.array().items(Joi.string().valid('push','in_app','sms','email')).default(['push']),
    vars:         Joi.object().optional(),
    data:         Joi.object().optional(),
  }),
};

module.exports = {
  validate, validateQuery, validateParams,
  auth, order, kitchen, menu, payment, coupon, courier, support, notification,
};
