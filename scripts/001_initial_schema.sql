-- initial schema for Founder Control Center

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  linkedin_token text, -- Store encrypted or handled via backend
  updated_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  bucket text not null default 'Today', -- Today, This Week, Delegated, Backlog
  is_completed boolean default false,
  priority text default 'Medium',
  due_date timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.tasks enable row level security;
create policy "Users can manage own tasks" on public.tasks for all using (auth.uid() = user_id);

-- CALENDAR EVENTS
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  type text default 'Meeting',
  created_at timestamp with time zone default now()
);

alter table public.events enable row level security;
create policy "Users can manage own events" on public.events for all using (auth.uid() = user_id);

-- LINKEDIN POSTS
create table if not exists public.linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  status text default 'Draft', -- Draft, Scheduled, Published
  scheduled_for timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.linkedin_posts enable row level security;
create policy "Users can manage own linkedin posts" on public.linkedin_posts for all using (auth.uid() = user_id);

-- RELATIONSHIPS (CRM)
create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  company text,
  status text default 'New', -- New, Conversation, Proposal, Closed
  last_contact timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.relationships enable row level security;
create policy "Users can manage own relationships" on public.relationships for all using (auth.uid() = user_id);

-- VAULT (NOTES)
create table if not exists public.vault_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text,
  tags text[],
  is_decision boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.vault_notes enable row level security;
create policy "Users can manage own notes" on public.vault_notes for all using (auth.uid() = user_id);

-- TRIGGER FOR NEW USER
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
