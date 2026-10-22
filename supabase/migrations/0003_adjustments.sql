-- Step 12: each person's per-parcel adjustments (docs/plans/step-12-raise-the-grade.md §4). Applied through the Supabase
-- connector to the `parcelscreen` project only. Additive only: one new table, beside 0002's rather than widening its
-- `kind` check (altering a check is a drop and a re-create). RLS on and no policies, so the public key reads and writes
-- nothing and the Next.js routes, with the secret key on the server, are the only way in.

-- One adjustment, as a whole record: `key` is "<parcel>:<person>:<factor>".
create table public.sync_adjustments (
  space text not null references public.sync_spaces (space) on delete cascade,
  key text not null,
  record jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (space, key)
);
alter table public.sync_adjustments enable row level security;
create index sync_adjustments_changes on public.sync_adjustments (space, updated_at);

-- The save that reaches the database last wins, as for the rest (0001's function).
create trigger sync_adjustments_stamp before insert or update on public.sync_adjustments
  for each row execute function public.sync_stamp();
