# Parcel Screen → web app: setup checklist and phase plan

This is the human-side checklist. Claude Code's instructions are in `CLAUDE.md`; the full
requirements and data model are in `docs/REQUIREMENTS.md`. Do the "Day 0" section yourself,
then hand the repo to Claude Code with the phase you want.

---

## Decisions already made (don't relitigate in CC sessions)

| Topic | Decision | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + React | Same stack as BuddyTrip; one mental model |
| Map | MapLibre GL JS (not Leaflet, not Cesium) | Free 3D terrain from the terrarium tiles already used; no key, no tier |
| 3D walkthrough | Three.js / react-three-fiber | Already written; local diorama, no globe needed |
| Backend | Next.js Route Handlers + Supabase (Postgres, Auth, Storage) | Proxies for CORS-hostile services, caching, accounts, files |
| Hosting | Vercel | Already in use |
| Pipeline | `lib/screen/*` pure TypeScript, **zero DOM**, runs in a Web Worker in the browser and in Node later | Lets the cron pre-screen listings without a browser |
| Scoring | Site quality (sun 40 / aspect 15 / frost 15 / slope 15 / sky 15) and build cost (septic, foundation, rock, pad, driveway) as **separate** numbers; bottomland soils are a veto | Settled in the prototype; a great site with a long driveway is an A at $$$, not a D |
| Screens are immutable | A screen result is stored once; re-running creates a new version | Inputs (lidar, soils, atlas) don't change; the expensive part runs once |
| Sharing | Household + comments thread (no voting) + per-parcel share | Decided |
| Prices | Price history table, not a single field | Decided |

## Free vs Pro

Use **free tiers for Phases 0–3**. Nothing in those phases needs more.

- **Vercel Hobby (personal team, where repcoach lives):** fine for a personal app. Hobby prohibits
  *commercial* use — the moment you charge a fee or run this for clients, move the project to the
  Pro team. Hobby cron jobs run at most once per day, which is enough for Watch's first connector.
- **Supabase Free:** fine for dev. It pauses after 7 days idle (you'll click "restore" sometimes)
  and has 500 MB database / 1 GB storage. Move to Pro when Watch runs nightly (pausing breaks
  crons) or when attachments exceed ~800 MB. Don't downgrade the existing Pro project if BuddyTrip
  is on it; create a **separate** Supabase project for Parcel Screen either way — never share a
  database between the two apps.

Rule of thumb: upgrade when a free-tier limit actually breaks something, not before.

---

## Day 0 — accounts and skeleton (about 45 minutes, you do this)

Order matters: repo first, then Supabase (you need keys), then Vercel (it reads the repo and
needs the keys).

### 1. GitHub
- [ ] Create a **private** repo `parcelscreen` under your account. Default branch `main`.
- [ ] Guard `main` against direct pushes. GitHub branch protection isn't available on this plan, so
      install the local pre-push hook in [`docs/plans/README.md`](docs/plans/README.md#local-guard-against-direct-pushes-to-main-free-plan-repos)
      and merge only through PRs with green CI.
- [ ] Clone it locally.
- [ ] Copy these files into the repo root: `CLAUDE.md`, `PLAN.md`, `docs/REQUIREMENTS.md`,
      and the current prototype as `legacy/parcelscreen.html` (the source of truth for the port).
- [ ] Commit and push.

### 2. Supabase
- [ ] Create a new project **`parcelscreen`** (free tier). Region: `us-east-1` (closest to Vercel's
      default region and to the data). Save the database password in your password manager.
- [ ] Note from Project Settings → API: project URL, `anon` key, `service_role` key.
- [ ] Authentication → Providers: enable **Email** (magic link is fine). Google OAuth can come later.
- [ ] Storage → create a **private** bucket named `attachments`.
- [ ] Do **not** create tables by hand. Claude Code writes migrations (`supabase/migrations`) and
      you apply them with the Supabase CLI. That keeps schema in the repo.
- [ ] Install the Supabase CLI locally and run `supabase login` once.

### 3. Vercel
- [ ] In the **personal (free) team**, "Add New Project" → import the `parcelscreen` repo.
      Framework preset: Next.js. Root directory: `/`. Leave build settings default.
- [ ] Environment variables (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefixed with `NEXT_PUBLIC_`)
  - `CRON_SECRET` (any long random string; protects `/api/watch/tick`)
- [ ] First deploy will fail until Phase 0 lands a Next.js app — that's expected.
- [ ] Later (Phase 1): Authentication → URL Configuration in Supabase: add the Vercel production
      URL and `http://localhost:3000` to redirect URLs.

### 4. Local
- [ ] `.env.local` with the same four variables. `.env.local` is gitignored by the Phase 0 scaffold.
- [ ] Node 20+ installed. `pnpm` preferred (BuddyTrip parity); `npm` is fine.

### 5. Hand-off to Claude Code
- [ ] Open the repo in Claude Code. First prompt (verbatim is fine):

  > Read CLAUDE.md, PLAN.md and docs/REQUIREMENTS.md. Then read legacy/parcelscreen.html end to
  > end. Produce a written plan for Phase 0 as `docs/plans/phase-0.md` — files you'll create,
  > module boundaries, what you'll port verbatim vs. restructure, and the acceptance checks you'll
  > run. Do not write application code until I approve the plan.

- [ ] Approve or edit the plan. Then: "Execute Phase 0. Open a PR per step as described in CLAUDE.md."

---

## Phases

Each phase ends with a deployable app and a short acceptance list. Don't start the next phase
until the current one is merged and deployed.

### Phase 0 — Port the Explorer (feature-identical to the prototype)
Goal: the prototype, as a Next.js app, with the pipeline isolated from the DOM.
- Next.js + TS + Tailwind scaffold; CI (typecheck, lint, test) on PRs.
- `lib/screen/*`: dem, terrain, suitability/sites, sun, sky (atlas), soils, flood, padus,
  places/roads, scoring — ported from the prototype, **no `document`/`window`/Leaflet** inside.
- `lib/geo/*`: UTM, parcel services (NC/VA/TN), split, WKT.
- Web Worker that runs `screen(polygon, config)` and posts progress per step.
- Map with MapLibre: basemaps, parcel outlines at z≥15, tap-to-select, draw, split, house marker.
- Results panel: one React component per section, rendered from the result JSON.
- 3D walkthrough as a component (react-three-fiber), six scenes as in the prototype.
- Settings persisted in localStorage (no accounts yet).
- **Acceptance:** the Ferney Creek parent parcel (52-47A) and the Macks Mountain parent (35-3)
  produce the same verdicts, site rankings, sun hours (±0.1 h) and sky numbers as the prototype;
  recorded fixtures for both live in `test/fixtures` and the pipeline tests run offline.

### Phase 1 — Accounts and Library
Goal: save a contender; the parcel page is the document.
- Supabase Auth (magic link). RLS on every table from the first migration.
- Tables: `households`, `memberships`, `parcels`, `screens`, `attachments`, `price_events`,
  `comments`, `parcel_shares` (see REQUIREMENTS).
- Parcel page = computed blocks (from `screens.result`) + placeholders + user blocks.
- Attachments upload to Storage (PDF, images, links). Price history editor.
- Migrate the prototype's saved-parcels JSON export via an import screen.
- **Acceptance:** save Macks Mountain as a contender with the plat PDF attached and two price
  events; reload shows everything without re-running the screen.

### Phase 2 — Share and export
- Household invite; Julie's login sees only shared parcels; comments thread with pinned "why I
  shared this" and resolved flag.
- Export: PDF of the parcel page (print stylesheet, images inlined, three captured 3D frames)
  with two presets (full; attorney/evaluator subset). Public read-only share link with opaque ID.
- **Acceptance:** share Macks Mountain to a second account; comment from it; export the PDF.

### Phase 2.5 — Driveway router and build-cost estimator
- `lib/screen/driveway.ts` per REQUIREMENTS §2a; entrance candidates, two routes, quantities, cost range.
- Route drawn on the map and draped on the 3D block; cost replaces the straight-line term.
- **Acceptance:** on the Macks Mountain parent, the routed driveway to site #1 obeys the 10% limit
  at every 3 m station and the cost range brackets a hand estimate within ±30%.

### Phase 3 — Rules and priority list
- `rules` table (JSON rule set per household) and the evaluator over screen results + listing
  fields; `ignored` status with dedupe keys; the Library sorted by tier.
- Import the Mountain Town Assessment as `regions` (county → scores).
- **Acceptance:** the three example rules in REQUIREMENTS order the saved parcels as expected.

### Phase 4 — Watch (first connector: Gmail)
- `sources`, `searches`, `listings` tables; connector interface with per-connector cadence floor;
  throttled HTTP client; `/api/watch/tick` protected by `CRON_SECRET`, called by Vercel cron
  (daily on Hobby).
- Gmail connector (your own mail from auction firms) → listings → parcel-ID extraction → parcel
  polygon lookup → promote to contender.
- **Acceptance:** an auction-announcement email becomes a listing with a parcel polygon attached.

### Phase 5 — Headless pre-screen, HiBid connector, notifications
- Run `lib/screen` in Node for listings matched by rules; store the screen; email digest.
- HiBid GraphQL connector behind a nightly floor and a `tos_note`.
- Neighbors fan-out (buffer query + per-state attribute adapters) with letter draft.
- This is where Supabase Pro and the Vercel Pro team start to matter.

---

## Working agreement with Claude Code (summary; full version in CLAUDE.md)
- Plan before code: every phase begins with `docs/plans/phase-N.md` that you approve.
- One PR per plan step, small enough to read. CI green before merge.
- The prototype is the behavioral spec. Deviations are listed in the PR description.
- Scoring, thresholds and unit costs live in `lib/screen/config.ts`; changing them requires
  updating the fixture test and saying so in the PR.
- No DOM in `lib/screen`. No secrets in client code. RLS on by default.
