-- ═══════════════════════════════════════════════════════
-- Migration 017: Admin tracking columns for kitchens
-- Adds columns referenced by approve/reject/suspend endpoints
-- ═══════════════════════════════════════════════════════

-- ── Admin tracking columns ────────────────────────────
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS approved_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS rejected_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS suspended_by        UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS suspended_at        TIMESTAMPTZ;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS suspension_reason   TEXT;
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS admin_notes         TEXT;

-- ── Useful contact + business columns ─────────────────
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS contact_phone       VARCHAR(20);
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS contact_email       VARCHAR(150);
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS commercial_register  VARCHAR(50);
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS tax_number          VARCHAR(50);
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS bank_account_iban   VARCHAR(50);
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(150);

-- ── Useful indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kitchens_status_created
  ON kitchens (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kitchens_user
  ON kitchens (user_id);

-- ── kitchen_documents: ensure exists with all needed columns ──
CREATE TABLE IF NOT EXISTS kitchen_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id  UUID REFERENCES kitchens(id) ON DELETE CASCADE,
  doc_type    VARCHAR(50) NOT NULL,
  file_url    TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  expires_at  TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes       TEXT
);

ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_kitchen_docs_kitchen
  ON kitchen_documents (kitchen_id);

-- ── kitchen_status_log: track all status changes ──────
CREATE TABLE IF NOT EXISTS kitchen_status_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id   UUID REFERENCES kitchens(id) ON DELETE CASCADE,
  from_status  VARCHAR(30),
  to_status    VARCHAR(30) NOT NULL,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_status_log_kitchen
  ON kitchen_status_log (kitchen_id, created_at DESC);
