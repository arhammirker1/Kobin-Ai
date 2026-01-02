-- Add missing columns to tasks table for enhanced task management

-- Add status column
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'todo';

-- Add assignee column
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS assignee text;

-- Add linked column (for linking to projects/goals)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS linked text;

-- Update existing tasks to have proper status based on completion
UPDATE public.tasks 
SET status = CASE 
  WHEN is_completed = true THEN 'completed'
  ELSE 'todo'
END
WHERE status IS NULL;
