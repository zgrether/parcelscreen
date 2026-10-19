# Step 5: Sync across devices

Rewritten 2026-10-19 (Zach), replacing the accounts plan that was drafted on 10/18 and never approved. Written under
mission mode (`CLAUDE.md`). **Waiting for approval: no code until then.** The mission runs on `step/5-sync`, branched
from main once step 4b is on main, this plan is approved, and Zach has done the setup in §13.

**The problem:** Zach uses the app on his Android phone and in a desktop browser, and the two hold different data. This
step makes them match. Later, Julie joins the same data to weigh in on parcels (step 6). This step doesn't block that,
and doesn't build it. It's a personal tool, not a product launch, so the step is as small as it can be while still being
correct.

Done when:
- **Settings → Your data → Sync across devices** turns this device's data into a **synced space**: all its profiles,
  parcels, screens, settings, priorities and interview answers. The app shows the space's code as a QR code and as text.
- **Another device joins** by scanning the QR or pasting the code. Its own data is replaced by the space's, with Export
  offered first. It then stays joined.
- **On joined devices:**
  - the server holds the truth;
  - each device fetches when the app opens, comes back to the front, or switches tabs;
  - each change is saved shortly after it's made;
  - a save that fails says "Not saved", with Try again.
- **Unjoined devices** work exactly as today, local only.
- **No accounts:** no sign-in, Supabase Auth, email or households. One small set of Next.js API routes is the only path
  to the database.
- The production project stays awake on Supabase's free plan, and CI never touches it.

## 0. What's there today (found while planning)

- **Local profiles** (step 1; `lib/client/profileStore.ts`, `profileKv.ts`, `profiles.ts`):
  - IndexedDB `parcelscreen` holds `profiles`, each profile's `docs`, and `screens`.
  - Pages read a profile's documents synchronously from memory through `getPref` / `setPref` (`lib/client/prefs.ts`),
    and the writes go through to IndexedDB. That seam is where the sync goes.
  - The documents (`PROFILE_KEYS`):
    - `ps.parcels`: the whole parcel store, `{ v: 2, open, built[] }`;
    - `ps.cfg`, `ps.rubrics`, `ps.rubricView`, `ps.interview`;
    - `ps.compare`, `ps.library`, `ps.recentMarks`, `ps.namesFromNotes`.
- **Screens** (`lib/client/screenStore.ts`) are IndexedDB records stamped with their profile, about 200 KB of JSON each
  (the fixtures' `expected.json` files run 165–257 KB). A kept screen is never changed.
- **Step 4b** (on main before this step starts):
  - `ps.parcels` writes are announced, and the map, which stays mounted behind the tabs, adopts a store written by
    another page. A store written by the sync arrives the same way.
  - Settings is a dialog on every page. Its last section is **Your data** (Export file, Import file).
- **Supabase:** the organization `zach-personal` is on the **free plan** (checked 10/18 with the connector). It has one
  project, `repcoach`. The free plan allows two active projects per organization, and pauses a project after 7 days
  without activity. It has no restorable backups.
- **No Supabase code yet:** no `supabase/` folder, no `lib/db/`, no `@supabase/*` dependency.
- **Production** is https://parcelscreen.vercel.app, deployed from main. Previews are on Vercel's `*.vercel.app` hosts.

## 1. The synced space and its code

- **Starting:** Settings → Your data → **Sync across devices** → **Start syncing this device**.
  1. The app makes a random code of 130 bits (`crypto.getRandomValues`). It's written as 26 characters of Crockford
     base32, in groups of five letters and digits, for example `7KQ2M-X9D4F-…` (no I, L, O or U, so nothing is misread).
  2. It uploads everything on this device as the space's first copy: the profiles, then the parcels, then the screens.
     The upload is in batches that stay under Vercel's 4.5 MB request limit, with a progress line ("Uploading screens:
     12 of 40").
  3. Then it shows the code as a **QR code** and as **text** with **Copy**.
- **The QR** opens `<this origin>/link#<code>`. The code is in the URL's fragment, which the browser never sends, so it
  never reaches a server log. The `/link` page reads it, then removes it from the address bar and the history entry
  (`history.replaceState`).
- **The code works like a password.** Anyone who has it can read and change everything in the space. It's kept in this
  device's localStorage (`ps.sync`, a device key, not a profile document). There's no rotation, and no list of joined
  devices.

## 2. Joining

- **By the QR:** the phone's camera opens the link in the browser, and on Android, Chrome and the installed app share
  the same storage, so joining in one joins both. There's no scanner in the app.
- **By the text:** Sync across devices → **Join with a code** → paste → **Join**. Spaces and dashes are ignored, and
  letters are read in either case.
- **What joining says:**
  - **A device with no data of its own:** "Join this synced space? This device will show the same parcels as your other
    devices." **Join**.
  - **A device that holds data:** "This device has 2 profiles and 14 parcels of its own. Joining replaces them with the
    synced space's. Export them first if you want to keep a copy." **Export first** (today's Export file) · **Replace
    and join** · Cancel.
- **A clean break:** nothing is merged. The device's profiles, documents and screens are deleted, the space's are
  fetched (profiles and parcels at once, screens as they're opened, §4), and the device stays joined from then on.
- **A wrong code** (one no space has) says "That code doesn't match a synced space. Check it and try again," and
  nothing on the device changes.

## 3. Once joined

- **Settings → Your data → Sync across devices** shows:
  - "This device is synced." with the indicator's state (§9);
  - **Show code:** the QR and the text again, to add another device or, later, Julie;
  - **Leave sync on this device:** asked once ("Stop syncing this device? It keeps a copy of everything as it is now,
    and stops getting your other devices' changes."). The device keeps its local copy, forgets the code, and works
    unjoined. The space and the other devices aren't touched.

## 4. The server

- **The only path to the database** is a small set of Next.js route handlers, under `app/api/sync/` plus
  `app/api/health`. They use the Supabase **secret key** from server-only environment variables (`SUPABASE_URL`,
  `SUPABASE_SECRET_KEY`, never `NEXT_PUBLIC_`), through `@supabase/supabase-js`. That's the stack's Supabase client, and
  this step's only new server dependency.
- **The code travels in a request header** (`x-sync-code`), never in a URL, so it stays out of logs too.
- **The routes:**
  - `POST /api/sync/space`: makes a space for a new code; refused if the code is already taken;
  - `GET /api/sync/changes?since=<time>`: the profiles and parcels changed since then, deletions included, plus the ids
    of the space's screens;
  - `POST /api/sync/save`: a batch of whole profile, parcel and screen records, and deletions;
  - `GET /api/sync/screen?id=<id>`: one screen;
  - `GET /api/health`: one tiny read, for the keep-alive (§7).
  
  A missing code, or one no space has, gets `404` and nothing else. There's no rate limiting: a 130-bit code can't be
  guessed.
- **The tables** (one migration, `supabase/migrations/0001_sync.sql`). Row-level security is on, with **no policies**,
  so the public anon key can read and write nothing. Only the secret key, on the server, gets through.

  | Table | Key | Columns |
  | --- | --- | --- |
  | `sync_spaces` | `space` | `created_at` |
  | `sync_profiles` | (`space`, `id`) | `record` jsonb (the profile: name, created; its settings, priorities and interview answers), `deleted` bool, `updated_at` |
  | `sync_parcels` | (`space`, `key`) | `profile`, `record` jsonb (one built parcel, exactly as `built[]` holds it), `deleted` bool, `updated_at` |
  | `sync_screens` | (`space`, `id`) | `profile`, `schema_version`, `record` jsonb (the kept screen), `created_at` |

  - **`space` is the code's SHA-256, not the code** (§11 Q1), so a copy of the database holds no working code.
  - **Screens are immutable:** the save route inserts a screen and ignores one already there, and nothing updates one.
    A screen goes only when its profile is deleted. `changes` lists only screens of the current `schema_version`, so a
    device never fetches one it would clear (today's start-up sweep).
  - **A deletion is a row marked `deleted`,** so the other devices learn of it. Deleting a profile also deletes its
    parcels and screens.
- **The store interface** (`lib/sync/store.ts`): the routes call a `SyncStore` (create space, changes since, save
  batch, one screen, health). It's implemented twice:
  - `SupabaseSyncStore` (server-only);
  - `MemorySyncStore`, for the unit tests and the e2e.

  CI never touches the production database (§8).

## 5. Sync on a joined device (`lib/sync/`)

- **What syncs, and what stays on the device:**

  | Synced (per profile) | On this device only |
  | --- | --- |
  | the profile's name; its settings (`ps.cfg`), priorities (`ps.rubrics`) and answers (`ps.interview`); each built parcel; each kept screen | which profile is current, the open parcel, the map's view and layers, the list's sort and Compare's columns, the rubric switch, the recent marks (§11 Q3) |

- **Under the prefs seam.** Pages keep reading from memory as they do today. When a synced document is written, the sync
  layer works out which whole records changed: the profile's own record, or each built parcel by its `key` and
  `updatedAt`. About a second after the last edit, it saves them in one batch. A new screen is saved once, when it's
  kept.
- **The later save wins.** The server stamps each record's `updated_at` as it's saved. Two devices that edit the same
  parcel end with whichever saved last, whole. Saving whole records keeps this simple. The cost is that two edits to
  the same parcel within the same few seconds keep only one, which is rare and accepted for a personal tool.
- **Fetching:** when the app opens, when it comes back to the front (`visibilitychange`), and on a tab switch.
  - It asks for changes since the last fetch, with a few seconds' overlap so nothing is missed, and applies them
    idempotently.
  - A record this device changed and hasn't saved yet is kept as it is: its own save follows and is later.
  - Changed parcels reach the page through 4b's announced `ps.parcels` write, and changed priorities through
    `RUBRICS_CHANGED`. A changed setting is read when the next page opens.
- **Screens are fetched when they're needed:** opening a parcel whose screen isn't on this device fetches it, and
  IndexedDB keeps it for good. A list of a hundred parcels doesn't download a hundred screens.
- **IndexedDB stays the local cache:** the same profiles, documents and screens as today. The app opens from it at
  once, then the fetch brings it up to date.
- **A failed save** (offline, or the server's error): the indicator turns to **Not saved**, and a toast says "Not saved —
  Try again." The change stays on screen and on this device. **Try again** resends what isn't saved. Nothing retries by
  itself, and there's no offline queue. If the app is closed with a change not saved, the next open says once "A change
  on this device wasn't saved." with Try again and Discard (§11 Q2). Discard takes the server's copy.

## 6. Unjoined devices

Everything works as today, local only. Nothing calls the sync routes, and Settings' Sync across devices offers **Start
syncing this device** and **Join with a code**.

## 7. Staying awake, and backups

- **The keep-alive:** `.github/workflows/supabase-keepalive.yml` runs once a day and calls
  `GET https://parcelscreen.vercel.app/api/health`. That route does one tiny read (one row of `sync_spaces`) with the
  server's key. The workflow needs **no GitHub secrets**: the health route returns only `{ ok: true }`.
- **GitHub turns off a public repo's scheduled workflows after 60 days without repository activity.** If the repo goes
  quiet that long, the keep-alive stops, and the project pauses 7 days later. To recover:
  1. Supabase's dashboard → `parcelscreen` → **Restore project** (possible within 90 days; the data is kept);
  2. GitHub → Actions → supabase-keepalive → **Enable workflow**.

  While the project is paused, joined devices read from their cache and every save says "Not saved."
- **Backups:** the free plan has no restorable backups, so **Settings → Your data → Export file is the backup.** Export
  every few weeks (§13). An export from a joined device holds the whole space's parcels, because it's the device's copy.

## 8. Database changes, CI and previews

- **Migrations go through the Supabase connector** (`apply_migration`), to the `parcelscreen` project only, before the PR
  that needs each one merges. They're **additive only**: create a table, index or function, or add a column. A
  migration that drops or renames anything, changes a type or deletes data is a stop condition (§12).
- **CI never touches the production database.** The routes take their `SyncStore` from one factory: the e2e's
  production build gets the memory store, through a test-only environment variable that's never set on Vercel. The
  unit tests call the route handlers with a memory store directly.
- **The tests** (unit, in Node, over the memory store, plus the e2e):
  - a wrong or missing code gets nothing, from every route;
  - two spaces can't see each other's profiles, parcels or screens;
  - two devices editing the same parcel end with the later save, whole;
  - a screen saved twice stays as it was first saved;
  - joining a device with data replaces it, after the warning; leaving keeps the local copy;
  - a failed save shows Not saved, and Try again saves it;
  - the code never appears in a request URL (the e2e reads every request the page makes).
- **The anon key reads nothing:** one check against the real project, run by hand once the migration is applied (the
  connector's publishable key; a `select` on each table through the Data API returns no rows, and an `insert` is
  refused). It's recorded in the hand-back. The connector's security advisors are run too. They'll list "RLS enabled,
  no policy" for each table, which is the intent here, and the hand-back says so.
- **Previews share the production project.** That's safe enough: a preview's origin has its own storage, so it starts
  unjoined, and it syncs only if Zach joins it on purpose.

## 9. UX

- **The main flows, in the fewest steps:**
  - **start:** Settings → Your data → Sync across devices → Start syncing this device → the QR;
  - **join:** scan the QR with the phone's camera → Join (or Replace and join);
  - **later:** nothing. Changes appear on the other device when it's opened or brought to the front.
- **The Sync screen** is a dialog over Settings, in the Settings dialog's style. On a desktop it's 480 px wide, with the
  QR at 240 px beside the code. At 375 px it's full screen, with the QR at 240 px above the code and the buttons full
  width.
  - **Unjoined:** one line on what it does ("Keep this device and your others in step: the same parcels, screens and
    priorities everywhere."), then **Start syncing this device** and **Join with a code**.
  - **Showing the code:** the QR; the code in grouped letters with **Copy**; and the warning, in the warning colour
    above them: "**This code works like a password.** Anyone who has it can see and change everything you sync. Use it
    only on your own devices, and don't post it or send it to anyone you wouldn't give a password."
  - **Joined:** "This device is synced.", Show code, Leave sync on this device.
- **The QR flow on Android:** the camera opens `/link#…` in Chrome → the join question → Join → Your list with the
  space's parcels. The installed app shares Chrome's storage, so it's joined too the next time it opens. On a desktop,
  "Join with a code" is the way in.
- **The indicator** shows on joined devices only, small and quiet:
  - on a desktop, at the top bar's right, beside ☰: **Synced** (muted) or **Not saved** (in the warning colour, a
    button that tries again);
  - on a phone, in More's sheet, under the profile: the same words. While something isn't saved, a dot also shows on
    the More tab.
  - Nothing shows while a save is in flight: it's usually under a second.
- **States:**
  - **loading:** a first join fetches the profiles and parcels, with "Getting your synced parcels…"; screens come as
    they're opened, each with the report's own loading state;
  - **empty:** a space whose first device had no parcels is simply empty, as today;
  - **error:** a wrong code (§2), Not saved (§5), and a paused project, which reads as Not saved;
  - **slow:** a fetch over 3 s leaves the cached page as it is. A save over 10 s counts as failed.
- **Plain labels:** Sync across devices, Start syncing this device, Join with a code, Join, Replace and join, Export
  first, Show code, Copy, Leave sync on this device, Synced, Not saved, Try again, Discard. "Synced space" is said once,
  in the join question; elsewhere it's just "synced".
- **Phone at 375 px:** every button at least 44 px; the code in a monospace face, large enough to read across a room;
  nothing scrolls sideways.
- **Contrast and consistency:** the app's paper and ink, its existing buttons and toast (`.switch-toast`), and the
  warning colour (`--color-warn`) for the password line and Not saved, which pass WCAG AA on paper.

## 10. Numbers and text that may change (the declaration)

- **No numbers:** no `config.ts`, expected.json, engine or `ScreenResult` change. Schema v9 stays frozen: screens are
  stored as they are.
- **No report, verdict or card text changes.**
- **UI text, new:** the Sync screen's lines and buttons, the join questions, the wrong-code line, the indicator, the
  toast, the next-open line, Leave's question, and "Getting your synced parcels…".
- **Storage:**
  - one new device key, `ps.sync` (the code and the last fetch's time);
  - IndexedDB's layout doesn't change;
  - the export file doesn't change (version 6).

  Unjoined devices keep their data. A joining device's data is replaced on purpose, after the warning (§2).
- **`CLAUDE.md`'s hard rules** are brought in line, in PR 1:
  - The RLS rule reads "RLS enabled … with policies scoped to the user's household". For step 5's tables it becomes RLS
    on with no policies: the API routes, with the secret key, are the only way in. Household policies come with
    accounts, if they ever do.
  - The secret's name changes from `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_SECRET_KEY` (Supabase's current secret key).

## 11. Questions for Zach

1. **The rows are keyed by the code's SHA-256,** not the code itself (recommended: one line of code, and a copy of the
   database then holds no working code)? Or by the code as is?
2. **A change not saved when the app closes:** the next open says so once, with Try again and Discard (recommended: the
   only way not to lose it silently or keep a silently different copy)? Or it's dropped, and the server's copy stands?
3. **Per device, not synced** (recommended): which profile is current, the open parcel, the map's view and layers, the
   list's sort, Compare's columns, the rubric switch and the recent marks. Or should any of them sync?
4. **The indicator's place** (recommended): the desktop top bar beside ☰, and More's sheet on a phone, with a dot on
   More while something isn't saved?
5. **Deleting a profile on a joined device** deletes it on every device, after today's question gains "on every synced
   device" (recommended)? Or deleting only leaves this device?

## 12. Stop conditions (push what's there, say why, wait)

- A change would alter expected.json, a grade, a verdict or report text.
- A migration would drop or rename anything, change a column's type or delete data.
- The anon key can read or write a table on the real project.
- §13's setup isn't done when a PR needs it.
- The same CI failure survives three attempts.
- The plan turns out wrong (for example, the prefs seam can't carry the sync without the pages changing how they read).

## 13. Zach's setup (about 5 minutes)

1. **Create the Supabase project `parcelscreen`** in your free organization (`zach-personal`), region us-east-1. If the
   two-active-projects limit blocks it, create a new free organization for it instead of pausing repcoach.
2. **Vercel → Environment variables,** for all environments (Production, Preview, Development): `SUPABASE_URL` (the
   project's URL) and `SUPABASE_SECRET_KEY` (its secret key, from Project Settings → API Keys). Neither is
   `NEXT_PUBLIC_`.

Afterwards, as a habit: **Export file every few weeks** (the backup, §7). If the project ever pauses, follow §7's two
steps.

## 14. The PRs, into `step/5-sync`

| PR | What | Checks |
| --- | --- | --- |
| 1 | **The server:** `0001_sync.sql` (applied through the connector), `lib/sync/store.ts` with the Supabase and memory stores, the `app/api/sync/*` routes and `app/api/health`, the keep-alive workflow, `@supabase/supabase-js`, `CLAUDE.md`'s two rules. | unit: every route over the memory store (no code, a wrong code, two spaces, the later save, a screen saved twice); the anon-key check and the advisors on the real project, recorded |
| 2 | **The device:** the Sync screen, `/link`, joining (the warning, Export first, the replace), leaving, the sync layer under the prefs seam, fetching, the indicator, the toast and the next-open line. A QR library (`qrcode`: small, no dependencies of its own, the usual choice) for drawing the code. | unit: the record diff, applying changes; e2e (memory store): start on one page and join from a second browser context; a parcel added in one appears in the other after a tab switch; the same parcel edited in both ends with the later save; offline → Not saved → Try again; leave; the code never in a URL |
| 3 | **The screenshots, the fresh-eyes review, the docs and the hand-back:** the Sync screen's states at 1280 and 375, the join questions, the indicator, the toast; REQUIREMENTS gets a short §3e on the sync space; `phase-0.md` §9.56. | Full CI on the step branch's head |

## 15. Test plan outline

**CI:** the unit tests over the memory store and the e2e above; never the production database.

**Screenshots (the hand-back), each at 1280 and 375:**
- Sync across devices: unjoined, showing the code, joined;
- the join question: with no data, and with data;
- a wrong code;
- the indicator, Synced and Not saved;
- the toast;
- the next-open line.

**Fresh-eyes review (CLAUDE.md):** the screenshots only, with "You've never used this app. What is this page for, and
what's confusing?"

**Manual, on the preview (about 20 minutes, desktop then the Android phone's Chrome), using the fixture parcels by
name.** The preview's origin starts unjoined on both devices, and its space is a test space in the production project.
The hand-back attaches `preview-parcels.json`, an export of the fixture parcels (Mud Creek, Macks, Ferney, Roan
Mountain), and step 9 is the one check that needs production.
1. **Desktop, the preview:** Settings → Your data → Import `preview-parcels.json` → the four parcels; then Sync across
   devices → Start syncing this device → the upload's progress, then the QR and the code, with the password line above
   them.
2. **Phone, Chrome on the preview, holding parcels of its own:** first open the preview and screen any one parcel, so
   the phone has data. Then scan the desktop's QR with the camera → "This device has … of its own" → Export first → a
   file saves → Replace and join → Your list shows the desktop's four parcels, and not the phone's own.
3. **Phone:** add a parcel (find **Macks Mountain** on the map, name it) → on the desktop, switch to another tab and back
   to Your list → Macks is there.
4. **Same parcel, both devices:** on the desktop, rename **Ferney Creek** "Ferney A"; then on the phone, rename it
   "Ferney B" → on the desktop, switch tabs → it reads "Ferney B" (the later save); on the phone, reopen the app → still
   "Ferney B".
5. **A screen:** on the desktop, screen **Mud Creek** → on the phone, open it → the same report, with no run.
6. **Offline:** phone in airplane mode → edit a parcel's notes → **Not saved** and the toast → airplane mode off → **Try
   again** → Synced → the desktop shows the note after a tab switch.
7. **Leave:** on the phone, Settings → Your data → Sync across devices → Leave sync on this device → the list stays; edit
   a note → on the desktop, it doesn't arrive.
8. **Desktop at 375 px** (the browser's device mode): the Sync screen fits, its buttons are easy to tap, nothing scrolls
   sideways.
9. **After the merge, on production, with your own data:** desktop → Export file (a backup) → Start syncing this device;
   phone, the installed app → scan the QR → Chrome joins → open the installed app → it shows the same list (Chrome and
   the installed app share storage).

## 16. What step 6 (Julie) takes from this step

- Julie's device joins the same space with **Show code**, and her own profile in it holds her priorities and answers, as
  a profile does today. Step 6 builds her view, the predictions and "Send to Julie to confirm" on that.
- Nothing in this step assumes one person per space, and nothing has to be undone for her.

## 17. Decisions to record in `phase-0.md` §9 (in PR 3)

- **§9.56 Sync across devices:**
  - a synced space keyed by a 130-bit code, shown as a QR and text, passed in a URL fragment and a request header, never
    a URL;
  - joining replaces the device's data (a clean break), and leaving keeps a local copy; no rotation;
  - the API routes with the secret key are the only path, behind RLS with no policies;
  - whole records, the later save winning; screens immutable;
  - fetch on open, return and tab switch; no offline queue;
  - a daily keep-alive read; Export is the backup;
  - migrations through the connector, additive only; CI on the memory store.
