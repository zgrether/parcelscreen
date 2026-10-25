-- UX part 2 PR 5b: one-use invites to a synced space (Invite someone, the audit's P-8). Applied through the Supabase
-- connector to the `parcelscreen` project only. Additive only: one new table. RLS on and no policies, so the public key
-- reads and writes nothing and the Next.js routes, with the secret key on the server, are the only way in.

-- An invite, keyed by its token's SHA-256: the token itself travels only in the link's fragment. `sealed` is the space's
-- code sealed with a key made from the token (AES-GCM, lib/sync/invite.ts): what's stored here opens nothing alone.
create table public.sync_invites (
  token text primary key,
  space text not null references public.sync_spaces (space) on delete cascade,
  sealed text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.sync_invites enable row level security;
