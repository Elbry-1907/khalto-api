-- ═══════════════════════════════════════════════════════
-- Migration 016: Force-fix audit_logs and orders schemas
-- audit_logs already exists with different columns
-- This migration uses ALTER TABLE to ADD missing columns
-- ═══════════════════════════════════════════════════════

-- ── audit_logs: add missing columns ─────────────────────
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id    UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action      VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id   UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_value   TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value   TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address  VARCHAR(45);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent  TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- If user_id exists, migrate data to actor_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='user_id') THEN
    UPDATE audit_logs SET actor_id = user_id WHERE actor_id IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- ── orders: add missing financial columns ────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chef_payout         NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_payout      NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount          NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee        NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal            NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency_code       VARCHAR(10) DEFAULT 'SAR';

-- ── orders: add missing timestamp columns ────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepared_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
