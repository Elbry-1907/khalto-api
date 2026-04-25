-- ═══════════════════════════════════════════════════════
-- Migration 019: Fix users table missing columns
-- Adds country_code, is_verified, updated_at
-- ═══════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_id   UUID REFERENCES countries(id) ON DELETE SET NULL;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_country ON users (country_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
