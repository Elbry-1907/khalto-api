-- ═══════════════════════════════════════════════════════════════════
-- Migration 024: Currency Fix + Default Country Linking
-- ═══════════════════════════════════════════════════════════════════
-- Purpose:
--   1. Fix UAE country: was incorrectly using SAR currency
--   2. Ensure all countries have proper currency_symbol
--   3. Link orphan kitchens/couriers (without country_id) to Saudi Arabia
--   4. Backfill orders.currency_code from customer's country
--
-- Notes:
--   • Runs in transaction (single block) — Postgres style
--   • Idempotent — safe to run multiple times
--   • Compatible with custom migrate.js runner (no knex)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- Step 1: Ensure currency_symbol columns exist
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'currency_symbol'
  ) THEN
    ALTER TABLE countries ADD COLUMN currency_symbol VARCHAR(10);
    RAISE NOTICE 'Added currency_symbol column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'countries' AND column_name = 'currency_symbol_en'
  ) THEN
    ALTER TABLE countries ADD COLUMN currency_symbol_en VARCHAR(10);
    RAISE NOTICE 'Added currency_symbol_en column';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- Step 2: Fix UAE — was incorrectly using SAR
-- ─────────────────────────────────────────────────────────────────
UPDATE countries
SET currency_code      = 'AED',
    currency_symbol    = 'د.إ',
    currency_symbol_en = 'AED'
WHERE code = 'AE';


-- ─────────────────────────────────────────────────────────────────
-- Step 3: Ensure correct currency for Saudi Arabia & Egypt
-- ─────────────────────────────────────────────────────────────────
UPDATE countries
SET currency_code      = 'SAR',
    currency_symbol    = 'ر.س',
    currency_symbol_en = 'SAR'
WHERE code = 'SA';

UPDATE countries
SET currency_code      = 'EGP',
    currency_symbol    = 'ج.م',
    currency_symbol_en = 'LE'
WHERE code = 'EG';


-- ─────────────────────────────────────────────────────────────────
-- Step 4: Backfill currency_symbol for ANY country missing it
-- ─────────────────────────────────────────────────────────────────
UPDATE countries SET currency_symbol = 'ر.س',  currency_symbol_en = 'SAR' WHERE currency_code = 'SAR' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'ج.م',  currency_symbol_en = 'LE'  WHERE currency_code = 'EGP' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'د.إ',  currency_symbol_en = 'AED' WHERE currency_code = 'AED' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'د.ك',  currency_symbol_en = 'KWD' WHERE currency_code = 'KWD' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'د.ب',  currency_symbol_en = 'BHD' WHERE currency_code = 'BHD' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'ر.ع',  currency_symbol_en = 'OMR' WHERE currency_code = 'OMR' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'ر.ق',  currency_symbol_en = 'QAR' WHERE currency_code = 'QAR' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = 'د.أ',  currency_symbol_en = 'JOD' WHERE currency_code = 'JOD' AND (currency_symbol IS NULL OR currency_symbol = '');
UPDATE countries SET currency_symbol = '$',    currency_symbol_en = 'USD' WHERE currency_code = 'USD' AND (currency_symbol IS NULL OR currency_symbol = '');


-- ─────────────────────────────────────────────────────────────────
-- Step 5: Link orphan kitchens to Saudi Arabia
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  saudi_id UUID;
  affected INT;
BEGIN
  SELECT id INTO saudi_id FROM countries WHERE code = 'SA' LIMIT 1;

  IF saudi_id IS NULL THEN
    RAISE WARNING 'Saudi Arabia not found in countries — skipping orphan link';
    RETURN;
  END IF;

  -- Link kitchens without country_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kitchens' AND column_name = 'country_id'
  ) THEN
    UPDATE kitchens SET country_id = saudi_id WHERE country_id IS NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Linked % orphan kitchens to Saudi Arabia', affected;
  END IF;

  -- Link couriers without country_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'country_id'
  ) THEN
    UPDATE couriers SET country_id = saudi_id WHERE country_id IS NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Linked % orphan couriers to Saudi Arabia', affected;
  END IF;

  -- Link users without country_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'country_id'
  ) THEN
    UPDATE users SET country_id = saudi_id WHERE country_id IS NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Linked % orphan users to Saudi Arabia', affected;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- Step 6: Backfill orders.currency_code from customer's country
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  affected INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'currency_code'
  ) THEN
    UPDATE orders o
    SET currency_code = COALESCE(c.currency_code, 'SAR')
    FROM users u
    LEFT JOIN countries c ON u.country_id = c.id
    WHERE o.customer_id = u.id
      AND (o.currency_code IS NULL OR o.currency_code = '');
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Backfilled currency_code for % orders', affected;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- Step 7: Verification — print final state
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════';
  RAISE NOTICE 'Final countries state:';
  RAISE NOTICE '═══════════════════════════════════════════════';
  FOR rec IN
    SELECT code, name_ar, currency_code, currency_symbol, currency_symbol_en
    FROM countries
    ORDER BY code
  LOOP
    RAISE NOTICE '  % | % | % | % | %',
      rec.code, rec.name_ar, rec.currency_code, rec.currency_symbol, rec.currency_symbol_en;
  END LOOP;
END $$;
