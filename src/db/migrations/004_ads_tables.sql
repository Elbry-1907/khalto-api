-- ═══════════════════════════════════════════════════════════
-- Migration 004: Ads & Social Media Pixel Tables
-- ═══════════════════════════════════════════════════════════

-- ── Platform Configurations ───────────────────────────────
CREATE TABLE IF NOT EXISTS ads_platform_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform            VARCHAR(20) NOT NULL UNIQUE,  -- facebook|snapchat|tiktok|twitter|google
  pixel_id            VARCHAR(200),
  app_id              VARCHAR(200),
  conversion_id       VARCHAR(200),   -- Google AW-XXXXXXXXX
  ga4_measurement_id  VARCHAR(50),    -- G-XXXXXXXXXX
  access_token        TEXT,           -- encrypted in prod
  api_key             TEXT,
  api_secret          TEXT,
  bearer_token        TEXT,
  ga4_api_secret      TEXT,
  test_event_code     VARCHAR(100),
  is_active           BOOLEAN NOT NULL DEFAULT false,
  capi_enabled        BOOLEAN NOT NULL DEFAULT false,
  advanced_matching   BOOLEAN NOT NULL DEFAULT false,
  server_side_tagging BOOLEAN NOT NULL DEFAULT false,
  enabled_events      JSONB   DEFAULT '[]',
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pixel Events Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ads_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL,            -- shared across platforms
  event_name  VARCHAR(100) NOT NULL,
  user_id     UUID REFERENCES users(id),
  order_id    UUID,
  value       NUMERIC(12,2) DEFAULT 0,
  currency    VARCHAR(3)    DEFAULT 'SAR',
  platforms   JSONB         NOT NULL DEFAULT '[]',
  results     JSONB         DEFAULT '{}',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ads_events_name     ON ads_events(event_name);
CREATE INDEX idx_ads_events_user     ON ads_events(user_id);
CREATE INDEX idx_ads_events_created  ON ads_events(created_at DESC);

-- ── Campaigns ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ads_campaigns (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(300) NOT NULL,
  platform            VARCHAR(20)  NOT NULL,
  objective           VARCHAR(50)  DEFAULT 'conversions',
  status              VARCHAR(20)  DEFAULT 'active',
  daily_budget        NUMERIC(10,2) DEFAULT 0,
  total_spend         NUMERIC(12,2) DEFAULT 0,
  country_id          UUID REFERENCES countries(id),
  start_date          TIMESTAMPTZ,
  end_date            TIMESTAMPTZ,
  utm_params          TEXT,
  target_audience_id  UUID,
  creative_url        TEXT,
  -- Performance (synced from platform APIs)
  spend               NUMERIC(12,2) DEFAULT 0,
  impressions         BIGINT        DEFAULT 0,
  clicks              BIGINT        DEFAULT 0,
  conversions         BIGINT        DEFAULT 0,
  roas                NUMERIC(6,2),
  cpc                 NUMERIC(8,2),
  ctr                 NUMERIC(6,4),
  last_synced         TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_platform ON ads_campaigns(platform, status);
CREATE INDEX idx_campaigns_created  ON ads_campaigns(created_at DESC);

-- ── Custom Audiences ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ads_audiences (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 VARCHAR(200) NOT NULL,
  platform             VARCHAR(20)  NOT NULL,
  audience_type        VARCHAR(30)  DEFAULT 'custom',  -- custom|lookalike|retargeting
  criteria             JSONB,
  size                 INTEGER DEFAULT 0,
  platform_audience_id VARCHAR(200),  -- ID from platform after upload
  lookalike_source_id  UUID REFERENCES ads_audiences(id),
  lookalike_country    VARCHAR(5),
  lookalike_ratio      NUMERIC(3,1),  -- 1.0 - 10.0
  last_synced          TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── UTM Tracking Links ────────────────────────────────────
CREATE TABLE IF NOT EXISTS utm_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  destination   TEXT NOT NULL,
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(200),
  utm_content   VARCHAR(200),
  utm_term      VARCHAR(200),
  short_code    VARCHAR(20) UNIQUE,
  clicks        INTEGER DEFAULT 0,
  conversions   INTEGER DEFAULT 0,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed default platform configs ─────────────────────────
INSERT INTO ads_platform_configs (id, platform, is_active, capi_enabled) VALUES
  (uuid_generate_v4(), 'facebook',  false, false),
  (uuid_generate_v4(), 'instagram', false, false),
  (uuid_generate_v4(), 'snapchat',  false, false),
  (uuid_generate_v4(), 'tiktok',    false, false),
  (uuid_generate_v4(), 'twitter',   false, false),
  (uuid_generate_v4(), 'google',    false, false)
ON CONFLICT (platform) DO NOTHING;

-- ── Enabled events per platform (default) ─────────────────
UPDATE ads_platform_configs SET enabled_events = '["Purchase","AddToCart","ViewContent","InitiateCheckout","CompleteRegistration","PageView","Search"]'::jsonb
WHERE platform = 'facebook';

UPDATE ads_platform_configs SET enabled_events = '["Purchase","AddToCart","ViewContent","InitiateCheckout","CompleteRegistration","PageView"]'::jsonb
WHERE platform IN ('snapchat','tiktok');

UPDATE ads_platform_configs SET enabled_events = '["Purchase","AddToCart","ViewContent","CompleteRegistration","PageView"]'::jsonb
WHERE platform = 'twitter';

UPDATE ads_platform_configs SET enabled_events = '["purchase","add_to_cart","view_item","begin_checkout","sign_up","chef_signup"]'::jsonb
WHERE platform = 'google';
