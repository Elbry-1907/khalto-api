-- ═══════════════════════════════════════════════════════
-- Migration 022: Force update country defaults
-- (Migration 021 used IS NULL but defaults were already set)
-- ═══════════════════════════════════════════════════════

-- Saudi Arabia (SAR) — keep similar to baseline
UPDATE countries SET 
  default_commission_pct = 15,
  default_courier_percentage = 80,
  default_delivery_fee = 12,
  default_min_order_amount = 30
WHERE code = 'SA';

-- Egypt (EGP) — different rates for Egyptian market
UPDATE countries SET 
  default_commission_pct = 12,
  default_courier_percentage = 75,
  default_delivery_fee = 25,
  default_min_order_amount = 50
WHERE code = 'EG';

-- UAE (AED) — premium market
UPDATE countries SET 
  default_commission_pct = 18,
  default_courier_percentage = 82,
  default_delivery_fee = 15,
  default_min_order_amount = 30
WHERE code = 'AE';
