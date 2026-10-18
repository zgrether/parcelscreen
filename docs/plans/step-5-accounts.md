# Step 5: Accounts and sync

Moved up from step 13 on 2026-10-18 (Zach), before the household, which becomes step 6 and is built on it (`PLAN.md`'s
roadmap, `docs/design/workflow-review.md` "7. Household"). Written 2026-10-18 under mission mode (`CLAUDE.md`).
**Waiting for approval: no code until then.** The mission runs on `step/5-accounts`, branched from main once step 4b is
on main and this plan is approved. Before it starts, Zach does the setup in §13: the mission can't create the Supabase
project or change Vercel's settings itself.

**What this step changes:** today every person's data lives in one browser, as local profiles. After it, a person signs
in, belongs to a household, and the household's parcels, screens and photos live on a server. Any of their devices, and
the household's other members, see the same list.

Done when:
- **Sign in** with your email: one email with a link and a 6-digit code (§2). It works on a desktop, on a phone's
  browser and in the installed phone app.
- **A household:** the first sign-in starts one, or joins the one you were invited to. A member invites someone by
  email (§4), and everyone in the household sees and edits the household's list.
- **What syncs** (§3):
  - the household's parcels, with their recipe, notes, listing facts, status, order, lines and markers;
  - their screens, immutable and versioned;
  - each person's priorities, answers and settings.
- **The server is the source of truth,** and IndexedDB is a cache that makes the app open fast. There's no offline
  editing (§5).
- **Accounts start empty.** The existing Import file (Settings → Your data, step 4b) brings parcels in.
- **Photos and PDFs** on a parcel, in Supabase Storage (§6).
- **Vercel's preview protection is back on,** with a bypass token, so CI's deployed check still reaches the previews
  (§8).
- Every table has row-level security from the first migration, tested: a member of one household can't read or write
  another household's rows (§7).

## 0. What's there today (found while planning)

- **Local profiles** (step 1; `lib/client/profileStore.ts`, `profileKv.ts`, `profiles.ts`, `components/Profile/`):
  - `ProfileGate` boots the current profile before anything renders.
  - Its documents are the prefs in `PROFILE_KEYS`, read synchronously from memory and written through to IndexedDB
    (`parcelscreen`, stores `profiles`, `docs`, `screens`):
    - `ps.parcels`: the whole parcel store, `{ v: 2, open, built[] }`, one document;
    - `ps.cfg`, `ps.rubrics` (`{ mine, others }`), `ps.rubricView`, `ps.interview`;
    - `ps.compare`, `ps.library`, `ps.recentMarks`, `ps.namesFromNotes`.
  - The picker switches, adds, renames and deletes profiles, and each switch reloads the page.
- **The prefs module is the seam.** Every page reads and writes those documents through `getPref` / `setPref`
  (`lib/client/prefs.ts`), so the sync can go under it with little change above it (§3.3).
- **Screens** (`lib/client/screenStore.ts`) are records in IndexedDB, about 200 KB of JSON each (the fixtures'
  `expected.json` run 165–257 KB). Each is stamped with its profile, and each parcel lists its own in `screenIds`.
- **The export file** is version 6 (`docs/REQUIREMENTS.md` §3a). It holds the parcels, their screens, the settings, the
  profile's name and its rubrics (`mine`, `others`).
- **No Supabase code yet:** no `supabase/` folder, no `lib/db/`, no `@supabase/*` dependency.
- **The Supabase account** has one project, `repcoach` (Zach's other product), in us-east-1. The free plan allows two
  active projects, so `parcelscreen` fits, and a second one for previews wouldn't (§11 Q11).
- **Vercel:** the project is on Pro. Preview protection was turned off when the repo went public. The
  `deployed-check` workflow fetches each deployment's URL with no credentials.
- **The data model** in `docs/REQUIREMENTS.md` §3 is this step's starting point, cut to what the app holds today (§3.1).

## 1. People and households

- **A person** is an account (Supabase Auth, by email), with a name. They have their own priorities, answers and
  settings. This replaces the local profile: the profile picker and "Add a profile" go, and the ☰ menu's top shows the
  person instead (§9).
- **A household** is the people who share a list. Each person belongs to exactly one (§11 Q4). The first sign-in starts
  one, named after the person ("Zach's household"), unless an invitation is waiting (§4).
- **Shared in the household:** the parcels, everything on them (notes, status, order, lines, markers, photos), and
  their screens. Any member can add, edit, archive or remove them.
- **Each person's own:** priorities (the rubric), answers (the interview), settings, which rubric the grade switch shows,
  and the views kept on a device (the map's position, its layers, the list's sort, Compare's columns).
- **Grades are each person's.** A parcel's grade is computed from the measurements and the viewer's own rubric, as
  today. Members see each other's priorities, which step 6 needs to predict "How would Julie rate this?"; they can't
  change them.
- **Roles:** the person who started the household can remove members; otherwise everyone is equal (§11 Q5).

## 2. Signing in

- **The email:** one message holding a sign-in link and a 6-digit code (Supabase's email OTP; its template carries both,
  §11 Q2).
  - **The link** signs you in on the device that opens it, and lands on the page you were going to.
  - **The code** is for the installed iPhone app. A link from an email opens in Safari, not in the home-screen app,
    whose storage is separate, so you type the code into the app instead. It also works when you read the email on
    another device.
- **The sign-in page** (`/signin`):
  1. An email field and "Email me a sign-in link".
  2. Then "Check your email. Tap the link, or type the 6-digit code here," with a code field and "Send it again".
- **Who can sign in:** only people who were invited (§11 Q1). Sign-ups are closed in Supabase. The first account,
  Zach's, is invited from Supabase's dashboard (§13), and everyone after is invited from the app (§4).
- **The session** is kept in cookies by `@supabase/ssr`, refreshed by Next's middleware, and lasts until you sign out.
- **Signing out** (☰ → Sign out) clears this browser's cache of the household's data (§11 Q9).
- **A signed-out visitor** sees a welcome page (§11 Q14) with the app's name, one line on what it does ("Screen rural
  mountain land from your desk: where to build, what it costs, how dark the sky is"), "Sign in", and "Parcel Screen is
  by invitation for now." Every other page sends them there, and back after they sign in. The share pages of a later
  step are the exception.

### 2.1 The first sign-in

1. **Sign in** with the link or the code.
2. **An invitation waiting** for this email: "Zach invited you to his household." with **Join**. Without one, a household
   is started for you.
3. **Your name:** the interview's name screen, "What should we call you?" (today's "What should we call this
   profile?"). It's prefilled from the invitation when Zach typed one.
4. **The questions:** step 4's interview, with "Not now", as a new profile gets today.
5. **Your list**, empty, says: "Nothing here yet. Find a parcel on the map, or bring in parcels from an export file:
   Settings → Your data → Import file."

Invited into a household that already has parcels, step 5 shows them on Your list.

### 2.2 The switch from local profiles (the clean break)

- **On the first load of this release,** the local profiles, their documents and their screens are deleted from this
  browser. Once, the welcome page or Your list says "Saved with an older version; screen it again." (CLAUDE.md, clean
  breaks; `lib/client/oldData.ts`).
- **No adopting a local profile,** and no converter (owner, 10/17). The parcels come over by **Import file**, from a file
  exported before the switch. The test plan starts with that export on production (§14, step 0).
- **The export file stays version 6.** Its `profile` and `rubrics.others` are ignored on import. Its `rubrics.mine`
  replaces the person's own only through the summary's existing tick. An export from an account writes the person's
  name as `profile.name`, and `others: []`.

## 3. What syncs, and how

### 3.1 The tables (one migration, `supabase/migrations/0001_accounts.sql`)

Each table has RLS enabled in the statement after its `create`, with its policies (§7).

| Table | Columns (beyond `id`, timestamps) | Who reads / writes |
| --- | --- | --- |
| `households` | `name`, `created_by` | members read; created only by `start_household()` |
| `people` | `user_id` (primary key, = `auth.users.id`), `household_id`, `role` (`owner` \| `member`), `name`, `settings` jsonb, `rubric` jsonb, `rubric_view` text, `interview` jsonb | household members read; only the person writes their own row; the owner deletes another member's (Remove) |
| `invitations` | `household_id`, `email` (citext), `name`, `invited_by`, `accepted_at`, `revoked_at` | members read and add; the invitee reads their own by email, and accepts through `join_household()` |
| `parcels` | `id` uuid (the local `key`), `household_id`, `created_by`, `updated_by`; `recipe` jsonb (`pieces`, `split`, `house`, `hidden`, `excluded`); `name`, `notes`, `notes_at`, `asking_price`, `asking_price_at`, `listing_url`, `listing_acres`, `agent`, `status`, `archived` jsonb, `milestones` jsonb, `rank`, `driveway_line`, `markup` jsonb; derived: `acres`, `dedupe_key`, `state`, `county`, `parcel_number` | members read, add, edit, remove |
| `screens` | `id` uuid, `parcel_id` (cascade), `household_id`, `version` int (set by a trigger: max + 1 per parcel), `schema_version`, `engine`, `keys` jsonb, `result` jsonb, `created_by` | members read, add and delete; **no update**: no policy for it, and a trigger refuses one (CLAUDE.md: screens are immutable) |
| `attachments` | `parcel_id` (cascade), `household_id`, `kind` (`image` \| `pdf`), `title`, `path`, `thumb_path`, `bytes`, `content_type`, `added_by` | members read, add, remove |

- **Each parcel is one row,** not one document per household: two people editing different parcels never meet. Lines
  and markers stay as `markup`, the jsonb list they are today, with the same shape (§11 Q6 covers two people on one
  parcel).
- **The derived columns** (`acres`, `dedupe_key`, …) are computed from the recipe in the same write, as REQUIREMENTS §3
  says (`deriveParcel`, `recipeDedupeKey`). They're for later steps' queries. **No PostGIS yet:** no step before the
  catalog queries geometry, so there's no `geometry` column until one does.
- **Not in this migration:** step 6's requests (Send to confirm), and REQUIREMENTS' price events, comments, share links,
  rules, sources and listings. Each comes with the step that uses it.
- **Two functions** (security definer, each a few lines, tested): `start_household(name)` makes the household and the
  person's row in one transaction, and `join_household(invitation)` makes the person a member of the invitation's
  household. Nothing else needs to bypass RLS from the browser.
- **Size:** a screen is about 200 KB of JSON, which Postgres compresses. The free plan's 500 MB holds a few thousand,
  which is far more than a household runs. Photos are in Storage (§6), not the database.

### 3.2 Where each local document goes

| Today (a profile document) | After |
| --- | --- |
| `ps.parcels` `built[]` | `parcels` rows, one per parcel; `screenIds` becomes that parcel's `screens`, in `version` order |
| `ps.parcels` `open` | stays on the device (which parcel is open on this device's map) |
| `ps.cfg`, `ps.rubrics.mine`, `ps.rubricView`, `ps.interview` | the person's `people` row |
| `ps.rubrics.others` | gone: each member's rubric is in their own row (step 6 reads it) |
| `ps.compare`, `ps.library`, `ps.recentMarks`, the map's views | localStorage on the device, as today's device keys |
| kept screens | `screens` rows; IndexedDB keeps a copy of each one opened (they never change) |

### 3.3 The sync layer (`lib/sync/`)

- **Under the prefs seam.** The app keeps reading synchronously from memory, as it does now. Writes go to the server.
  The local profile store gives way to an account store with the same reads.
- **Parcels:** when `ps.parcels` is written, the layer compares it with what it last saved and sends only the change:
  - a new parcel is inserted;
  - a removed one is deleted;
  - an edited one is updated in the fields that changed (§11 Q6).
  
  It's a pure function of (before, after) → writes, tested in Node.
- **Screens:** a finished run is inserted, and its `version` comes back from the trigger. A screen is fetched when its
  parcel is opened, then kept in IndexedDB for good.
- **The person's own row:** written when their priorities, answers or settings change.
- **Other members' changes** are fetched (§11 Q7):
  - when the app opens, when it comes back to the front, and on each tab switch;
  - as the parcels changed since the last fetch, plus the household's list of parcel ids, so a removal is noticed;
  - and merged into the store in memory, so the page shows them without a reload.
- **The cache:** IndexedDB holds the last fetched parcels, the person's row and every screen opened, under the account.
  On open, the app shows the cache at once, then the fetch updates it.
- **The service worker** never answers Supabase or `/auth/*` requests from its cache.

## 4. Inviting someone

- **Where:** ☰ → your household → **Invite someone**: their email, and their name ("Julie"), optional.
- **What happens:** a server route (`app/api/invite`, using the service role key on the server only):
  - adds an `invitations` row;
  - if the email has no account, sends Supabase's invite email, which makes the account and signs them in;
  - if it has one, the invitation waits for their next sign-in.
- **On their first sign-in,** they join with **Join** (§2.1). An invitee who already has a household with parcels in it
  isn't moved: the invitation says "Julie already has her own list" to the person who sent it, and nothing changes
  (§11 Q4).
- **The household's panel** lists each member (name and email), each pending invitation with **Cancel**, and **Invite
  someone**.
  - The person who started the household can **Remove** a member (asked once: "Remove Julie? She'll start her own
    list the next time she signs in.").
  - Every member can **Leave**, unless they're the last one.

## 5. Online, offline, and saving

- **No offline editing.** Offline, the app opens from its cache and every page can be read. Two things change:
  - a strip at the top says "You're offline. You can look around; changes wait until you're back online," and the
    actions that save (Screen it, the parcel tools, the editor, Your list's edits) are disabled with that reason in
    their tooltip;
  - the map's tiles and the screens already opened still show; anything else says it needs the network.
- **A save that fails while online** (the server's error, a timeout) is retried twice. Then a toast says "Couldn't save
  your change to Ferney Creek." with **Try again**, and the change stays on screen until it's saved or the page is left.
- **One exception, a screen run:** a finished screen that couldn't be inserted stays in IndexedDB marked "not saved
  yet", and is inserted on the next start. A run takes minutes and can't be redone for free; a screen never changes,
  so this can't conflict (§11 Q8).
- **Otherwise, nothing about syncing shows.** There's no spinner or "Saved" line on every edit.

## 6. Photos and PDFs

- **Where:** a parcel's detail on Your list gains a section, **Photos and files**:
  - a grid of thumbnails, newest first, each with its title (the file name, editable);
  - **Add photos or files** (on a phone, the camera or the photo library; anywhere, a PDF);
  - tap a photo to see it full screen, or a PDF to open it in a new tab.
- **Storage:** a private bucket, `attachments`, with paths `{household}/{parcel}/{id}.{ext}`. Storage's own RLS policies
  let a member read and write only under their household's folder. The app shows files by short-lived signed URLs.
- **Limits** (§11 Q10):
  - a photo larger than 2560 px on its long side is scaled down on the device before it's uploaded;
  - a 400 px thumbnail is made on the device too (Supabase's image transforms are a paid feature);
  - a PDF can be up to 20 MB;
  - the free plan's 1 GB of storage holds a few hundred photos per household.
- **Removing** a photo or file asks once. Removing a parcel removes its files.
- **Not in this step:** attachments on the map's parcel sheet, links and notes as attachments, comments.

## 7. Security

- **RLS on every table, in the migration that creates it** (CLAUDE.md's hard rule). The pattern: a row is visible and
  writable if its `household_id` is the caller's (`people.household_id` for `auth.uid()`), except where §3.1's table says
  otherwise.
- **Storage policies** on `storage.objects` for the `attachments` bucket, by the path's first segment.
- **Tested in SQL** (pgTAP, `supabase/tests/`), run by `supabase test db` in CI against a local Supabase. Two households
  with a member each:
  - each sees only its own rows, in every table;
  - neither can insert into the other's, or move a row into it;
  - a screen can't be updated;
  - a member can't edit another member's `people` row;
  - only the owner can remove a member;
  - an invitee can read only their own invitation.
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` is read only in `app/api/invite` and the auth callback, which run on the
  server, and is never `NEXT_PUBLIC_`. The browser uses the anon key with the person's session.
- **Supabase's security advisors** (the connector's `get_advisors`) are checked after the migration, and their findings
  are fixed or listed in the hand-back.

## 8. Previews, CI and deployment

- **Vercel preview protection** goes back on (Vercel Authentication on previews; Zach turns it on, §13). Its
  **Protection Bypass for Automation** secret goes into GitHub as `VERCEL_AUTOMATION_BYPASS_SECRET`. The
  `deployed-check` workflow sends it as the `x-vercel-protection-bypass` header, read from the environment, never
  written into the script.
- **Previews share the production Supabase project** (§11 Q11). Every migration is additive, so a preview and
  production can run on the same schema. Zach applies each migration before the PR that needs it merges (§11 Q12).
- **CI runs a local Supabase** (`supabase start` in GitHub Actions, Docker), applies the migrations, runs the pgTAP
  tests, and runs the e2e against it. The e2e never touches the real project.
  - **e2e sign-in:** a helper makes a fresh user and household through the local stack's admin API, and signs in with an
    OTP it generates. Each test gets its own household, so tests stay independent as they are today.
  - **Every existing e2e** starts signed in that way, in place of today's fresh local profile.
- **Supabase's redirect URLs:** production, `http://localhost:3000`, and the preview pattern
  (`https://parcelscreen-git-*-zgrether-1030s-projects.vercel.app/**`).
- **Skew Protection** (Vercel; noted 10/07 for this moment): on, so an old open tab keeps talking to the deployment it
  came from (§11 Q13).

## 9. UX

- **The main flows, in the fewest steps:**
  - sign in: your email, then a tap on the link or six digits;
  - the first sign-in: Join (if invited), your name, the questions or Not now, then Your list;
  - invite someone: ☰ → Invite someone → their email → Send;
  - add a photo: a parcel on Your list → Add photos or files → pick.
- **What you see first:** signed in, the same pages as today. Nothing about accounts shows until you need it.
- **The ☰ menu** (step 4b's three items) changes at the top: the profile picker becomes **you** (name and email), then
  your household (its members, Invite someone), then Help, Settings and **Sign out**.
- **States:**
  - **loading:** the cache shows at once; with nothing cached (a first sign-in on a device), each page shows its
    heading and a quiet "Loading…".
  - **empty:** Your list's line in §2.1.
  - **error:** a sign-in link that's expired or already used says so ("This link has expired. Send a new one.") with the
    email field filled in. A wrong code says "That code didn't work. Check it, or send a new one."
  - **slow:** a fetch past 3 s keeps the cached page and adds nothing; a save past 10 s counts as failed (§5).
- **Plain labels:** Sign in, Sign out, Email me a sign-in link, Send it again, Join, Invite someone, Cancel, Remove,
  Leave, Photos and files, Add photos or files. "Household" is the one new noun. "Profile" leaves the UI.
- **Phone at 375 px:**
  - the sign-in page is one column;
  - the code field uses `inputmode="numeric"` and `autocomplete="one-time-code"`, so iOS offers the code from Mail;
  - every button and member row is at least 44 px;
  - the photo grid is three across.
- **Contrast and consistency:** the welcome and sign-in pages use the app's paper and ink and its existing buttons. The
  offline strip reuses the PWA's offline banner (`.pwa-offline`). The household panel is styled like the ☰ menu
  sections.

## 10. Numbers and text that may change (the declaration)

- **No numbers:** no `config.ts`, expected.json, engine or `ScreenResult` change. Schema v9 stays frozen: the result is
  stored as it is.
- **No report, verdict or card text changes.**
- **UI text:** new:
  - the welcome page, the sign-in page and its errors;
  - the invitation line and Join;
  - the name screen's "What should we call you?" (replacing "this profile");
  - the household panel and its confirmations;
  - the offline strip and the failed-save toast;
  - Photos and files;
  - Sign out.

  Gone: the profile picker, "Add a profile", and every "profile" in the UI.
- **Storage:** the local profiles, documents and screens are dropped (§2.2), and IndexedDB becomes the account's cache
  in a new layout. The export file's format doesn't change (still version 6).

## 11. Questions for Zach

1. **Who can sign in:** only people invited (recommended; sign-ups closed, your account invited from Supabase's
   dashboard), or anyone with the link?
2. **The email:** the link plus a 6-digit code in one message (recommended: the code is how the installed iPhone app
   signs in), or the link only?
3. **Sending email:** Supabase's built-in sender only reaches the project's own team, and a few messages an hour, so
   Julie wouldn't get hers. A custom SMTP sender is needed. **Resend** (recommended: free for 3,000 emails a month,
   set up in Supabase's Auth settings, no code), or another you already use?
4. **One household per person** (recommended), joined at the first sign-in, with an invitee who already has parcels
   left where they are? Or several households per person, with a switcher?
5. **Roles:** everyone edits everything shared, and only the person who started the household removes members
   (recommended)? Or everyone equal, including removing?
6. **Two people editing one parcel:** each save changes only the fields it touched, and the later save wins a field
   both changed (recommended: it's rare in a household, and nothing else is lost). Or a whole-parcel check that refuses
   the later save with "Julie changed this parcel; make your change again"?
7. **Seeing each other's changes:** when the app opens, comes back to the front, or switches tabs (recommended for
   now), or live as they happen (Supabase Realtime), now?
8. **Offline:** read-only with the strip, the saving actions disabled, and the one exception of a finished screen kept
   until it can be saved (recommended)? Or no exception?
9. **Signing out** clears this browser's copy of the household's data (recommended, for a shared computer)?
10. **Attachments:** photos scaled to 2560 px on the device, PDFs up to 20 MB, any member can remove a file, on Your
    list's parcel detail only (recommended)? Change any of those?
11. **Previews use the production project** (recommended: the free plan allows two projects and repcoach is one; the
    test plan's data is yours anyway)? Or a paid second project for previews?
12. **Migrations:** you apply each with the Supabase CLI (Day 0's rule), or Claude Code applies them through the
    Supabase connector, to the `parcelscreen` project only, before each PR that needs one (recommended: the mission
    doesn't wait on you between PRs)?
13. **Skew Protection** on with this step (recommended, as noted 10/07)?
14. **A signed-out visitor** sees the welcome page only (recommended)? Or the map too, to try a parcel without saving?

## 12. Stop conditions (push what's there, say why, wait)

- A change would alter expected.json, a grade, a verdict or report text.
- A table can't be given RLS that the pgTAP tests pass, or a Supabase security advisor finding can't be fixed in scope.
- A setup step in §13 isn't done when a PR needs it (the project, the SMTP sender, the bypass secret).
- The same CI failure survives three attempts; the local Supabase in CI is new, so its first failures count.
- The plan turns out wrong (for example, the prefs seam can't carry the sync without the pages changing how they read).

## 13. Zach's setup, before the mission (about 30 minutes)

1. **Supabase:** a new project `parcelscreen` (free, us-east-1), separate from repcoach. Save its database password.
2. **Auth → Providers → Email:** on, with "Confirm email". **Auth → Sign In / Up:** "Allow new users to sign up" off
   (Q1).
3. **Auth → SMTP:** the sender from Q3 (Resend: an account, a verified sending domain or address, its SMTP details).
4. **Auth → Email templates:** the mission writes the "Magic link" and "Invite" templates (the link and the code, Q2)
   into `supabase/templates/`; you paste them in, or they're set with the project's config if Q12 goes to Claude Code.
5. **Auth → URL configuration:** the site URL (production) and the redirect URLs in §8.
6. **Auth → Users → Invite user:** your own email.
7. **Vercel → Environment variables** (Production and Preview): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only). `.env.local` gets the same.
8. **Vercel → Deployment Protection:** Vercel Authentication on previews; Protection Bypass for Automation, its secret
   saved to GitHub as `VERCEL_AUTOMATION_BYPASS_SECRET`. Skew Protection on (Q13).
9. **Before the step merges** (the test plan's step 0): Export file on production, to bring your parcels back after the
   switch.

## 14. The PRs, into `step/5-accounts`

| PR | What | Checks |
| --- | --- | --- |
| 1 | **The database:** `supabase/` (config, `0001_accounts.sql` with every table, RLS, the two functions, the screen trigger, the storage bucket and its policies), the pgTAP tests, CI's local Supabase job, `lib/db/` (browser, server and service clients; a Zod schema for the env), `@supabase/supabase-js` and `@supabase/ssr` (the stack in CLAUDE.md). Preview protection's bypass header in `deployed-check`. No UI. | `supabase test db` (§7's cases); the advisors; typecheck, lint |
| 2 | **Signing in:** the middleware, `/signin`, `/auth/callback`, the welcome page, the account gate in place of `ProfileGate`, the first sign-in (§2.1), the clean break (§2.2), Sign out; the profile picker and its pages go; the e2e sign-in helper, with every existing e2e signed in. | e2e: sign in by code and by link; the first sign-in to Your list; signed out → welcome → back; the old local data dropped with its line once |
| 3 | **Sync:** the account store under the prefs seam; parcels by row (the pure diff), the person's row, screens with the cache; fetching others' changes; offline read-only and the failed-save toast. | unit: the diff, the merge; e2e: two browsers in one household (one adds and edits, the other sees it after a tab switch); a reload shows the cache first; offline disables saving; a failed insert's toast; an imported file's parcels on the server |
| 4 | **The household:** `app/api/invite`, invitations, Join, the household panel (members, pending, Invite, Cancel, Remove, Leave). | e2e: invite → the invitee's first sign-in joins → both see the list; Remove; an invitee with a list isn't moved |
| 5 | **Photos and files:** the section on a parcel's detail, uploads with the device-side scaling and thumbnails, viewing, removing. | e2e: add a photo and a PDF, see them from the other member, remove; storage RLS in pgTAP (PR 1) |
| 6 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** each new or changed screen at 1280 and 375; REQUIREMENTS §3 brought up to what was built; `phase-0.md` §9. | Full CI on the step branch's head |

## 15. Test plan outline

**CI:** the pgTAP RLS tests; e2e for each PR's checks above, against a local Supabase.

**Screenshots (the hand-back), each at 1280 and 375:**
- the welcome page;
- sign-in (the email step, the code step, an expired link);
- the first sign-in's Join and name screens;
- the empty Your list;
- the ☰ menu with the person and the household;
- the household panel with a pending invitation;
- the offline strip;
- the failed-save toast;
- Photos and files on a parcel's detail.

**Fresh-eyes review (CLAUDE.md):** the screenshots only, with "You've never used this app. What is this page for, and
what's confusing?"

**Manual, on the preview (about 30 minutes, desktop then phone), using the fixture parcels by name:**
0. On production, before the merge: ☰ → Settings → Your data → Export file.
1. Open the preview signed out → the welcome page; Sign in with your email → the email has a link and a code; tap the
   link → signed in, the first sign-in's name screen, then the questions (Not now) → an empty Your list.
2. Settings → Your data → Import the step 0 file → your parcels on Your list; open **Ferney Creek** on the map → its
   report shows from its imported screen.
3. Invite a second address of yours as "Julie" → sign in with it in a private window → "Zach invited you…" → Join →
   her own questions → she sees Ferney Creek and the rest.
4. As Julie, rename **Macks Mountain** and add a line; in Zach's window, switch tabs → the new name and the line appear.
5. As Zach, screen **Mud Creek**; as Julie, open it → the same result, with no run.
6. On a phone, the installed app: sign in by typing the code from the email → your list.
7. On the phone, a parcel → Photos and files → take a photo → it shows; on the desktop → the same photo; add a PDF there →
   it opens; remove it.
8. Phone offline (airplane mode) → the strip; the list and an opened report still read; Screen it and the editor are
   disabled.
9. Sign out → the welcome page; sign in again → your list loads.
10. As Zach, Remove Julie → in her window, the next sign-in starts her own empty list.

## 16. What step 6 (the household) takes from this step

- Each member's rubric, from their `people` row: "How would Julie rate this?" predicts from it, dated by its
  `updated_at`, with no import by code or file.
- "Send to Julie to confirm" becomes an in-app request: step 6 adds a `requests` table (with its RLS), Julie sees the
  request the next time she opens the app, and answers with her own verdict and a comment.
- `docs/design/workflow-review.md` "7. Household" and `PLAN.md`'s step 6 row say this now (reworked 10/18).

## 17. Decisions to record in `phase-0.md` §9 (in the PRs)

- **§9.56 Accounts and sync:**
  - Supabase Auth by emailed link and code, sign-ups closed, invitations by email;
  - one household per person, the owner removes members;
  - parcels by row and per-field saves; screens immutable with a trigger's version;
  - the server the source of truth and IndexedDB a cache, read-only offline, with the one exception of a finished
    screen;
  - local profiles dropped (the clean break), the export file unchanged at version 6;
  - preview protection with the bypass header; previews on the production project; CI on a local Supabase.
