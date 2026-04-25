-- ═══════════════════════════════════════════════════════
-- Migration 020: User management + Documents enhancements
-- ═══════════════════════════════════════════════════════

-- ── 1. users: add fields needed for admin control ──────
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at         TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_by  UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_blocked ON users (blocked_at) WHERE blocked_at IS NOT NULL;

-- ── 2. courier_documents: enhance for new system ───────
-- (Already has: id, courier_id, doc_type, file_url, status, expires_at, uploaded_at, reviewed_by, reviewed_at, notes)

-- Add what's needed
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT;
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS mime_type        VARCHAR(100);
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS original_name    VARCHAR(255);
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS is_required      BOOLEAN DEFAULT TRUE;

-- Status values: pending | approved | rejected
-- doc_type values: national_id | driver_license | personal_photo | criminal_record

CREATE INDEX IF NOT EXISTS idx_courier_docs_type
  ON courier_documents (courier_id, doc_type);

-- ── 3. kitchen_documents: enhance for new system ───────
-- (Already has: id, kitchen_id, doc_type, file_url, status, expires_at, uploaded_at)

ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS notes            TEXT;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS mime_type        VARCHAR(100);
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS original_name    VARCHAR(255);
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS is_required      BOOLEAN DEFAULT TRUE;

-- doc_type values for kitchens: owner_national_id | health_certificate

CREATE INDEX IF NOT EXISTS idx_kitchen_docs_type
  ON kitchen_documents (kitchen_id, doc_type);

-- ── 4. user_action_log: track admin actions on users ───
CREATE TABLE IF NOT EXISTS user_action_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(50) NOT NULL,
  -- block | unblock | password_reset | profile_updated | created
  done_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_action_log_user
  ON user_action_log (user_id, created_at DESC);
