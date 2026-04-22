-- ═══════════════════════════════════════════════════════════
-- Migration 003: Auth Tables
-- تسجيل الدخول — OTP + Social + Biometric + Refresh
-- ═══════════════════════════════════════════════════════════

-- ── OTP Codes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      VARCHAR(20) NOT NULL,
  code       VARCHAR(6)  NOT NULL,
  purpose    VARCHAR(20) NOT NULL DEFAULT 'login',
  used       BOOLEAN     NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose
  ON otp_codes (phone, purpose, used, expires_at);

-- Auto-delete old OTPs after 24 hours
-- (run via cron: DELETE FROM otp_codes WHERE created_at < NOW() - INTERVAL '24 hours')

-- ── Social Accounts ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_social_accounts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     VARCHAR(20) NOT NULL,  -- google | apple | facebook
  provider_id  VARCHAR(200) NOT NULL,
  access_token TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_social_user ON user_social_accounts(user_id);

-- ── Biometric Keys (Touch ID / Face ID) ───────────────────
CREATE TABLE IF NOT EXISTS user_biometric_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(200) NOT NULL,
  public_key  TEXT        NOT NULL,
  platform    VARCHAR(10) NOT NULL DEFAULT 'ios',  -- ios | android
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_bio_user ON user_biometric_keys(user_id, is_active);

-- ── Refresh Tokens (optional — for token revocation) ──────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  device_id  VARCHAR(200),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id, revoked);

-- ── Account status enum update ────────────────────────────
-- Chefs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'chef_status'
  ) THEN
    CREATE TYPE chef_status AS ENUM (
      'pending_review', 'active', 'paused', 'suspended', 'rejected'
    );
  END IF;
END $$;

-- Couriers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'courier_status'
  ) THEN
    CREATE TYPE courier_status AS ENUM (
      'pending_review', 'active', 'suspended', 'rejected'
    );
  END IF;
END $$;

-- ── Add missing columns if not exist ─────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES countries(id);

ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending_review';
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending_review';

-- ── Seed: KHALTO20 welcome coupon ─────────────────────────
INSERT INTO coupons (id, code, type, value, min_order_amount, max_discount, per_user_limit, valid_from, is_active)
VALUES (
  uuid_generate_v4(),
  'KHALTO20',
  'percentage',
  20,
  0,
  50,
  1,
  NOW(),
  true
) ON CONFLICT (code) DO NOTHING;
