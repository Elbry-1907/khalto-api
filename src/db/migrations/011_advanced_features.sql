-- ═══════════════════════════════════════════════════════════
-- Migration 011: Advanced Features
-- Smart Notifications + Order Batching + Kitchen Score + Subscriptions
-- ═══════════════════════════════════════════════════════════

-- ── Smart Notification Queue ──────────────────────────────
CREATE TABLE IF NOT EXISTS smart_notification_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key VARCHAR(100) NOT NULL,
  vars         JSONB DEFAULT '{}',
  send_at      TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) DEFAULT 'scheduled',  -- scheduled | sent | failed
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_smart_notif_send ON smart_notification_queue(status, send_at);

-- ── Order Batches ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_batches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id  UUID NOT NULL REFERENCES couriers(id),
  order_ids   JSONB NOT NULL DEFAULT '[]',
  status      VARCHAR(20) DEFAULT 'assigned',  -- assigned | picked_up | delivered
  batch_bonus NUMERIC(8,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_batches_courier ON order_batches(courier_id, status);

-- ── Kitchen Subscription Plans ────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchen_id      UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  plan_id         VARCHAR(20) NOT NULL DEFAULT 'starter',
  -- starter | pro | enterprise
  price_paid      NUMERIC(10,2) DEFAULT 0,
  currency        VARCHAR(3) DEFAULT 'SAR',
  status          VARCHAR(20) DEFAULT 'active',
  -- active | cancelled | expired | past_due
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  next_billing_at TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subs_kitchen ON kitchen_subscriptions(kitchen_id, status);

-- ── Kitchen Performance Cache ─────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_scores (
  kitchen_id       UUID PRIMARY KEY REFERENCES kitchens(id) ON DELETE CASCADE,
  overall_score    NUMERIC(5,2) DEFAULT 0,
  badge            VARCHAR(50),
  delivery_score   NUMERIC(5,2) DEFAULT 0,
  rating_score     NUMERIC(5,2) DEFAULT 0,
  volume_score     NUMERIC(5,2) DEFAULT 0,
  safety_score     NUMERIC(5,2) DEFAULT 0,
  consistency_score NUMERIC(5,2) DEFAULT 0,
  last_calculated  TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Add plan columns to kitchens ──────────────────────────
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'starter';

-- ── Seed starter subscriptions for existing kitchens ──────
INSERT INTO kitchen_subscriptions (id, kitchen_id, plan_id, status)
SELECT uuid_generate_v4(), id, 'starter', 'active'
FROM kitchens
WHERE id NOT IN (SELECT kitchen_id FROM kitchen_subscriptions)
ON CONFLICT DO NOTHING;
