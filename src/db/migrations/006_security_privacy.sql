-- ═══════════════════════════════════════════════════════════
-- Migration 006: Security & Privacy Tables
-- ═══════════════════════════════════════════════════════════

-- ── Soft delete for users ─────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- ── User Consents (PDPL/GDPR) ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  -- terms_of_service | privacy_policy | marketing | analytics | cookies
  granted    BOOLEAN NOT NULL,
  version    VARCHAR(10) DEFAULT '1.0',
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- ── Failed Login Attempts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier  VARCHAR(200),  -- phone or email (hashed)
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  reason      VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_failed_login ON failed_login_attempts(ip_address, created_at DESC);

-- ── Security Events ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  event_type  VARCHAR(50) NOT NULL,
  -- LOGIN | LOGOUT | OTP_FAILED | ACCOUNT_LOCKED | SUSPICIOUS_ACTIVITY
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events ON security_events(user_id, event_type, created_at DESC);

-- ── Refresh Tokens (for revocation) ──────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  device_id  VARCHAR(200),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh ON refresh_tokens(user_id, revoked, expires_at);

-- ── Blocked IPs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip_address VARCHAR(50) PRIMARY KEY,
  reason     TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  blocked_by UUID REFERENCES users(id)
);

-- ── Data Retention Policy ─────────────────────────────────
-- Audit logs: 2 years
-- Security events: 1 year
-- OTP codes: auto-expired
-- Notifications: 90 days
-- Failed logins: 30 days
CREATE OR REPLACE FUNCTION cleanup_expired_data() RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes          WHERE expires_at < NOW();
  DELETE FROM notifications      WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM failed_login_attempts WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM security_events    WHERE created_at < NOW() - INTERVAL '1 year'
    AND event_type NOT IN ('ACCOUNT_LOCKED','SUSPICIOUS_ACTIVITY');
  DELETE FROM refresh_tokens     WHERE expires_at < NOW() AND revoked = true;
  DELETE FROM ads_events         WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Run cleanup daily (add to pg_cron or external scheduler)
-- SELECT cron.schedule('cleanup-expired', '0 3 * * *', 'SELECT cleanup_expired_data()');

-- ── Row Level Security (optional advanced) ────────────────
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY user_notifications ON notifications
--   USING (user_id = current_setting('app.current_user_id')::uuid);
