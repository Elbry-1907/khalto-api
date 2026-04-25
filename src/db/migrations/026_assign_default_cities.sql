-- ═══════════════════════════════════════════════════════════════════
-- Migration 026: Assign default city to orphan couriers/kitchens
-- ═══════════════════════════════════════════════════════════════════
-- Purpose:
--   Some couriers/kitchens were created without a city_id. This makes
--   the city → country JOIN return NULL, which breaks currency display.
--
--   Strategy:
--   1. For each orphan courier/kitchen, find a city in their country
--      (using country_id which IS populated from migration 024).
--   2. If they have a country but no city, assign the first active
--      city in that country.
--   3. If they have neither, skip them (admin must intervene).
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  affected INT;
BEGIN
  -- ─────────────────────────────────────────────────────────
  -- Couriers: assign city based on their country_id
  -- ─────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'country_id'
  ) THEN
    UPDATE couriers c
    SET city_id = (
      SELECT ci.id
      FROM cities ci
      WHERE ci.country_id = c.country_id
        AND ci.is_active = true
      ORDER BY ci.created_at ASC
      LIMIT 1
    )
    WHERE c.city_id IS NULL
      AND c.country_id IS NOT NULL;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Assigned default city to % orphan couriers (had country but no city)', affected;
  END IF;

  -- ─────────────────────────────────────────────────────────
  -- Kitchens: same strategy (defensive — only if column exists)
  -- ─────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kitchens' AND column_name = 'country_id'
  ) THEN
    UPDATE kitchens k
    SET city_id = (
      SELECT ci.id
      FROM cities ci
      WHERE ci.country_id = k.country_id
        AND ci.is_active = true
      ORDER BY ci.created_at ASC
      LIMIT 1
    )
    WHERE k.city_id IS NULL
      AND k.country_id IS NOT NULL;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'Assigned default city to % orphan kitchens', affected;
  END IF;

  -- ─────────────────────────────────────────────────────────
  -- Final fallback: any courier still without city, assign
  -- the first active Saudi city
  -- ─────────────────────────────────────────────────────────
  UPDATE couriers
  SET city_id = (
    SELECT ci.id
    FROM cities ci
    JOIN countries co ON co.id = ci.country_id
    WHERE co.code = 'SA'
      AND ci.is_active = true
    ORDER BY ci.created_at ASC
    LIMIT 1
  )
  WHERE city_id IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RAISE NOTICE 'Fallback: assigned Saudi city to % couriers without country', affected;
  END IF;
END $$;
