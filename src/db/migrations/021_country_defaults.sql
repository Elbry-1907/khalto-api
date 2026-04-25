-- ═══════════════════════════════════════════════════════
-- Migration 021: Multi-Country Foundation
-- ═══════════════════════════════════════════════════════

-- ── 1. countries: add default percentages ──────────────
ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_commission_pct      NUMERIC(5,2) DEFAULT 15;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_courier_percentage  NUMERIC(5,2) DEFAULT 80;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_delivery_fee        NUMERIC(10,2) DEFAULT 10;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_min_order_amount    NUMERIC(10,2) DEFAULT 0;

-- ── 2. seed defaults for existing countries ────────────
-- Saudi Arabia (SAR)
UPDATE countries SET 
  default_commission_pct = 15,
  default_courier_percentage = 80,
  default_delivery_fee = 12,
  default_min_order_amount = 30
WHERE code = 'SA' AND default_commission_pct IS NULL;

-- Egypt (EGP)
UPDATE countries SET 
  default_commission_pct = 12,
  default_courier_percentage = 75,
  default_delivery_fee = 25,
  default_min_order_amount = 50
WHERE code = 'EG' AND default_commission_pct IS NULL;

-- UAE (AED)
UPDATE countries SET 
  default_commission_pct = 15,
  default_courier_percentage = 80,
  default_delivery_fee = 15,
  default_min_order_amount = 30
WHERE code = 'AE' AND default_commission_pct IS NULL;

-- ── 3. Backfill country_id for existing users ──────────
-- Try to match by country_code if any
UPDATE users u SET country_id = (
  SELECT c.id FROM countries c WHERE c.code = u.country_code LIMIT 1
)
WHERE u.country_id IS NULL AND u.country_code IS NOT NULL;

-- For chefs: inherit from their kitchen's city's country
UPDATE users u SET country_id = (
  SELECT ci.country_id 
  FROM kitchens k 
  JOIN cities ci ON ci.id = k.city_id 
  WHERE k.user_id = u.id 
  LIMIT 1
)
WHERE u.country_id IS NULL AND u.role = 'chef';

-- For couriers: inherit from their courier's city's country
UPDATE users u SET country_id = (
  SELECT ci.country_id 
  FROM couriers co 
  JOIN cities ci ON ci.id = co.city_id 
  WHERE co.user_id = u.id 
  LIMIT 1
)
WHERE u.country_id IS NULL AND u.role = 'courier';

-- ── 4. Indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_country_role 
  ON users (country_id, role) 
  WHERE country_id IS NOT NULL;

-- ── 5. Update default currency for existing orders ─────
-- Match orders with their country via customer
UPDATE orders o SET currency_code = (
  SELECT c.currency_code 
  FROM users u 
  JOIN countries c ON c.id = u.country_id 
  WHERE u.id = o.customer_id 
  LIMIT 1
)
WHERE o.currency_code = 'SAR' 
  AND EXISTS (
    SELECT 1 FROM users u 
    JOIN countries c ON c.id = u.country_id 
    WHERE u.id = o.customer_id AND c.currency_code != 'SAR'
  );
