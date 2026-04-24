-- ═══════════════════════════════════════════════════════
-- Migration: Countries Full System
-- ═══════════════════════════════════════════════════════

-- Drop old simple countries table and recreate with full fields
ALTER TABLE countries ADD COLUMN IF NOT EXISTS currency_symbol     VARCHAR(10);
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

-- Seed Egypt and Saudi Arabia
INSERT INTO countries (
  id, name_ar, name_en, code, currency, currency_symbol,
  phone_code, default_language,
  tax_rate, platform_commission_pct,
  delivery_fee_base, delivery_fee_per_km,
  min_order_amount, max_delivery_distance_km,
  payment_gateway, settlement_frequency_days,
  chef_payout_pct, courier_delivery_pct,
  surge_multiplier_max, is_active
) VALUES
(
  uuid_generate_v4(),
  'مصر', 'Egypt', 'EG', 'EGP', 'ج.م',
  '+20', 'ar',
  14, 15,
  25, 2,
  100, 15,
  'paymob', 7,
  85, 80,
  2.5, true
),
(
  uuid_generate_v4(),
  'المملكة العربية السعودية', 'Saudi Arabia', 'SA', 'SAR', 'ر.س',
  '+966', 'ar',
  15, 15,
  8, 1,
  30, 20,
  'tap', 7,
  85, 80,
  2.5, true
)
ON CONFLICT (code) DO UPDATE SET
  currency_symbol = EXCLUDED.currency_symbol,
  tax_rate = EXCLUDED.tax_rate,
  platform_commission_pct = EXCLUDED.platform_commission_pct,
  delivery_fee_base = EXCLUDED.delivery_fee_base,
  delivery_fee_per_km = EXCLUDED.delivery_fee_per_km,
  min_order_amount = EXCLUDED.min_order_amount,
  max_delivery_distance_km = EXCLUDED.max_delivery_distance_km,
  payment_gateway = EXCLUDED.payment_gateway,
  settlement_frequency_days = EXCLUDED.settlement_frequency_days,
  chef_payout_pct = EXCLUDED.chef_payout_pct,
  courier_delivery_pct = EXCLUDED.courier_delivery_pct,
  surge_multiplier_max = EXCLUDED.surge_multiplier_max,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
