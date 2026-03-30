-- ============================================================================
-- 005: Email Intelligence Layer
-- Phase 1: email_analyses table for AI-processed email insights
-- Phase 2: lead scoring + ghosting columns on relationships
-- ============================================================================

-- ─── Phase 1: Email Analyses ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  contact_id UUID REFERENCES relationships(id) ON DELETE SET NULL,
  sender_email TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL DEFAULT 'inbound',

  -- AI classification results
  intent TEXT NOT NULL DEFAULT 'neutral',
  -- Possible intents: interested, not_interested, neutral, request_info,
  --   pricing_inquiry, meeting_intent, objection, spam
  intent_confidence INTEGER CHECK (intent_confidence BETWEEN 0 AND 100) DEFAULT 50,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')) NOT NULL DEFAULT 'neutral',
  signals JSONB DEFAULT '[]'::jsonb,
  -- e.g. ["wants demo", "available next week", "budget: $50k"]
  reasoning TEXT,
  -- AI's short explanation of classification

  analyzed_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, gmail_message_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_analyses_user_thread
  ON email_analyses(user_id, gmail_thread_id);

CREATE INDEX IF NOT EXISTS idx_email_analyses_contact
  ON email_analyses(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_analyses_intent
  ON email_analyses(user_id, intent);

-- RLS
ALTER TABLE email_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyses"
  ON email_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON email_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ─── Phase 2: Lead Scoring + Ghosting on Relationships ──────────────────────

-- Add scoring columns (safe IF NOT EXISTS approach)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'lead_score'
  ) THEN
    ALTER TABLE relationships ADD COLUMN lead_score INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'lead_status'
  ) THEN
    ALTER TABLE relationships ADD COLUMN lead_status TEXT DEFAULT 'cold';
    -- cold, warm, hot
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'last_inbound_at'
  ) THEN
    ALTER TABLE relationships ADD COLUMN last_inbound_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'last_outbound_at'
  ) THEN
    ALTER TABLE relationships ADD COLUMN last_outbound_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'is_ghosting'
  ) THEN
    ALTER TABLE relationships ADD COLUMN is_ghosting BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'ghosting_days'
  ) THEN
    ALTER TABLE relationships ADD COLUMN ghosting_days INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relationships' AND column_name = 'score_updated_at'
  ) THEN
    ALTER TABLE relationships ADD COLUMN score_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for ghosting queries
CREATE INDEX IF NOT EXISTS idx_relationships_ghosting
  ON relationships(user_id, is_ghosting)
  WHERE is_ghosting = true;

CREATE INDEX IF NOT EXISTS idx_relationships_lead_score
  ON relationships(user_id, lead_score DESC);
