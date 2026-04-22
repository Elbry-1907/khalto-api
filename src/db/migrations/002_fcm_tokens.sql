-- Add FCM tokens table (run this migration)
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  platform   VARCHAR(10) DEFAULT 'android',
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcm_user ON user_fcm_tokens(user_id, is_active);

-- Add settlement_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id);
CREATE INDEX IF NOT EXISTS idx_orders_settlement ON orders(settlement_id);
