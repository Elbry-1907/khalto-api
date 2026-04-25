-- ═══════════════════════════════════════════════════════════════════
-- Migration 025: Backfill country_id from city's country_id
-- ═══════════════════════════════════════════════════════════════════
-- For any kitchen/courier with NULL country_id but with a city,
-- copy the country_id from the city.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  affected INT;
BEGIN
  -- Backfill kitchens
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kitchens' AND column_name = 'country_id'
  ) THEN
    UPDATE kitchens k
    SET country_id = ci.country_id
    FROM cities ci
    WHERE k.city_id = ci.id
      AND k.country_id IS NULL
      AND ci.country_id IS NOT NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Backfilled country_id for % kitchens', affected;
  END IF;

  -- Backfill couriers
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'country_id'
  ) THEN
    UPDATE couriers c
    SET country_id = ci.country_id
    FROM cities ci
    WHERE c.city_id = ci.id
      AND c.country_id IS NULL
      AND ci.country_id IS NOT NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Backfilled country_id for % couriers', affected;
  END IF;
END $$;
