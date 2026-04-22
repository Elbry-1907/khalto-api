-- ═══════════════════════════════════════════════════════════
-- Migration 005: Notifications + Commission Engine Tables
-- ═══════════════════════════════════════════════════════════

-- ── Notifications (in-app) ────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT,
  channel       VARCHAR(20) DEFAULT 'in_app',
  is_read       BOOLEAN NOT NULL DEFAULT false,
  read_at       TIMESTAMPTZ,
  data          JSONB DEFAULT '{}',
  batch_id      UUID,
  template_key  VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user    ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_batch   ON notifications(batch_id);

-- ── Notification Templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key     VARCHAR(100) NOT NULL UNIQUE,
  name_ar       VARCHAR(200),
  name_en       VARCHAR(200),
  audience      VARCHAR(30) NOT NULL,  -- customer|chef|courier|admin|all
  title_ar      TEXT,
  title_en      TEXT,
  body_ar       TEXT,
  body_en       TEXT,
  channels      JSONB DEFAULT '["push","in_app"]',
  trigger_type  VARCHAR(20) DEFAULT 'event',  -- event|scheduled|manual
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notification Batches (send log) ──────────────────────
CREATE TABLE IF NOT EXISTS notification_batches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key  VARCHAR(100),
  total         INTEGER DEFAULT 0,
  sent          INTEGER DEFAULT 0,
  failed        INTEGER DEFAULT 0,
  channels      JSONB DEFAULT '[]',
  sent_by       UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Scheduled Notifications ───────────────────────────────
CREATE TABLE IF NOT EXISTS notification_scheduled (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key  VARCHAR(100),
  audience_type VARCHAR(50),
  user_ids      JSONB DEFAULT '[]',
  title_ar      TEXT,  title_en TEXT,
  body_ar       TEXT,  body_en  TEXT,
  channels      JSONB DEFAULT '["push"]',
  vars          JSONB DEFAULT '{}',
  data          JSONB DEFAULT '{}',
  schedule_at   TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) DEFAULT 'scheduled',  -- scheduled|sent|cancelled
  sent_at       TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sched_status ON notification_scheduled(status, schedule_at);

-- ── Commission Configs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_configs (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id                UUID REFERENCES countries(id),  -- NULL = global default
  chef_commission_pct       NUMERIC(5,2) DEFAULT 15,
  payment_fee_pct           NUMERIC(5,2) DEFAULT 2.5,
  vat_on_commission_pct     NUMERIC(5,2) DEFAULT 15,
  courier_share_pct         NUMERIC(5,2) DEFAULT 80,
  distance_bonus_per_km     NUMERIC(8,2) DEFAULT 0.50,
  peak_multiplier           NUMERIC(4,2) DEFAULT 1.5,
  peak_hours                JSONB DEFAULT '[[12,14],[18,21]]',
  min_courier_payout        NUMERIC(8,2) DEFAULT 5.0,
  weekly_incentive_trips    INTEGER DEFAULT 50,
  weekly_incentive_bonus    NUMERIC(8,2) DEFAULT 30.0,
  updated_by                UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(country_id)
);

-- ── Commission Rules ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_rules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  rule_type     VARCHAR(50)  NOT NULL,
  -- chef_commission | courier_share | courier_distance |
  -- courier_peak    | courier_incentive | courier_minimum
  value         NUMERIC(10,2) NOT NULL,
  unit          VARCHAR(20) DEFAULT 'percentage',  -- percentage|fixed|multiplier
  condition     TEXT,           -- free text condition: "rating >= 4.8"
  country_id    UUID REFERENCES countries(id),
  priority      INTEGER DEFAULT 10,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  valid_from    TIMESTAMPTZ DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rules_type ON commission_rules(rule_type, is_active, priority);

-- ── Add commission columns to orders if missing ───────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_pct       NUMERIC(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount    NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_fee_amount   NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chef_net_amount      NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_net_amount   NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_km          NUMERIC(8,2);

-- ── Seed default notification templates ───────────────────
INSERT INTO notification_templates (id,event_key,name_ar,name_en,audience,title_ar,title_en,body_ar,body_en,channels) VALUES
(uuid_generate_v4(),'otp.send','رمز التحقق','OTP Code','all',
  'رمز التحقق الخاص بك','Your verification code',
  'رمز التحقق الخاص بك: {{otp_code}}. صالح {{expiry_min}} دقائق. لا تشاركه مع أحد.',
  'Your code: {{otp_code}}. Valid for {{expiry_min}} min. Do not share.',
  '["sms","push"]'),

(uuid_generate_v4(),'order.confirmed','تأكيد الطلب','Order Confirmed','customer',
  'تم تأكيد طلبك ✅','Order Confirmed ✅',
  'طلبك #{{order_number}} من {{kitchen_name}} تم تأكيده.',
  'Order #{{order_number}} from {{kitchen_name}} confirmed.',
  '["push","in_app"]'),

(uuid_generate_v4(),'order.preparing','جاري التحضير','Preparing','customer',
  'مطبخك يحضر طلبك 🍳','Your order is being prepared 🍳',
  '{{kitchen_name}} يحضر طلبك الآن. الوقت المتوقع {{eta}} دقيقة.',
  '{{kitchen_name}} is preparing your order. ETA: {{eta}} min.',
  '["push","in_app"]'),

(uuid_generate_v4(),'order.out_for_delivery','المندوب في الطريق','Out for Delivery','customer',
  '{{courier_name}} في الطريق إليك 🛵','{{courier_name}} is on the way 🛵',
  'طلبك في الطريق. الوقت المتوقع {{eta}} دقيقة.',
  'Your order is on the way. ETA: {{eta}} min.',
  '["push","sms","in_app"]'),

(uuid_generate_v4(),'order.delivered','تم التوصيل','Delivered','customer',
  'وصل طلبك! 🎉','Order Delivered! 🎉',
  'بالعافية! طلب #{{order_number}} تم توصيله. قيّم تجربتك.',
  'Enjoy! Order #{{order_number}} delivered. Rate your experience.',
  '["push","in_app"]'),

(uuid_generate_v4(),'order.cancelled','إلغاء الطلب','Order Cancelled','customer',
  'تم إلغاء طلبك ❌','Order Cancelled ❌',
  'طلب #{{order_number}} تم إلغاؤه. {{refund_note}}',
  'Order #{{order_number}} cancelled. {{refund_note}}',
  '["push","sms","in_app"]'),

(uuid_generate_v4(),'chef.new_order','طلب جديد','New Order','chef',
  '🔔 طلب جديد! اقبله خلال دقيقتين','🔔 New Order! Accept within 2 min',
  '{{item_count}} أصناف · {{payout}} SAR · #{{order_number}}',
  '{{item_count}} items · SAR {{payout}} · #{{order_number}}',
  '["push","in_app"]'),

(uuid_generate_v4(),'chef.approved','قبول المطبخ','Kitchen Approved','chef',
  'مطبخك مفعّل! 🎊','Your kitchen is live! 🎊',
  'تم قبول {{kitchen_name}} على خالتو. افتح مطبخك وابدأ.',
  '{{kitchen_name}} approved on Khalto. Open your kitchen and start.',
  '["push","sms","email"]'),

(uuid_generate_v4(),'settlement.paid','تحويل التسوية','Settlement Paid','chef',
  'تم تحويل دفعتك 💰','Your payout transferred 💰',
  'دفعة {{period}}: {{currency}} {{amount}} حُوِّلت لحسابك.',
  'Week {{period}}: {{currency}} {{amount}} transferred.',
  '["push","sms","email"]'),

(uuid_generate_v4(),'courier.new_job','طلب توصيل','New Delivery Job','courier',
  '📦 طلب توصيل قريب منك','📦 Delivery job nearby',
  '{{kitchen_name}} · {{distance}} كم · {{payout}} SAR',
  '{{kitchen_name}} · {{distance}} km · SAR {{payout}}',
  '["push","in_app"]'),

(uuid_generate_v4(),'courier.incentive','مكافأة حوافز','Incentive Unlocked','courier',
  '🏆 حصلت على مكافأة!','🏆 Bonus Unlocked!',
  'أتممت {{trips}} رحلة هذا الأسبوع! +{{bonus}} SAR أضيفت لحسابك.',
  '{{trips}} trips this week! +SAR {{bonus}} added.',
  '["push","in_app"]'),

(uuid_generate_v4(),'courier.approved','قبول المندوب','Courier Approved','courier',
  'تم قبولك رايداً! 🛵','You are approved as a rider! 🛵',
  'أهلاً {{name}}! حسابك مفعّل. ابدأ أول رحلة الآن.',
  'Welcome {{name}}! Your account is active. Start your first trip.',
  '["push","sms","email"]')
ON CONFLICT (event_key) DO NOTHING;

-- ── Seed default commission config ────────────────────────
INSERT INTO commission_configs (id, chef_commission_pct, payment_fee_pct, vat_on_commission_pct,
  courier_share_pct, distance_bonus_per_km, peak_multiplier, min_courier_payout,
  weekly_incentive_trips, weekly_incentive_bonus)
VALUES (uuid_generate_v4(), 15, 2.5, 15, 80, 0.50, 1.5, 5.0, 50, 30.0)
ON CONFLICT DO NOTHING;

-- ── Seed default commission rules ─────────────────────────
INSERT INTO commission_rules (id,name,rule_type,value,unit,condition,priority) VALUES
(uuid_generate_v4(), 'عمولة افتراضية',      'chef_commission', 15,   'percentage', NULL,          1),
(uuid_generate_v4(), 'شيف تقييم 4.8+',      'chef_commission', 12,   'percentage', 'rating >= 4.8', 2),
(uuid_generate_v4(), 'فترة تجريبية 30 يوم', 'chef_commission', 5,    'percentage', 'days_since_join <= 30', 3),
(uuid_generate_v4(), 'حصة المندوب',          'courier_share',   80,   'percentage', NULL,          1),
(uuid_generate_v4(), 'مكافأة المسافة',       'courier_distance',0.50, 'fixed',      'per_km',      1),
(uuid_generate_v4(), 'مضاعف الذروة',         'courier_peak',    1.5,  'multiplier', '12-14 or 18-21', 1),
(uuid_generate_v4(), 'حافز أسبوعي',          'courier_incentive',30,  'fixed',      '50 trips/week', 1),
(uuid_generate_v4(), 'حد أدنى/رحلة',         'courier_minimum', 5,    'fixed',      'minimum guarantee', 1)
ON CONFLICT DO NOTHING;
