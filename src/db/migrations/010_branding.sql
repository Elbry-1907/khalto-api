-- ═══════════════════════════════════════════════════════════
-- Migration 010: Platform Branding
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_branding (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id          UUID REFERENCES countries(id),  -- NULL = global default

  -- Names
  platform_name       VARCHAR(100) DEFAULT 'Khalto',
  platform_name_ar    VARCHAR(100) DEFAULT 'خالتو',
  platform_tagline    VARCHAR(300) DEFAULT 'Home-Cooked Food Delivery',
  platform_tagline_ar VARCHAR(300) DEFAULT 'توصيل الأكل البيتي',

  -- Logos
  logo_url            TEXT,                  -- primary logo (light bg)
  logo_dark_url       TEXT,                  -- logo on dark backgrounds
  favicon_url         TEXT,

  -- Brand Colors
  primary_color       VARCHAR(7) DEFAULT '#E8603C',
  secondary_color     VARCHAR(7) DEFAULT '#1a1a2e',
  accent_color        VARCHAR(7) DEFAULT '#F5A623',

  -- Links
  app_store_url       TEXT,
  play_store_url      TEXT,
  website_url         TEXT,

  -- Support
  support_email       VARCHAR(200) DEFAULT 'support@khalto.app',
  support_phone       VARCHAR(20),

  -- Meta
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(country_id)
);

-- Branding change history
CREATE TABLE IF NOT EXISTS branding_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default branding
INSERT INTO platform_branding (
  id, platform_name, platform_name_ar,
  platform_tagline, platform_tagline_ar,
  primary_color, secondary_color, accent_color,
  support_email
) VALUES (
  uuid_generate_v4(), 'Khalto', 'خالتو',
  'Home-Cooked Food Delivery', 'توصيل الأكل البيتي',
  '#E8603C', '#1a1a2e', '#F5A623',
  'support@khalto.app'
) ON CONFLICT DO NOTHING;
