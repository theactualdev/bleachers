-- Waitlist signups.
--
-- Run this once in Supabase → SQL Editor.
--
-- RLS is enabled with *no policies at all*, which is deliberate: it means the
-- anon and authenticated roles can neither read nor write this table through
-- PostgREST. The only thing that touches it is the `waitlist-signup` edge
-- function, which uses the service-role key and bypasses RLS.
--
-- That matters because a waitlist is a list of email addresses. If the browser
-- could insert directly it would also need a policy, and any policy loose
-- enough to allow anonymous inserts is easy to get subtly wrong in a way that
-- lets people read the list back out.

create table if not exists public.waitlist_signup (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: Alex@x.com and alex@x.com are one person.
create unique index if not exists waitlist_signup_email_key
  on public.waitlist_signup (lower(email));

alter table public.waitlist_signup enable row level security;

revoke all on public.waitlist_signup from anon, authenticated;

-- Handy for checking numbers without leaving the SQL editor:
--   select count(*) from public.waitlist_signup;
--   select email, created_at from public.waitlist_signup order by created_at desc;
