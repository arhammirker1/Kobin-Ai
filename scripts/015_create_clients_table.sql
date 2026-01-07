-- Create clients table for client account management
DROP TABLE IF EXISTS public.clients CASCADE;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  founder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id uuid REFERENCES public.relationships(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_clients_founder_id ON public.clients(founder_id);
CREATE INDEX idx_clients_relationship_id ON public.clients(relationship_id);
CREATE INDEX idx_clients_project_id ON public.clients(project_id);

-- Enable Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Founders can view their clients"
  ON public.clients
  FOR SELECT
  USING (auth.uid() = founder_id);

CREATE POLICY "Clients can view their own record"
  ON public.clients
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Founders can create clients"
  ON public.clients
  FOR INSERT
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Founders can update their clients"
  ON public.clients
  FOR UPDATE
  USING (auth.uid() = founder_id)
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Founders can delete their clients"
  ON public.clients
  FOR DELETE
  USING (auth.uid() = founder_id);

-- Create trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
