-- 005_meeting_recordings.sql
-- Meeting recorder schema for Kobin AI
-- Tables: meeting_bot_config, meeting_recordings_raw, meeting_analyses

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. MEETING BOT CONFIG — per-user recording preferences
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meeting_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_name text DEFAULT 'Kobin AI',
  auto_record boolean DEFAULT false,
  groq_whisper_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT meeting_bot_config_user_unique UNIQUE (user_id)
);

ALTER TABLE public.meeting_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meeting bot config"
  ON public.meeting_bot_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meeting bot config"
  ON public.meeting_bot_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meeting bot config"
  ON public.meeting_bot_config FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_meeting_bot_config_updated_at
  BEFORE UPDATE ON public.meeting_bot_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. MEETING RECORDINGS RAW — raw transcript staging table
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meeting_recordings_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Meeting metadata
  meeting_title text NOT NULL DEFAULT 'Untitled Meeting',
  meeting_url text,                                       -- Google Meet / Zoom URL
  calendar_event_id text,                                 -- Google Calendar event ID for participant matching

  -- Participant info (from calendar invite)
  participant_emails text[] DEFAULT '{}',                  -- emails from calendar invite
  participant_names text[] DEFAULT '{}',                   -- display names detected

  -- Transcript data
  host_segments jsonb DEFAULT '[]'::jsonb,                -- [{time: "00:01:23", text: "..."}, ...]
  participant_segments jsonb DEFAULT '[]'::jsonb,          -- [{time: "00:01:35", text: "..."}, ...]
  combined_transcript text DEFAULT '',                     -- full interleaved transcript
  
  -- Recording metadata
  duration_seconds integer DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,

  -- Processing state machine
  processing_status text DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error text,                                   -- error message if failed

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_meeting_recordings_user ON public.meeting_recordings_raw(user_id);
CREATE INDEX idx_meeting_recordings_status ON public.meeting_recordings_raw(processing_status);
CREATE INDEX idx_meeting_recordings_created ON public.meeting_recordings_raw(created_at DESC);

ALTER TABLE public.meeting_recordings_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meeting recordings"
  ON public.meeting_recordings_raw FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meeting recordings"
  ON public.meeting_recordings_raw FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meeting recordings"
  ON public.meeting_recordings_raw FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meeting recordings"
  ON public.meeting_recordings_raw FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. MEETING ANALYSES — AI-processed meeting intelligence
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meeting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL REFERENCES public.meeting_recordings_raw(id) ON DELETE CASCADE,

  -- AI-generated summary
  summary text,
  
  -- Extracted data
  key_decisions jsonb DEFAULT '[]'::jsonb,                 -- [{decision, context, decided_by}]
  action_items jsonb DEFAULT '[]'::jsonb,                  -- [{action, assignee, priority, due_hint}]
  sentiment text,                                          -- positive / neutral / negative / mixed
  topics text[] DEFAULT '{}',                              -- ["pricing", "timeline", "deliverables"]

  -- CRM integration results
  crm_matches jsonb DEFAULT '[]'::jsonb,                   -- [{participant_email, relationship_id, name, stage_before, stage_after}]
  
  -- Auto-created references
  tasks_created uuid[] DEFAULT '{}',                       -- task IDs created from action items
  notes_created uuid[] DEFAULT '{}',                       -- vault_note IDs created from decisions
  
  analyzed_at timestamptz DEFAULT now(),

  CONSTRAINT meeting_analyses_recording_unique UNIQUE (recording_id)
);

CREATE INDEX idx_meeting_analyses_user ON public.meeting_analyses(user_id);
CREATE INDEX idx_meeting_analyses_recording ON public.meeting_analyses(recording_id);

ALTER TABLE public.meeting_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meeting analyses"
  ON public.meeting_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meeting analyses"
  ON public.meeting_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meeting analyses"
  ON public.meeting_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
