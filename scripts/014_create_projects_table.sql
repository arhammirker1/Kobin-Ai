-- Create projects table for workspace project management
DROP TABLE IF EXISTS public.projects CASCADE;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_projects_founder_id ON public.projects(founder_id);
CREATE INDEX idx_projects_status ON public.projects(status);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS policies - only founders can manage their projects
CREATE POLICY "Founders can view their projects"
  ON public.projects
  FOR SELECT
  USING (auth.uid() = founder_id);

CREATE POLICY "Founders can create projects"
  ON public.projects
  FOR INSERT
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Founders can update their projects"
  ON public.projects
  FOR UPDATE
  USING (auth.uid() = founder_id)
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Founders can delete their projects"
  ON public.projects
  FOR DELETE
  USING (auth.uid() = founder_id);

-- Create trigger for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
