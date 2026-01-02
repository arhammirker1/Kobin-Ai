-- Create relationships table for CRM functionality
-- Stores leads, clients, investors, partners, and talent relationships

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own relationships" ON public.relationships;
DROP POLICY IF EXISTS "Users can create their own relationships" ON public.relationships;
DROP POLICY IF EXISTS "Users can update their own relationships" ON public.relationships;
DROP POLICY IF EXISTS "Users can delete their own relationships" ON public.relationships;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_relationships_updated_at ON public.relationships;

-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_relationships_user_id;
DROP INDEX IF EXISTS idx_relationships_type;
DROP INDEX IF EXISTS idx_relationships_status;
DROP INDEX IF EXISTS idx_events_relationship_id;

-- Create relationships table (drop and recreate to ensure clean state)
DROP TABLE IF EXISTS public.relationships CASCADE;

-- Added purpose, outcome, and tags columns
CREATE TABLE public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  company text,
  role text,
  relationship_type text NOT NULL CHECK (relationship_type IN ('lead', 'client', 'investor', 'partner', 'talent')),
  linkedin_profile_url text,
  meeting_link text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_relationships_user_id ON public.relationships(user_id);
CREATE INDEX idx_relationships_type ON public.relationships(relationship_type);
CREATE INDEX idx_relationships_status ON public.relationships(status);
CREATE INDEX idx_relationships_tags ON public.relationships USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own relationships"
  ON public.relationships
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own relationships"
  ON public.relationships
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own relationships"
  ON public.relationships
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own relationships"
  ON public.relationships
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on relationships
CREATE TRIGGER update_relationships_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add relationship_id column to existing events table to link events to relationships
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS relationship_id uuid REFERENCES public.relationships(id) ON DELETE SET NULL;

-- Create index for faster lookups of events by relationship
CREATE INDEX IF NOT EXISTS idx_events_relationship_id ON public.events(relationship_id);

-- Added purpose and outcome columns to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS meeting_link text,
ADD COLUMN IF NOT EXISTS purpose text,
ADD COLUMN IF NOT EXISTS outcome text;
