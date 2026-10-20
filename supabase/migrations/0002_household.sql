-- Step 6: the household's asks and takes (docs/plans/step-6-household.md §4). Applied through the Supabase connector to
-- the `parcelscreen` project only. Additive only: one new table, like 0001's, with RLS on and no policies, so the
-- public key reads and writes nothing and the Next.js routes, with the secret key on the server, are the only way in.

-- One ask or one take, as a whole record: `key` is "<parcel>:<person>", `kind` says which.
create table public.sync_household (
  space text not null references public.sync_spaces (space) on delete cascade,
  key text not null,
  kind text not null check (kind in ('ask', 'take')),
  record jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (space, kind, key)
);
alter table public.sync_household enable row level security;
create index sync_household_changes on public.sync_household (space, updated_at);

-- The save that reaches the database last wins, as for profiles and parcels (0001's function).
create trigger sync_household_stamp before insert or update on public.sync_household
  for each row execute function public.sync_stamp();
