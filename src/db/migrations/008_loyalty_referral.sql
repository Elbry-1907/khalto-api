-- ═══════════════════════════════════════════════════════════
-- Migration 008: Loyalty + Referral + Scheduled Orders
-- ═══════════════════════════════════════════════════════════

-- ── Loyalty Accounts ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  tier         VARCHAR(20) NOT NULL DEFAULT 'bronze',
  -- bronze | silver | gold | vip
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_loyalty_points ON loyalty_accounts(points DESC);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id),
  type        VARCHAR(10) NOT NULL,  -- earn | redeem | bonus | expire
  points      INTEGER NOT NULL,      -- positive = earn, negative = redeem
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_loyalty_tx ON loyalty_transactions(user_id, created_at DESC);

-- ── Referrals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id      UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code             VARCHAR(20) UNIQUE NOT NULL,
  total_referrals  INTEGER DEFAULT 0,
  total_earned     NUMERIC(10,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ref_code ON referrals(code);

CREATE TABLE IF NOT EXISTS referral_uses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  referee_id  UUID UNIQUE NOT NULL REFERENCES users(id),
  code        VARCHAR(20) NOT NULL,
  bonus_earned NUMERIC(10,2) DEFAULT 15,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Add scheduled status to orders ───────────────────────
-- orders table already has scheduled_for column from schema.sql
-- Add scheduled status to existing status values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- ── Wallet transactions — ensure ref_id column ───────────
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS ref_id UUID;

-- ── Loyalty auto-create on user registration ─────────────
CREATE OR REPLACE FUNCTION create_loyalty_on_register()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'customer' THEN
    INSERT INTO loyalty_accounts (id, user_id, points, total_earned, tier)
    VALUES (uuid_generate_v4(), NEW.id, 0, 0, 'bronze')
    ON CONFLICT (user_id) DO NOTHING;

    -- Generate referral code
    INSERT INTO referrals (id, referrer_id, code)
    VALUES (
      uuid_generate_v4(), NEW.id,
      UPPER(SUBSTRING(COALESCE(NEW.full_name, 'USER'), 1, 4)) ||
      LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0')
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loyalty_on_register ON users;
CREATE TRIGGER trg_loyalty_on_register
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_loyalty_on_register();

-- ── Tier config (reference) ───────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  name            VARCHAR(20) PRIMARY KEY,
  name_ar         VARCHAR(50),
  min_points      INTEGER NOT NULL,
  points_per_sar  NUMERIC(4,2) DEFAULT 1,
  discount_pct    SMALLINT DEFAULT 0,
  free_delivery   BOOLEAN DEFAULT false,
  perks           JSONB DEFAULT '[]'
);

INSERT INTO loyalty_tiers VALUES
('bronze', 'برونزي 🥉', 0,    1.0, 0,  false, '["نقطة لكل ريال"]'),
('silver', 'فضي 🥈',    500,  1.5, 5,  false, '["1.5 نقطة/ريال","خصم 5%"]'),
('gold',   'ذهبي 🥇',   1500, 2.0, 8,  false, '["2 نقطة/ريال","خصم 8%","أولوية الدعم"]'),
('vip',    'VIP 💎',    5000, 3.0, 12, true,  '["3 نقاط/ريال","خصم 12%","توصيل مجاني","دعم VIP"]')
ON CONFLICT (name) DO NOTHING;
