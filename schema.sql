-- ═══════════════════════════════════════════════════════════
-- KHALTO PLATFORM — Complete Database Schema v2.0
-- PostgreSQL 15 + PostGIS
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- fuzzy search

-- ═══ 1. GEOGRAPHY ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS countries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar       VARCHAR(100) NOT NULL,
  name_en       VARCHAR(100) NOT NULL,
  code          VARCHAR(3) UNIQUE NOT NULL,  -- SA, EG
  currency_code VARCHAR(3) NOT NULL DEFAULT 'SAR',
  default_lang  VARCHAR(5) DEFAULT 'ar',
  tax_pct       NUMERIC(5,2) DEFAULT 15,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cities (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id UUID NOT NULL REFERENCES countries(id),
  name_ar    VARCHAR(100) NOT NULL,
  name_en    VARCHAR(100) NOT NULL,
  is_active  BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS service_zones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_id    UUID NOT NULL REFERENCES cities(id),
  name_ar    VARCHAR(100),
  name_en    VARCHAR(100),
  boundary   geometry(Polygon, 4326),
  is_active  BOOLEAN DEFAULT true
);

-- ═══ 2. USERS ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role            VARCHAR(30) NOT NULL DEFAULT 'customer',
  -- customer | chef | courier | super_admin | operations | finance | customer_service | marketing | country_manager
  full_name       VARCHAR(200),
  phone           VARCHAR(20) UNIQUE,
  email           VARCHAR(200) UNIQUE,
  password_hash   TEXT,
  avatar_url      TEXT,
  lang_preference VARCHAR(5) DEFAULT 'ar',
  country_id      UUID REFERENCES countries(id),
  is_verified     BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_phone  ON users(phone);
CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_role   ON users(role);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      VARCHAR(20) NOT NULL,
  code       VARCHAR(6) NOT NULL,
  purpose    VARCHAR(20) DEFAULT 'login',
  used       BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_otp ON otp_codes(phone, purpose, used, expires_at);

CREATE TABLE IF NOT EXISTS user_social_accounts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     VARCHAR(20) NOT NULL,
  provider_id  VARCHAR(200) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS user_biometric_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(200) NOT NULL,
  public_key  TEXT NOT NULL,
  platform    VARCHAR(10) DEFAULT 'ios',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  platform   VARCHAR(10) DEFAULT 'android',
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fcm_user ON user_fcm_tokens(user_id, is_active);

CREATE TABLE IF NOT EXISTS wallets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id),
  balance       NUMERIC(12,2) DEFAULT 0,
  currency_code VARCHAR(3) DEFAULT 'SAR',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        VARCHAR(50),
  address_line TEXT NOT NULL,
  city_id      UUID REFERENCES cities(id),
  zone_id      UUID REFERENCES service_zones(id),
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  is_default   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 3. KITCHENS ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kitchens (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id),
  city_id             UUID REFERENCES cities(id),
  name_ar             VARCHAR(200) NOT NULL,
  name_en             VARCHAR(200) NOT NULL,
  bio_ar              TEXT,
  bio_en              TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  lat                 NUMERIC(10,7),
  lng                 NUMERIC(10,7),
  status              VARCHAR(30) DEFAULT 'pending_review',
  -- pending_review | active | paused | suspended | rejected
  is_open             BOOLEAN DEFAULT false,
  avg_prep_time       INTEGER DEFAULT 30,
  min_order_amount    NUMERIC(10,2) DEFAULT 0,
  delivery_radius_km  NUMERIC(6,2) DEFAULT 8,
  rating              NUMERIC(3,2) DEFAULT 0,
  rating_count        INTEGER DEFAULT 0,
  commission_pct      NUMERIC(5,2) DEFAULT 15,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kitchen_user   ON kitchens(user_id);
CREATE INDEX idx_kitchen_city   ON kitchens(city_id, status);
CREATE INDEX idx_kitchen_search ON kitchens USING gin(name_ar gin_trgm_ops, name_en gin_trgm_ops);

CREATE TABLE IF NOT EXISTS kitchen_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id  UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  doc_type    VARCHAR(50) NOT NULL,
  file_url    TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  expires_at  TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_schedules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id  UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,  -- 0=Sun...6=Sat
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN DEFAULT false
);

-- ═══ 4. MENU ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS menu_categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  name_ar    VARCHAR(200) NOT NULL,
  name_en    VARCHAR(200) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id      UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES menu_categories(id),
  name_ar         VARCHAR(200) NOT NULL,
  name_en         VARCHAR(200) NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  image_url       TEXT,
  price           NUMERIC(10,2) NOT NULL,
  prep_time_min   INTEGER DEFAULT 20,
  is_available    BOOLEAN DEFAULT true,
  is_featured     BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  rating          NUMERIC(3,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_menu_kitchen ON menu_items(kitchen_id, is_available);

CREATE TABLE IF NOT EXISTS menu_options (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name_ar     VARCHAR(200) NOT NULL,
  name_en     VARCHAR(200) NOT NULL,
  extra_price NUMERIC(10,2) DEFAULT 0,
  is_required BOOLEAN DEFAULT false
);

-- ═══ 5. COURIERS ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS couriers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id),
  city_id       UUID REFERENCES cities(id),
  vehicle_type  VARCHAR(20) DEFAULT 'motorcycle',
  vehicle_plate VARCHAR(20),
  status        VARCHAR(20) DEFAULT 'pending_review',
  availability  VARCHAR(20) DEFAULT 'offline',
  -- online | offline | delivering
  current_lat   NUMERIC(10,7),
  current_lng   NUMERIC(10,7),
  last_seen_at  TIMESTAMPTZ,
  rating        NUMERIC(3,2) DEFAULT 0,
  rating_count  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id  UUID NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  doc_type    VARCHAR(50) NOT NULL,
  file_url    TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  expires_at  TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 6. ORDERS ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number        VARCHAR(20) UNIQUE NOT NULL,
  customer_id         UUID NOT NULL REFERENCES users(id),
  kitchen_id          UUID NOT NULL REFERENCES kitchens(id),
  courier_id          UUID REFERENCES couriers(id),
  country_id          UUID REFERENCES countries(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  subtotal            NUMERIC(12,2) NOT NULL,
  delivery_fee        NUMERIC(10,2) DEFAULT 0,
  discount_amount     NUMERIC(10,2) DEFAULT 0,
  payment_fee         NUMERIC(10,2) DEFAULT 0,
  commission_pct      NUMERIC(5,2),
  commission_amount   NUMERIC(10,2),
  chef_net_amount     NUMERIC(10,2),
  courier_net_amount  NUMERIC(10,2),
  total_amount        NUMERIC(12,2) NOT NULL,
  currency_code       VARCHAR(3) DEFAULT 'SAR',
  delivery_address    TEXT NOT NULL,
  delivery_lat        NUMERIC(10,7),
  delivery_lng        NUMERIC(10,7),
  distance_km         NUMERIC(8,2),
  payment_method      VARCHAR(20),
  coupon_id           UUID,
  notes               TEXT,
  scheduled_for       TIMESTAMPTZ,
  settlement_id       UUID,
  estimated_delivery  TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancel_reason       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_customer  ON orders(customer_id, status);
CREATE INDEX idx_orders_kitchen   ON orders(kitchen_id, status);
CREATE INDEX idx_orders_courier   ON orders(courier_id, status);
CREATE INDEX idx_orders_created   ON orders(created_at DESC);
CREATE INDEX idx_orders_number    ON orders(order_number);

CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  name_ar      VARCHAR(200),
  name_en      VARCHAR(200),
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(12,2) NOT NULL,
  options      JSONB DEFAULT '[]',
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS order_status_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_ratings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       UUID UNIQUE NOT NULL REFERENCES orders(id),
  customer_id    UUID NOT NULL REFERENCES users(id),
  kitchen_rating SMALLINT CHECK(kitchen_rating BETWEEN 1 AND 5),
  courier_rating SMALLINT CHECK(courier_rating BETWEEN 1 AND 5),
  comment        TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 7. PAYMENTS ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency_code   VARCHAR(3) DEFAULT 'SAR',
  method          VARCHAR(30) NOT NULL,
  gateway         VARCHAR(20),
  gateway_tx_id   VARCHAR(200),
  status          VARCHAR(20) DEFAULT 'pending',
  -- pending | processing | completed | failed | refunded
  payment_url     TEXT,
  paid_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS refunds (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id    UUID NOT NULL REFERENCES payments(id),
  order_id      UUID NOT NULL REFERENCES orders(id),
  amount        NUMERIC(12,2) NOT NULL,
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending',
  gateway_ref   VARCHAR(200),
  initiated_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id   UUID NOT NULL REFERENCES wallets(id),
  type        VARCHAR(20) NOT NULL,  -- credit | debit
  amount      NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  description TEXT,
  ref_id      UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 8. SETTLEMENTS ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_type VARCHAR(10) NOT NULL,  -- chef | courier
  recipient_id   UUID NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  order_count    INTEGER DEFAULT 0,
  gross_amount   NUMERIC(12,2) DEFAULT 0,
  commission     NUMERIC(12,2) DEFAULT 0,
  net_amount     NUMERIC(12,2) DEFAULT 0,
  currency_code  VARCHAR(3) DEFAULT 'SAR',
  status         VARCHAR(20) DEFAULT 'pending',
  -- pending | under_review | approved | paid | failed | disputed
  paid_at        TIMESTAMPTZ,
  bank_ref       VARCHAR(200),
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 9. COUPONS ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coupons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code              VARCHAR(50) UNIQUE NOT NULL,
  type              VARCHAR(20) NOT NULL,  -- percentage | fixed_amount | free_delivery
  value             NUMERIC(10,2) NOT NULL,
  min_order_amount  NUMERIC(10,2) DEFAULT 0,
  max_discount      NUMERIC(10,2),
  country_id        UUID REFERENCES countries(id),
  kitchen_id        UUID REFERENCES kitchens(id),
  usage_limit       INTEGER,
  usage_count       INTEGER DEFAULT 0,
  per_user_limit    INTEGER DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL,
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT true,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_coupon_code ON coupons(code, is_active);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id   UUID REFERENCES coupons(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID REFERENCES orders(id),
  amount_saved NUMERIC(10,2) DEFAULT 0,
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         VARCHAR(50) UNIQUE NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  balance      NUMERIC(10,2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'SAR',
  issued_to    UUID REFERENCES users(id),
  is_active    BOOLEAN DEFAULT true,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 10. NOTIFICATIONS ════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key    VARCHAR(100) UNIQUE NOT NULL,
  name_ar      VARCHAR(200),
  name_en      VARCHAR(200),
  audience     VARCHAR(30) NOT NULL,
  title_ar     TEXT,
  title_en     TEXT,
  body_ar      TEXT,
  body_en      TEXT,
  channels     JSONB DEFAULT '["push","in_app"]',
  trigger_type VARCHAR(20) DEFAULT 'event',
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT,
  channel      VARCHAR(20) DEFAULT 'in_app',
  is_read      BOOLEAN DEFAULT false,
  read_at      TIMESTAMPTZ,
  data         JSONB DEFAULT '{}',
  batch_id     UUID,
  template_key VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_batches (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key VARCHAR(100),
  total        INTEGER DEFAULT 0,
  sent         INTEGER DEFAULT 0,
  failed       INTEGER DEFAULT 0,
  channels     JSONB DEFAULT '[]',
  sent_by      UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_scheduled (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_key  VARCHAR(100),
  audience_type VARCHAR(50),
  user_ids      JSONB DEFAULT '[]',
  title_ar TEXT, title_en TEXT, body_ar TEXT, body_en TEXT,
  channels      JSONB DEFAULT '["push"]',
  vars          JSONB DEFAULT '{}',
  data          JSONB DEFAULT '{}',
  schedule_at   TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) DEFAULT 'scheduled',
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sched ON notification_scheduled(status, schedule_at);

-- ═══ 11. SUPPORT ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id),
  order_id    UUID REFERENCES orders(id),
  issue_type  VARCHAR(30) NOT NULL,
  subject     VARCHAR(300) NOT NULL,
  description TEXT,
  status      VARCHAR(20) DEFAULT 'open',
  priority    VARCHAR(10) DEFAULT 'normal',
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tickets_customer ON support_tickets(customer_id, status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compensations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID REFERENCES support_tickets(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID REFERENCES orders(id),
  type        VARCHAR(20) NOT NULL,  -- refund | coupon | credit
  amount      NUMERIC(10,2),
  coupon_id   UUID REFERENCES coupons(id),
  approved_by UUID REFERENCES users(id),
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 12. ADMIN ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  module     VARCHAR(50),
  entity_id  VARCHAR(200),
  old_data   JSONB,
  new_data   JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_module ON audit_logs(module, created_at DESC);

CREATE TABLE IF NOT EXISTS banners (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_ar   VARCHAR(200),
  title_en   VARCHAR(200),
  image_url  TEXT NOT NULL,
  link_url   TEXT,
  position   VARCHAR(30) DEFAULT 'home_top',
  country_id UUID REFERENCES countries(id),
  is_active  BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 13. ADS & COMMISSION ═════════════════════════════════

CREATE TABLE IF NOT EXISTS ads_platform_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform            VARCHAR(20) UNIQUE NOT NULL,
  pixel_id            VARCHAR(200),
  app_id              VARCHAR(200),
  conversion_id       VARCHAR(200),
  ga4_measurement_id  VARCHAR(50),
  access_token        TEXT,
  api_key             TEXT,
  api_secret          TEXT,
  bearer_token        TEXT,
  ga4_api_secret      TEXT,
  test_event_code     VARCHAR(100),
  is_active           BOOLEAN DEFAULT false,
  capi_enabled        BOOLEAN DEFAULT false,
  advanced_matching   BOOLEAN DEFAULT false,
  enabled_events      JSONB DEFAULT '[]',
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL,
  event_name  VARCHAR(100) NOT NULL,
  user_id     UUID REFERENCES users(id),
  order_id    UUID,
  value       NUMERIC(12,2) DEFAULT 0,
  currency    VARCHAR(3) DEFAULT 'SAR',
  platforms   JSONB DEFAULT '[]',
  results     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ads_events ON ads_events(event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS ads_campaigns (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(300) NOT NULL,
  platform            VARCHAR(20) NOT NULL,
  objective           VARCHAR(50) DEFAULT 'conversions',
  status              VARCHAR(20) DEFAULT 'active',
  daily_budget        NUMERIC(10,2) DEFAULT 0,
  country_id          UUID REFERENCES countries(id),
  start_date          TIMESTAMPTZ,
  end_date            TIMESTAMPTZ,
  utm_params          TEXT,
  spend               NUMERIC(12,2) DEFAULT 0,
  impressions         BIGINT DEFAULT 0,
  clicks              BIGINT DEFAULT 0,
  conversions         BIGINT DEFAULT 0,
  roas                NUMERIC(6,2),
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_audiences (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 VARCHAR(200) NOT NULL,
  platform             VARCHAR(20) NOT NULL,
  audience_type        VARCHAR(30) DEFAULT 'custom',
  criteria             JSONB,
  size                 INTEGER DEFAULT 0,
  last_synced          TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_configs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id            UUID UNIQUE REFERENCES countries(id),
  chef_commission_pct   NUMERIC(5,2) DEFAULT 15,
  payment_fee_pct       NUMERIC(5,2) DEFAULT 2.5,
  vat_on_commission_pct NUMERIC(5,2) DEFAULT 15,
  courier_share_pct     NUMERIC(5,2) DEFAULT 80,
  distance_bonus_per_km NUMERIC(8,2) DEFAULT 0.50,
  peak_multiplier       NUMERIC(4,2) DEFAULT 1.5,
  peak_hours            JSONB DEFAULT '[[12,14],[18,21]]',
  min_courier_payout    NUMERIC(8,2) DEFAULT 5.0,
  weekly_incentive_trips INTEGER DEFAULT 50,
  weekly_incentive_bonus NUMERIC(8,2) DEFAULT 30.0,
  updated_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  rule_type   VARCHAR(50) NOT NULL,
  value       NUMERIC(10,2) NOT NULL,
  unit        VARCHAR(20) DEFAULT 'percentage',
  condition   TEXT,
  country_id  UUID REFERENCES countries(id),
  priority    INTEGER DEFAULT 10,
  is_active   BOOLEAN DEFAULT true,
  valid_until TIMESTAMPTZ,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SEEDS ════════════════════════════════════════════════

-- Countries
INSERT INTO countries (id, name_ar, name_en, code, currency_code, tax_pct) VALUES
  (uuid_generate_v4(), 'المملكة العربية السعودية', 'Saudi Arabia', 'SA', 'SAR', 15),
  (uuid_generate_v4(), 'مصر',                       'Egypt',         'EG', 'EGP', 14)
ON CONFLICT (code) DO NOTHING;

-- Default commission config
INSERT INTO commission_configs (id, chef_commission_pct, payment_fee_pct, vat_on_commission_pct, courier_share_pct)
VALUES (uuid_generate_v4(), 15, 2.5, 15, 80) ON CONFLICT DO NOTHING;

-- Welcome coupon
INSERT INTO coupons (id, code, type, value, min_order_amount, max_discount, per_user_limit, valid_from, is_active)
VALUES (uuid_generate_v4(), 'KHALTO20', 'percentage', 20, 0, 50, 1, NOW(), true)
ON CONFLICT (code) DO NOTHING;

-- Platform configs for ads
INSERT INTO ads_platform_configs (id, platform) VALUES
  (uuid_generate_v4(), 'facebook'),
  (uuid_generate_v4(), 'snapchat'),
  (uuid_generate_v4(), 'tiktok'),
  (uuid_generate_v4(), 'twitter'),
  (uuid_generate_v4(), 'google')
ON CONFLICT (platform) DO NOTHING;
