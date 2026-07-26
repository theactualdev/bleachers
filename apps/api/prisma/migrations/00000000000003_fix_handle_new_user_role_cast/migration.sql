-- Fix: handle_new_user() runs with `security definer set search_path = ''`, so the
-- unqualified enum cast `'OWNER'::"Role"` fails to resolve ("type Role does not exist"),
-- which made every new-user signup fail (Supabase admin API returns
-- "Database error creating new user", 500). Qualify the enum type with its schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  org_id uuid;
  display text;
begin
  insert into public.profiles (id, email, name, image, "createdAt", "updatedAt")
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url',
    now(), now()
  )
  on conflict (id) do nothing;

  if not exists (select 1 from public.org_membership m where m."userId" = new.id) then
    display := coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
    insert into public.organization ("name", "slug", "isPersonal", "createdById", "updatedAt")
    values (
      display || '''s Club',
      lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(md5(new.id::text || clock_timestamp()::text), 1, 6),
      true, new.id, now()
    )
    returning id into org_id;
    insert into public.org_membership ("orgId", "userId", "role")
    values (org_id, new.id, 'OWNER'::public."Role");
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
