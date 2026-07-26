-- Organizations tenancy: tables, personal-org backfill, NOT NULL, trigger, cleanup.

create table "organization" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "slug" text not null unique,
  "logo" text,
  "isPublic" boolean not null default false,
  "isPersonal" boolean not null default false,
  "createdById" uuid not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null
);

create table "org_membership" (
  "id" uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references "organization"("id") on delete cascade,
  "userId" uuid not null references "profiles"("id") on delete cascade,
  "role" "Role" not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  unique ("orgId", "userId")
);
create index "org_membership_userId_idx" on "org_membership"("userId");

create table "org_invite" (
  "id" uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references "organization"("id") on delete cascade,
  "token" text not null unique,
  "role" "Role" not null,
  "createdById" uuid not null,
  "expiresAt" timestamp(3) not null,
  "revokedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp
);

-- Nullable first; backfill; then tighten.
alter table "team" add column "organizationId" uuid;
alter table "player" add column "organizationId" uuid;
alter table "match" add column "organizationId" uuid;
alter table "competition" add column "organizationId" uuid;

-- Personal org per existing real profile (defensive skip of test accounts).
insert into "organization" ("id", "name", "slug", "isPersonal", "createdById", "updatedAt")
select gen_random_uuid(),
       coalesce(nullif(p."name", ''), split_part(p."email", '@', 1)) || '''s Club',
       lower(regexp_replace(split_part(p."email", '@', 1), '[^a-zA-Z0-9]+', '-', 'g'))
         || '-' || substr(md5(p."id"::text || clock_timestamp()::text), 1, 6),
       true, p."id", current_timestamp
from "profiles" p
where p."email" not like '%@bleachers.test'
  and not exists (select 1 from "org_membership" m where m."userId" = p."id");

insert into "org_membership" ("orgId", "userId", "role")
select o."id", o."createdById", 'OWNER'::"Role"
from "organization" o
where o."isPersonal"
  and not exists (select 1 from "org_membership" m where m."orgId" = o."id");

-- Stamp existing rows with their creator's personal org.
update "team" t set "organizationId" = o."id"
from "organization" o where o."createdById" = t."createdById" and o."isPersonal" and t."organizationId" is null;
update "player" p set "organizationId" = o."id"
from "organization" o where o."createdById" = p."createdById" and o."isPersonal" and p."organizationId" is null;
update "match" m set "organizationId" = o."id"
from "organization" o where o."createdById" = m."createdById" and o."isPersonal" and m."organizationId" is null;
update "competition" c set "organizationId" = o."id"
from "organization" o where o."createdById" = c."createdById" and o."isPersonal" and c."organizationId" is null;

alter table "team" alter column "organizationId" set not null;
alter table "player" alter column "organizationId" set not null;
alter table "match" alter column "organizationId" set not null;
alter table "competition" alter column "organizationId" set not null;

alter table "team" add constraint "team_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "player" add constraint "player_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "match" add constraint "match_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "competition" add constraint "competition_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");

create index "team_organizationId_idx" on "team"("organizationId");
create index "player_organizationId_idx" on "player"("organizationId");
create index "match_organizationId_idx" on "match"("organizationId");
create index "competition_organizationId_idx" on "competition"("organizationId");

drop table "permission_grant";
drop type "PermissionScope";

-- Signup now also provisions the personal org + OWNER membership.
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
    values (org_id, new.id, 'OWNER'::"Role");
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
