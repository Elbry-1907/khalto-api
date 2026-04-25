-- ═══════════════════════════════════════════════════════
-- Migration 018: Couriers admin tracking + business columns
-- ═══════════════════════════════════════════════════════

-- Critical: updated_at was missing!
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Admin tracking
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS approved_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS rejected_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS suspended_by        UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS suspended_at        TIMESTAMPTZ;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS suspension_reason   TEXT;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS admin_notes         TEXT;

-- Business
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS delivery_percentage NUMERIC(5,2) DEFAULT 80;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS bank_account_iban   VARCHAR(50);
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(150);
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS national_id         VARCHAR(50);
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS license_number      VARCHAR(50);
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS license_expiry      DATE;

-- Cached aggregates
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS total_deliveries    INTEGER DEFAULT 0;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS total_earnings      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS cancelled_deliveries INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_couriers_status_created
  ON couriers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_couriers_availability_status
  ON couriers (availability, status);

-- courier_documents enhancements
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS notes       TEXT;

CREATE INDEX IF NOT EXISTS idx_courier_docs_courier
  ON courier_documents (courier_id);

-- courier_status_log
CREATE TABLE IF NOT EXISTS courier_status_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id   UUID REFERENCES couriers(id) ON DELETE CASCADE,
  from_status  VARCHAR(30),
  to_status    VARCHAR(30) NOT NULL,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_status_log_courier
  ON courier_status_log (courier_id, created_at DESC);
