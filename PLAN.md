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
| Ground viewer | 2D canvas (cylindrical panorama) | Step 17 (owner, 2026-10-07): the 3D map covers the aerial scenes; Three.js / react-three-fiber left the stack |
| Backend | Next.js Route Handlers + Supabase (Postgres, Auth, Storage) | Proxies for CORS-hostile services, caching, accounts, files |
| Hosting | Vercel | Already in use |
| Pipeline | `lib/screen/*` pure TypeScript, **zero DOM**, runs in a Web Worker in the browser and in Node later | Lets the cron pre-screen listings without a browser |
| Scoring | Site quality (sun 40 / aspect 15 / frost 15 / slope 15 / sky 15) and build cost (septic, foundation, rock, pad, driveway) as **separate** numbers; bottomland soils are a veto | Settled in the prototype; a great site with a long driveway is an A at $$$, not a D |
| Screens are immutable | A screen result is stored once; re-running creates a new version | Inputs (lidar, soils, atlas) don't change; the expensive part runs once |
| Sharing | Household + comments thread (no voting) + per-parcel share | Decided |
| Prices | Price history table, not a single field | Decided |
| Users (10/16; 10/19) | Anyone with the link creates a local profile that holds their data in that browser; nothing hard-coded to Zach and Julie. Step 5 lets one device's data sync to others through a code, with no accounts; accounts aren't scheduled | `docs/design/workflow-review.md`, Roadmap |
| Grading (10/16) | Grades are computed at display time from stored measurements plus the viewer's rubric; a saved screen stores raw values and no grades | One change unlocks the interview, the editor, the previews and household predictions without re-screening |
| Household grades (10/16) | Each person grades for themselves; others' grades are predictions from their rubrics, with a prompt to send for confirmation; no combined grade | Decided |
| Cost to enjoy (10/16) | Stays, as cost to camp and cost to build, driven by the parcel's state; phasing isn't asked | Decided |
| Tennessee (10/16) | In, for parcels (step 2) and the area catalog | So many saved parcels sit around Roan Mountain |

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

## Roadmap (owner, 2026-10-16; the spec is `docs/design/workflow-review.md`)

Phase 0, the port, is merged and deployed. The phases that were to follow it (accounts and sync, share and
export, the driveway router, rules, Watch) are superseded by the fifteen steps below, from the workflow
review: the parcel tools, the screen and the library are built, and what's missing is the part that makes the
grade the viewer's own. Each step is one unattended Claude Code mission (CLAUDE.md, "Mission mode"): a plan
approved once, PRs into a `step/<n>-<name>` branch merged by Claude Code on green CI, and one final PR to
main that Zach merges after running the step's test plan on its preview. Don't start step N+1 until step N is
on main.

**Reordered 10/18–19 (Zach):** sync across devices is step 5, before Julie's household step, which becomes step 6. The
steps after it move down one; 14 and 15 keep their numbers. Accounts and attachments (formerly step 13) leave the
roadmap for now (Not scheduled, below).

| # | Step | What it delivers |
|---|---|---|
| 1 | **Profiles and the grading split** | Anyone opening the link creates a local profile; profiles can be added, switched, renamed and deleted, and all data is scoped to a profile. Today's data moves into a first profile. Saved screens store raw measurements; grades are computed on display from measurements plus the profile's rubric. The default rubric reproduces today's grades exactly on every fixture, so nothing visible changes except the profile picker. |
| 2 | **Tennessee** | Statewide parcel lines through the state's parcel program (the service, its fields and its terms confirmed first), Tennessee imagery, Tennessee trailhead sources, and a recorded fixture near Roan Mountain. |
| 3 | **Rubric editor** | Four columns (Must, Should, Could, Won't); drag between and within; threshold sliders; a live preview on the open parcel; "Reset to my answers". |
| 4 | **Interview** | The 14 forced-choice screens, the rubric generator, first-launch onboarding for a new profile, and "Redo the interview". |
| 4b | **Navigation** | Three places as tabs (Map, Your list, What matters): a bottom tab bar on a phone, a slim top bar on a desktop. Compare as an action on Your list; one Help page (the report's notes, then how grades work; old `/rulebook` links still work); Settings gains Your data (Export, Import); the ☰ menu keeps only the profile, Help and Settings. Plan: `docs/plans/step-4b-navigation.md` (owner, 10/18). |
| 4c | **Map layout** | The desktop's results in one docked left panel, Search its first row (only that row with no parcel open), collapsing to a slim tab; the toolbar and hint centred on the visible map; the credits' ⓘ at the bottom right. "Grade this parcel" in place of "Run again": in the toolbar (under the sheet's header on a phone, whose peek grows to hold it), shown after a run only with a reason; the step log folded to one line. The zoom slider removed (owner). Plan: `docs/plans/step-4c-map-layout.md` (owner, 10/19). |
| 5 | **Sync across devices** | Zach's phone and desktop show the same data. Settings → Your data → Sync across devices turns a device's data (profiles, parcels, screens, settings, priorities, answers) into a synced space with a random code, shown as a QR; another device joins by the QR or the code, replacing its own data. The server (Next.js API routes, the Supabase secret key, RLS with no policies) holds the truth for joined devices; fetch on open, return and tab switch; whole records, the later save winning; "Not saved — Try again" on a failure, no offline queue. No accounts, sign-in or email. A daily keep-alive for the free plan. Plan: `docs/plans/step-5-sync.md` (owner, 10/19). |
| 6 | **Household** | Built on step 5's sync: Julie's device joins the same synced space, and her own profile there holds her priorities, so "How would Julie rate this?" is a prediction from her current rubric, labelled as one. "Send to Julie to confirm" is an in-app request she answers with her own verdict and a comment. No combined grade. (Reworked 10/18–19: no rubric import by code or file, no shared file or link.) As built: one shared list ("Added by Zach"), Who's this? and I'm new here after joining, the list's Grades ("B · Julie C"), How Julie would rate it, Ask Julie → Waiting for you → Yes / Maybe / No, Both like it, Lowest of our grades. Plan: `docs/plans/step-6-household.md` (owner, 10/19). |
| 7 | **Screening results** | The answer first (grade, verdict, one line of reason), the best site plus up to two alternatives, the report card in rubric order, unknowns as questions for the agent. A **Driveway** row joins the card here, graded from the router's measurements, and the interview's question 10 feeds it (owner, 10/18; step 4 plan §9 Q5). As built: each person's grade at their best homesite (display-time), the answer's reason in their own edges ("Strong elevation and winter sun; the nearest trailhead is 47 minutes away, past your 20"), Best homesite and Other spots (10 points, 100 m) with N more spots, Must have / Really want / Nice to have, Still unknown with Copy and Copy all, Full report ▸, the Driveway row on the steepest grade (question 10: 20 / 15 / 12%). Plan: `docs/plans/step-7-results.md` (owner, 10/20). |
| 8 | **Favorites** | A star, a plain name field, History and Favorites split; "In progress" goes away. As built: Your list opens on Favorites \| History; Favorites is the household's list as it was, starred parcels only; History is each person's own (graded or kept, newest first, synced with their profile), with ✕ and Undo and Clear history; the star on the panel's header and on rows, its name prefilled from the parcel's name, the listing's address, or its acres, road and county; unstarring returns a parcel to its adder's History; Search lists Favorites and Your history above the places. No data wipe: In progress parcels went to their adder's History. Plan: `docs/plans/step-8-favorites.md` (owner, 10/20). |
| 8b | **The parcel panel holds the parcel** | Map layers is how the map looks; the parcel panel is everything about this parcel (owner, 10/20). As built: Grade \| Details under the parcel panel's header; Details holds Listing, Notes, Lines & marks (rows opened in place, Draw a line, + Mark) and Boundary; the Info panel goes, its map settings joining the map button's Map layers, with one new setting, Your lines and marks. Plan: `docs/plans/step-8b-parcel-panel.md` (owner, 10/20). |
| 9 | **Report card export** | A print-ready page the browser saves as PDF, with One page and Full presets. |
| 10 | **Cost to enjoy** | Cost to camp and cost to build from the parcel's state and markers, graded against the two budgets from the interview. |
| 11 | **New data points**, one PR each | Climate and Privacy first, then Long view, Airport, Bike to a long trail, Internet. Hospital becomes its own factor in the first. |
| 12 | **Ways to raise the grade** | Homesite, access, septic and combine first; tree clearing after canopy heights are confirmed. |
| 13 | **Area catalog** | The 30 areas, area profiling run headless on a schedule, scoring by the user's rubric, the suggestion box, sample parcels. |
| 14 | **What the land can do** | Panel 1 (what you can do here: camp now, build, trails, garden, hunt, ride, divide, what limits you), the county rules table, power-line distance, and the Split tool as a keep / sell scenario. Can run any time after step 10. |
| 15 | **How it could pay** | Panel 2 with dated, sourced ranges: the conservation-easement slider, use-value tax, forest-carbon eligibility, hunting lease, timber, split break-even, camp sites. After step 14. |

**Paused (10/16):** WF6b (the engine half is merged; the app side waits), follow-up 57 (snap lines to lidar),
follow-up 46 (county grade limits), the cost-label PR, VR8 calibration and Batch B. Their branches and plans
stay as they are (`docs/plans/phase-0.md` §6). VR8's weight calibration is replaced by the interview and the
editor; its band cutoffs get a lighter sanity check after step 11.

**Not scheduled:** Watch (listing sources, connectors, the headless pre-screen and the digest: the old Phases 4
and 5) stays in `docs/REQUIREMENTS.md` §6–§7 for after the roadmap, and so do accounts, households by
invitation and attachments (photos and PDFs on a parcel), with the Supabase data model there (§3): step 5's synced space
is much smaller and is described in its own plan. Georgia and West Virginia parcels come after the catalog ships.

---

## Working agreement with Claude Code (summary; full version in CLAUDE.md)
- Plan before code: every phase begins with `docs/plans/phase-N.md` that you approve; every roadmap step with
  `docs/plans/step-<n>-<name>.md`, approved once.
- Mission mode (CLAUDE.md): each roadmap step runs on a `step/<n>-<name>` branch; Claude Code merges the PRs into
  it on green CI, and Zach merges the one PR from the step branch to main after running the step's test plan.
- One PR per plan step, small enough to read. CI green before merge.
- The prototype is the behavioral spec. Deviations are listed in the PR description.
- Scoring, thresholds and unit costs live in `lib/screen/config.ts`; changing them requires
  updating the fixture test and saying so in the PR.
- No DOM in `lib/screen`. No secrets in client code. RLS on by default.
