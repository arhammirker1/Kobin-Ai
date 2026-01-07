-- Add user_type column to profiles if it doesn't exist (in case it wasn't created initially)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'founder' CHECK (user_type IN ('founder', 'team_member', 'client'));

-- Create index for user_type lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON public.profiles(user_type);
