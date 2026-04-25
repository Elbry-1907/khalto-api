-- ═══════════════════════════════════════════════════════
-- Migration 014: Fix countries schema and seed defaults
-- Resolves mismatch between old schema (currency_code, default_lang, tax_pct)
-- and new schema expected by frontend
-- ═══════════════════════════════════════════════════════

-- ── 1. Add ALL columns the frontend expects ─────────────
ALTER TABLE countries ADD COLUMN IF NOT EXISTS currency             VARCHAR(10);
ALTER TABLE countries ADD COLUMN IF NOT EXISTS currency_symbol      VARCHAR(10);
ALTER TABLE countries ADD COLUMN IF NOT EXISTS phone_code            VARCHAR(10);
ALTER TABLE countries ADD COLUMN IF NOT EXISTS default_language     VARCHAR(5)   DEFAULT 'ar';
ALTER TABLE countries ADD COLUMN IF NOT EXISTS tax_rate             NUMERIC(5,2) DEFAULT 15;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS platform_commission_pct NUMERIC(5,2) DEFAULT 15;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS delivery_fee_base    NUMERIC(10,2) DEFAULT 10;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS delivery_fee_per_km  NUMERIC(10,2) DEFAULT 1;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS min_order_amount     NUMERIC(10,2) DEFAULT 50;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS max_delivery_distance_km INTEGER DEFAULT 20;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS payment_gateway      VARCHAR(50) DEFAULT 'tap';
ALTER TABLE countries ADD COLUMN IF NOT EXISTS settlement_frequency_days INTEGER DEFAULT 7;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS chef_payout_pct      NUMERIC(5,2) DEFAULT 85;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS courier_delivery_pct NUMERIC(5,2) DEFAULT 80;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS surge_multiplier_max NUMERIC(4,2) DEFAULT 2.5;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Migrate data from old columns to new columns ─────
-- currency_code → currency (if currency is null)
UPDATE countries
SET currency = currency_code
WHERE currency IS NULL AND currency_code IS NOT NULL;

-- default_lang → default_language
UPDATE countries
SET default_language = default_lang
WHERE default_language IS NULL AND default_lang IS NOT NULL;

-- tax_pct → tax_rate (column may not exist, use COALESCE in update only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='countries' AND column_name='tax_pct') THEN
    UPDATE countries
    SET tax_rate = tax_pct
    WHERE tax_rate IS NULL OR tax_rate = 15;
  END IF;
END $$;

-- ── 3. Set defaults for SA and EG specifically ───────────
UPDATE countries SET
  currency_symbol = 'ر.س',
  phone_code = '+966',
  tax_rate = 15,
  platform_commission_pct = 15,
  delivery_fee_base = 8,
  delivery_fee_per_km = 1,
  min_order_amount = 30,
  max_delivery_distance_km = 20,
  payment_gateway = 'tap',
  chef_payout_pct = 85,
  courier_delivery_pct = 80,
  surge_multiplier_max = 2.5
WHERE code = 'SA';

UPDATE countries SET
  currency_symbol = 'ج.م',
  phone_code = '+20',
  tax_rate = 14,
  platform_commission_pct = 15,
  delivery_fee_base = 25,
  delivery_fee_per_km = 2,
  min_order_amount = 100,
  max_delivery_distance_km = 15,
  payment_gateway = 'paymob',
  chef_payout_pct = 85,
  courier_delivery_pct = 80,
  surge_multiplier_max = 2.5
WHERE code = 'EG';

-- ── 4. Insert SA and EG if they don't exist ─────────────
INSERT INTO countries (id, name_ar, name_en, code, currency, currency_code, currency_symbol,
                       phone_code, default_language, default_lang,
                       tax_rate, platform_commission_pct,
                       delivery_fee_base, delivery_fee_per_km,
                       min_order_amount, max_delivery_distance_km,
                       payment_gateway, settlement_frequency_days,
                       chef_payout_pct, courier_delivery_pct,
                       surge_multiplier_max, is_active)
SELECT gen_random_uuid(), 'المملكة العربية السعودية', 'Saudi Arabia', 'SA', 'SAR', 'SAR', 'ر.س',
       '+966', 'ar', 'ar',
       15, 15,
       8, 1,
       30, 20,
       'tap', 7,
       85, 80,
       2.5, true
WHERE NOT EXISTS (SELECT 1 FROM countries WHERE code = 'SA');

INSERT INTO countries (id, name_ar, name_en, code, currency, currency_code, currency_symbol,
                       phone_code, default_language, default_lang,
                       tax_rate, platform_commission_pct,
                       delivery_fee_base, delivery_fee_per_km,
                       min_order_amount, max_delivery_distance_km,
                       payment_gateway, settlement_frequency_days,
                       chef_payout_pct, courier_delivery_pct,
                       surge_multiplier_max, is_active)
SELECT gen_random_uuid(), 'مصر', 'Egypt', 'EG', 'EGP', 'EGP', 'ج.م',
       '+20', 'ar', 'ar',
       14, 15,
       25, 2,
       100, 15,
       'paymob', 7,
       85, 80,
       2.5, true
WHERE NOT EXISTS (SELECT 1 FROM countries WHERE code = 'EG');
