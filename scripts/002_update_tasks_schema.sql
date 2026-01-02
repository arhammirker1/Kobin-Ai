-- Update tasks table to add status, deadline, and fix column names

-- Add new columns for enhanced task management
alter table public.tasks
  add column if not exists status text default 'todo',
  add column if not exists deadline timestamp with time zone,
  add column if not exists completed boolean default false,
  add column if not exists assignee text,
  add column if not exists linked text;

-- Drop old column if exists
alter table public.tasks
  drop column if exists is_completed;

-- Update bucket column to use lowercase with hyphens
update public.tasks set bucket = lower(replace(bucket, ' ', '-'));

-- Add index for better query performance
create index if not exists idx_tasks_user_bucket on public.tasks(user_id, bucket);
create index if not exists idx_tasks_deadline on public.tasks(deadline);
create index if not exists idx_tasks_priority on public.tasks(priority);
