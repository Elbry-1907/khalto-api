-- ═══════════════════════════════════════════════════════
-- Migration 023: Documents System Foundation
-- ═══════════════════════════════════════════════════════

-- ── 1. courier_documents: ensure all needed fields ─────
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS mime_type       VARCHAR(100);
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS original_name   VARCHAR(255);
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS is_required     BOOLEAN DEFAULT TRUE;
ALTER TABLE courier_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ── 2. kitchen_documents: ensure all needed fields ─────
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS mime_type       VARCHAR(100);
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS original_name   VARCHAR(255);
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS is_required     BOOLEAN DEFAULT TRUE;
ALTER TABLE kitchen_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ── 3. Document type definitions table ────────────────
CREATE TABLE IF NOT EXISTS document_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     VARCHAR(20) NOT NULL,  -- 'courier' | 'kitchen'
  doc_type        VARCHAR(50) NOT NULL,
  name_ar         VARCHAR(150) NOT NULL,
  name_en         VARCHAR(150) NOT NULL,
  description_ar  TEXT,
  is_required     BOOLEAN DEFAULT TRUE,
  has_expiry      BOOLEAN DEFAULT FALSE,
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, doc_type)
);

-- ── 4. Seed required document types ────────────────────
INSERT INTO document_types (entity_type, doc_type, name_ar, name_en, description_ar, is_required, has_expiry, sort_order)
VALUES
  -- COURIER documents
  ('courier', 'national_id',     'الهوية الوطنية',          'National ID',        'صورة واضحة من الوجهين',                            TRUE,  TRUE,  1),
  ('courier', 'driver_license',  'رخصة القيادة',            'Driver License',     'صورة واضحة من الوجهين، سارية',                     TRUE,  TRUE,  2),
  ('courier', 'personal_photo',  'صورة شخصية',              'Personal Photo',     'صورة شخصية حديثة وواضحة',                          TRUE,  FALSE, 3),
  ('courier', 'criminal_record', 'شهادة عدم محكومية',       'Criminal Record',    'اختياري - لكن يفضّل وجودها',                       FALSE, TRUE,  4),

  -- KITCHEN documents
  ('kitchen', 'owner_national_id',   'الهوية الوطنية للمالك',   'Owner National ID',  'صورة واضحة من الوجهين',                       TRUE,  TRUE,  1),
  ('kitchen', 'health_certificate', 'شهادة فحص طبي',           'Health Certificate', 'اختياري - لكن يفضّل وجودها',                  FALSE, TRUE,  2)
ON CONFLICT (entity_type, doc_type) DO NOTHING;

-- ── 5. Indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courier_docs_status
  ON courier_documents (courier_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_docs_status
  ON kitchen_documents (kitchen_id, status);
