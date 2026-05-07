-- ET Option: Supabase User Profile Configuration
-- Run this in your Supabase SQL Editor

-- 1. Create a table for profiles that extends auth.users
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  phone text,
  updated_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. Create security policies
create policy "Profiles are viewable by owners" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- 4. Create a trigger function to automatically create a profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id, new.email, new.raw_user_meta_data->>'phone_number');
  return new;
end;
$$ language plpgsql security definer;

-- 5. Attach the trigger to auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
