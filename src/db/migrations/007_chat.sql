-- ═══════════════════════════════════════════════════════════
-- Migration 007: Live Chat Tables
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            VARCHAR(20) NOT NULL,  -- support | courier | chef
  order_id        UUID REFERENCES orders(id),
  customer_id     UUID NOT NULL REFERENCES users(id),
  participant_id  UUID,                  -- courier_id or kitchen_id
  assigned_to     UUID REFERENCES users(id), -- support agent
  assigned_at     TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'open',  -- open | closed | pending
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  unread_customer INTEGER DEFAULT 0,
  unread_agent    INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conv_customer ON chat_conversations(customer_id, status);
CREATE INDEX idx_conv_type     ON chat_conversations(type, status);
CREATE INDEX idx_conv_agent    ON chat_conversations(assigned_to, status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  sender_role     VARCHAR(30),
  content         TEXT NOT NULL DEFAULT '',
  type            VARCHAR(20) DEFAULT 'text',  -- text | image | location | quick_reply | system
  attachment_url  TEXT,
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_msgs_conv ON chat_messages(conversation_id, created_at ASC);

-- Quick reply templates for support agents
CREATE TABLE IF NOT EXISTS chat_quick_replies (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_ar   VARCHAR(200) NOT NULL,
  title_en   VARCHAR(200),
  content_ar TEXT NOT NULL,
  content_en TEXT,
  category   VARCHAR(50),  -- order | payment | delivery | general
  lang       VARCHAR(5) DEFAULT 'ar',
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed quick replies
INSERT INTO chat_quick_replies (id, title_ar, content_ar, category, sort_order) VALUES
(uuid_generate_v4(), 'مرحبا وترحيب', 'أهلاً بك في خالتو! 😊 كيف أقدر أساعدك؟', 'general', 1),
(uuid_generate_v4(), 'الطلب في الطريق', 'طلبك في الطريق إليك. الوقت المتوقع للوصول {{eta}} دقيقة. 🛵', 'delivery', 2),
(uuid_generate_v4(), 'سيتم الرد قريباً', 'شكراً على تواصلك. سيتم معالجة طلبك خلال دقائق. ⏳', 'general', 3),
(uuid_generate_v4(), 'استرداد المبلغ', 'تم تسجيل طلب الاسترداد. سيصل المبلغ لحسابك خلال 3-5 أيام عمل. 💰', 'payment', 4),
(uuid_generate_v4(), 'اعتذار عن التأخير', 'نعتذر عن التأخير في طلبك. نعمل على حل المشكلة بأسرع وقت. 🙏', 'order', 5),
(uuid_generate_v4(), 'إغلاق المحادثة', 'شكراً لتواصلك مع خالتو! هل هناك أي شيء آخر أقدر أساعدك به؟ 😊', 'general', 6)
ON CONFLICT DO NOTHING;
