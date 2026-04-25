-- ═══════════════════════════════════════════════════════
-- Migration 015: Fix orders columns + audit_logs table
-- Adds missing columns required by admin reports endpoints
-- ═══════════════════════════════════════════════════════

-- ── 1. Add missing financial columns to orders ──────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chef_payout         NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_payout      NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount          NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee        NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal            NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency_code       VARCHAR(10) DEFAULT 'SAR';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id           UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_id       UUID;

-- ── 2. Add missing timestamp columns to orders ──────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at         TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepared_at         TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_for       TIMESTAMPTZ;

-- ── 3. Add other useful order columns ──────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number        VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS country_id          UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat        NUMERIC(10,6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng        NUMERIC(10,6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by        UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_rating     SMALLINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chef_rating         SMALLINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_rating      SMALLINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_review     TEXT;

-- ── 4. Add useful indexes ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status_delivered_at
  ON orders (status, delivered_at)
  WHERE status = 'delivered';

CREATE INDEX IF NOT EXISTS idx_orders_country_id
  ON orders (country_id);

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status
  ON orders (kitchen_id, status);

-- ── 5. Create audit_logs table if not exists ────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100),
  entity_type  VARCHAR(50),
  entity_id    UUID,
  old_value    TEXT,
  new_value    TEXT,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id
  ON audit_logs (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- ── 6. Create order_status_log if missing ──────────────
CREATE TABLE IF NOT EXISTS order_status_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  from_status  VARCHAR(30),
  to_status    VARCHAR(30) NOT NULL,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_log_order_id
  ON order_status_log (order_id);
