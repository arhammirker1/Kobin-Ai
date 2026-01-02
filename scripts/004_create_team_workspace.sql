-- Team Workspace Schema for Founder Control Center
-- Implements founder-controlled team member accounts with explicit permissions

-- STEP 1: Add user_type to profiles table
alter table public.profiles
  add column if not exists user_type text default 'founder' check (user_type in ('founder', 'team_member')),
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

-- STEP 2: Create team_members table for extended team member information
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade not null,
  founder_id uuid references auth.users(id) on delete cascade not null,
  position text not null,
  is_active boolean default true,
  
  -- Explicit feature-level permissions (boolean flags)
  can_view_tasks boolean default true,
  can_update_task_status boolean default true,
  can_create_tasks boolean default false,
  can_view_calendar boolean default false,
  can_view_linkedin boolean default false,
  can_view_relationships boolean default false,
  can_view_vault boolean default false,
  can_view_analytics boolean default false,
  
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.team_members enable row level security;

-- Founder can view and manage their team members
create policy "Founders can manage their team members" 
  on public.team_members 
  for all 
  using (auth.uid() = founder_id);

-- Team members can view their own record (read-only)
create policy "Team members can view own record" 
  on public.team_members 
  for select 
  using (auth.uid() = user_id);

-- STEP 3: Update tasks table for assignment
alter table public.tasks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

-- Update existing tasks to set created_by as user_id if not set
update public.tasks set created_by = user_id where created_by is null;

-- STEP 4: Update RLS policies for tasks

-- Drop old policy
drop policy if exists "Users can manage own tasks" on public.tasks;

-- Founders can see all their tasks and tasks they created
create policy "Founders can manage their workspace tasks" 
  on public.tasks 
  for all 
  using (
    auth.uid() = user_id 
    or auth.uid() = created_by
    or auth.uid() in (
      select founder_id from public.team_members where user_id = tasks.assigned_to
    )
  );

-- Team members can only see tasks assigned to them
create policy "Team members can view assigned tasks" 
  on public.tasks 
  for select 
  using (auth.uid() = assigned_to);

-- Team members can update status of their assigned tasks
create policy "Team members can update assigned task status" 
  on public.tasks 
  for update 
  using (
    auth.uid() = assigned_to 
    and exists (
      select 1 from public.team_members 
      where user_id = auth.uid() 
      and can_update_task_status = true
      and is_active = true
    )
  )
  with check (
    auth.uid() = assigned_to
  );

-- Team members can create tasks if they have permission
create policy "Team members can create tasks if permitted" 
  on public.tasks 
  for insert 
  with check (
    auth.uid() = user_id 
    or exists (
      select 1 from public.team_members 
      where user_id = auth.uid() 
      and can_create_tasks = true
      and is_active = true
    )
  );

-- STEP 5: Create indexes for performance
create index if not exists idx_team_members_founder on public.team_members(founder_id);
create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_profiles_user_type on public.profiles(user_type);

-- STEP 6: Add trigger to update team_members updated_at
create or replace function public.update_team_member_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger team_members_updated_at
  before update on public.team_members
  for each row
  execute function public.update_team_member_timestamp();

-- STEP 7: Function to check if user is a founder
create or replace function public.is_founder(user_uuid uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.profiles 
    where id = user_uuid and user_type = 'founder'
  );
end;
$$;

-- STEP 8: Function to get team member permissions
create or replace function public.get_team_member_permissions(user_uuid uuid)
returns json
language plpgsql
security definer
as $$
declare
  permissions_json json;
begin
  select json_build_object(
    'can_view_tasks', can_view_tasks,
    'can_update_task_status', can_update_task_status,
    'can_create_tasks', can_create_tasks,
    'can_view_calendar', can_view_calendar,
    'can_view_linkedin', can_view_linkedin,
    'can_view_relationships', can_view_relationships,
    'can_view_vault', can_view_vault,
    'can_view_analytics', can_view_analytics,
    'is_active', is_active
  ) into permissions_json
  from public.team_members
  where user_id = user_uuid;
  
  return permissions_json;
end;
$$;
