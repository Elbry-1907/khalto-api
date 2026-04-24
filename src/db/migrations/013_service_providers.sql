-- ═══════════════════════════════════════════════════════════
-- Khalto — Service Providers Migration (SQL version)
-- File: 013_service_providers.sql
-- ═══════════════════════════════════════════════════════════

-- Ensure UUID extension available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── service_providers ────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type        VARCHAR(20)  NOT NULL,
  provider_key        VARCHAR(50)  NOT NULL,
  display_name_ar     VARCHAR(100),
  display_name_en     VARCHAR(100),
  description_ar      VARCHAR(200),
  config_encrypted    TEXT,
  is_configured       BOOLEAN      DEFAULT FALSE,
  is_active           BOOLEAN      DEFAULT FALSE,
  status              VARCHAR(20)  DEFAULT 'not_configured',
  last_tested_at      TIMESTAMPTZ,
  last_test_result    TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (service_type, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_providers_service_active
  ON service_providers (service_type, is_active);


-- ── country_provider_mapping ─────────────────────────────
CREATE TABLE IF NOT EXISTS country_provider_mapping (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id          UUID REFERENCES countries(id) ON DELETE CASCADE,
  service_type        VARCHAR(20) NOT NULL,
  provider_id         UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  cash_on_delivery    BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_country_mapping_country
  ON country_provider_mapping (country_id);


-- ── provider_test_logs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_test_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  test_type           VARCHAR(20),
  recipient           VARCHAR(100),
  success             BOOLEAN,
  response_message    TEXT,
  tested_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_logs_provider_created
  ON provider_test_logs (provider_id, created_at);


-- ── Seed data: all supported providers (metadata only, no credentials) ──

-- SMS Providers
INSERT INTO service_providers (service_type, provider_key, display_name_en, display_name_ar, description_ar) VALUES
  ('sms', 'twilio',   'Twilio',   'Twilio',   'الأشهر عالميًا · يدعم WhatsApp'),
  ('sms', 'unifonic', 'Unifonic', 'Unifonic', 'السعودية والخليج · أسعار محلية'),
  ('sms', 'vonage',   'Vonage',   'Vonage',   'عالمي · بديل Twilio'),
  ('sms', 'msg91',    'MSG91',    'MSG91',    'اقتصادي · مناسب للحجم الكبير')
ON CONFLICT (service_type, provider_key) DO NOTHING;

-- WhatsApp Providers
INSERT INTO service_providers (service_type, provider_key, display_name_en, display_name_ar, description_ar) VALUES
  ('whatsapp', 'twilio',    'Twilio WhatsApp', 'Twilio WhatsApp', 'Sandbox للتطوير · Business للإنتاج'),
  ('whatsapp', 'meta',      'Meta Business',   'Meta Business',   'مباشر من Meta · الأسرع والأرخص'),
  ('whatsapp', '360dialog', '360Dialog',       '360Dialog',       'شريك Meta معتمد')
ON CONFLICT (service_type, provider_key) DO NOTHING;

-- Email Providers
INSERT INTO service_providers (service_type, provider_key, display_name_en, display_name_ar, description_ar) VALUES
  ('email', 'sendgrid', 'SendGrid',     'SendGrid',     'الأشهر · مجاني حتى 100/يوم'),
  ('email', 'mailgun',  'Mailgun',      'Mailgun',      'مرن · API قوي'),
  ('email', 'ses',      'Amazon SES',   'Amazon SES',   'الأرخص · $0.10 / 1000 إيميل'),
  ('email', 'resend',   'Resend',       'Resend',       'الأحدث · مجاني 3000/شهر'),
  ('email', 'smtp',     'SMTP Custom',  'SMTP مخصص',    'Gmail / Outlook / أي SMTP')
ON CONFLICT (service_type, provider_key) DO NOTHING;

-- Payment Gateways
INSERT INTO service_providers (service_type, provider_key, display_name_en, display_name_ar, description_ar) VALUES
  ('payment', 'tap',      'Tap Payments',      'Tap Payments',       'السعودية والخليج · KNET · مدى · Apple Pay'),
  ('payment', 'paymob',   'Paymob',            'Paymob',             'مصر · Fawry · Wallet · Visa'),
  ('payment', 'moyasar',  'Moyasar',           'Moyasar',            'سعودي محلي · مدى · STC Pay'),
  ('payment', 'hyperpay', 'HyperPay',          'HyperPay',           'خليج ومصر · Mada · Fawry'),
  ('payment', 'stripe',   'Stripe',            'Stripe',             'عالمي · للتوسع الدولي'),
  ('payment', 'cash',     'Cash on Delivery',  'كاش عند التسليم',    'بدون إعداد · تفعيل مباشر')
ON CONFLICT (service_type, provider_key) DO NOTHING;
