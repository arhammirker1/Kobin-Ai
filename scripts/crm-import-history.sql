-- CRM Import History
-- Tracks which CSV/XLSX files were imported and how many rows were added.
-- No actual lead data is stored here — leads go into the "relationships" table.

CREATE TABLE IF NOT EXISTS crm_import_history (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name     text NOT NULL,
  rows_imported integer DEFAULT 0,
  rows_skipped  integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- RLS: users can only see/insert their own import history
ALTER TABLE crm_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import history"
  ON crm_import_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for listing recent imports
CREATE INDEX IF NOT EXISTS idx_crm_import_history_user
  ON crm_import_history (user_id, created_at DESC);

-- Also ensure the relationships table has an "email" column if it doesn't already
-- (the import dedup logic queries by email)
-- ALTER TABLE relationships ADD COLUMN IF NOT EXISTS email text;
