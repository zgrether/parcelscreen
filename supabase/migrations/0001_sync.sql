-- Step 5: sync across devices (docs/plans/step-5-sync.md §4). Applied through the Supabase connector to the
-- `parcelscreen` project only. Additive only: a later migration may create or add, never drop, rename, retype or delete.
--
-- Rows are keyed by `space`, the SHA-256 of a synced space's code (lib/sync/code.ts), never the code. Row-level
-- security is on with no policies, so the public key reads and writes nothing; the Next.js routes, with the secret
-- key on the server, are the only way in (lib/server/syncRoutes.ts).

create table public.sync_spaces (
  space text primary key check (space ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.sync_spaces enable row level security;

-- A profile: its name and created time, its settings, priorities and interview answers, as one JSON record.
create table public.sync_profiles (
  space text not null references public.sync_spaces (space) on delete cascade,
  id text not null,
  record jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (space, id)
);
alter table public.sync_profiles enable row level security;
create index sync_profiles_changes on public.sync_profiles (space, updated_at);

-- One built parcel, as the device's parcel store holds it (its recipe, notes, listing facts, status, lines, markers).
create table public.sync_parcels (
  space text not null references public.sync_spaces (space) on delete cascade,
  key text not null,
  profile text not null,
  record jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (space, key)
);
alter table public.sync_parcels enable row level security;
create index sync_parcels_changes on public.sync_parcels (space, updated_at);
create index sync_parcels_profile on public.sync_parcels (space, profile);

-- A kept screen: inserted once, never updated (CLAUDE.md: screens are immutable).
create table public.sync_screens (
  space text not null references public.sync_spaces (space) on delete cascade,
  id text not null,
  profile text not null,
  schema_version integer not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  primary key (space, id)
);
alter table public.sync_screens enable row level security;
create index sync_screens_changes on public.sync_screens (space, schema_version, created_at);
create index sync_screens_profile on public.sync_screens (space, profile);

-- The save that reaches the database last wins: each insert or update of a profile or parcel takes the database's time.
create function public.sync_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger sync_profiles_stamp before insert or update on public.sync_profiles
  for each row execute function public.sync_stamp();
create trigger sync_parcels_stamp before insert or update on public.sync_parcels
  for each row execute function public.sync_stamp();

create function public.sync_screens_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'a kept screen is never updated';
end
$$;
create trigger sync_screens_no_update before update on public.sync_screens
  for each row execute function public.sync_screens_immutable();
