-- ============================================================================
-- 006: Add thread_subject column to email_analyses
-- Stores the Gmail thread subject line so search_contacts can show
-- human-readable thread names without calling the Gmail API.
-- ============================================================================

ALTER TABLE email_analyses ADD COLUMN IF NOT EXISTS thread_subject TEXT;
