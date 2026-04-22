-- ═══════════════════════════════════════════════════════════
-- Migration 009: Dynamic Pricing + Analytics + Food Safety
-- ═══════════════════════════════════════════════════════════

-- ── Dynamic Pricing Config ────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_configs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id             UUID UNIQUE REFERENCES countries(id),
  base_delivery_fee      NUMERIC(8,2) DEFAULT 8.00,
  per_km_rate            NUMERIC(6,2) DEFAULT 1.50,
  min_delivery_fee       NUMERIC(8,2) DEFAULT 5.00,
  max_delivery_fee       NUMERIC(8,2) DEFAULT 30.00,
  surge_enabled          BOOLEAN DEFAULT true,
  surge_max_multiplier   NUMERIC(4,2) DEFAULT 2.0,
  small_order_fee        NUMERIC(6,2) DEFAULT 3.00,
  small_order_threshold  NUMERIC(8,2) DEFAULT 20.00,
  weekend_multiplier     NUMERIC(4,2) DEFAULT 1.1,
  peak_hours             JSONB DEFAULT '[[12,14],[18,21]]',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default pricing
INSERT INTO pricing_configs (id, base_delivery_fee, per_km_rate, min_delivery_fee, max_delivery_fee)
VALUES (uuid_generate_v4(), 8.00, 1.50, 5.00, 30.00) ON CONFLICT DO NOTHING;

-- ── Food Safety: Daily Checklists ─────────────────────────
CREATE TABLE IF NOT EXISTS food_safety_checklists (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id           UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  submitted_by         UUID NOT NULL REFERENCES users(id),
  items                JSONB NOT NULL DEFAULT '{}',
  score                SMALLINT DEFAULT 0,
  all_required_passed  BOOLEAN DEFAULT false,
  fridge_temp          NUMERIC(5,2),
  freezer_temp         NUMERIC(5,2),
  notes                TEXT,
  submitted_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_checklist_kitchen ON food_safety_checklists(kitchen_id, submitted_at DESC);

-- ── Food Safety: Incidents ────────────────────────────────
CREATE TABLE IF NOT EXISTS food_safety_incidents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id   UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  -- checklist_failure | expired_inventory | temperature_violation |
  -- contamination | illness_report | pest_sighting | equipment_failure
  description  TEXT NOT NULL,
  severity     VARCHAR(20) DEFAULT 'low',  -- low | medium | high | critical
  status       VARCHAR(20) DEFAULT 'open', -- open | investigating | resolved | closed
  reported_by  UUID REFERENCES users(id),
  resolved_by  UUID REFERENCES users(id),
  resolved_at  TIMESTAMPTZ,
  resolution   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_incidents_kitchen  ON food_safety_incidents(kitchen_id, status);
CREATE INDEX idx_incidents_severity ON food_safety_incidents(severity, status);

-- ── Food Safety: Inventory ────────────────────────────────
CREATE TABLE IF NOT EXISTS food_inventory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id  UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  item_name   VARCHAR(200) NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL,
  unit        VARCHAR(20) DEFAULT 'kg',
  expiry_date DATE,
  batch_no    VARCHAR(100),
  added_by    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inventory_kitchen ON food_inventory(kitchen_id, expiry_date);
CREATE INDEX idx_inventory_expiry  ON food_inventory(expiry_date) WHERE expiry_date IS NOT NULL;

-- ── Add columns to orders for analytics ──────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES countries(id);

-- ── Scheduled cleanup: remove expired inventory rows ──────
CREATE OR REPLACE FUNCTION cleanup_food_safety() RETURNS void AS $$
BEGIN
  -- Archive expired inventory (older than 7 days past expiry)
  DELETE FROM food_inventory
  WHERE expiry_date < CURRENT_DATE - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
