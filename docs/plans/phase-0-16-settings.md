# Step 16: Settings, and export/import (plan)

Status: **approved with additions (owner, 2026-10-07); decisions in §6, including the import matching rule (§6.8).** It covers
step 16 of `phase-0.md` §6 ("Settings + saved parcels").

**Saved parcels** already became **History** in 13e: built parcels are kept automatically, with Open and Remove (`phase-0-13e-parcel-tools.md` L59, L235; the 14 plan dropped "Save this parcel"). What's left of them for step 16 is **export and import**.

Line numbers (L…) refer to `legacy/parcelscreen.html`.

**Goldens are untouched by step 16:** nothing here changes the engine, `DEFAULT_USER_CONFIG` or `SCREEN_CONSTANTS`.

## 1. Settings

**Where:** the ☰ menu's **Settings** item (disabled today, "coming in step 16"). It opens a dialog, as in the prototype (§8: no `/settings` route in Phase 0).

### The fields, in the prototype's order and with its labels verbatim (L340–386)

- **Thresholds.** The help text reads: "These encode judgment, not fact. Change them and re-run."
  - The prototype's 15 fields, **minus `aspectFrom` / `aspectTo`**: they're unused by the screen and hidden (§9.4; step 19 unifies the aspect targets).
  - So 13 fields: house site score and area, shelf score and area, compact site acres, garden score and area, frost-pocket height, shallow bedrock, winter sun hours, canopy allowance, road grade warning, and DEM cell size (1–30 m).
- **Driveway unit costs.** The help text reads: "Blue Ridge 2026 rough rates; edit to your excavator's numbers. The estimate is shown as ±30%." The fields are the 10 unit costs, with the same labels.
- **Drive-time anchors.** "One per line: `Name, lat, lon`." It's the same text format; stored as the port's `{ name, lat, lon }[]`.
- **Data endpoints.** "Edit if a service moves. Parcel services are tried in order until one returns a feature." It's a JSON editor over the port's endpoints object, keeping its `_v`.
- **Time zone (new in the port, B5):** the night sky's civil time (step 17), default `America/New_York`. It's a select of the browser's IANA zones (`Intl.supportedValuesOf("timeZone")`).

### The defaults, and `_v` (owner, §6)

- **The defaults are the prototype's.** `DEFAULT_USER_CONFIG` (`lib/screen/config.ts`) carries the prototype's `DEFAULTS` (L407–457) value for value. A new test proves it field by field, types included (§5). The only differences, each asserted by name so a new one fails the test:
  - **anchors:** the prototype keeps a text block; the port keeps the objects the prototype's own `anchors()` parser (L467) makes from it.
  - **endpoints:** the prototype keeps a JSON string; the port keeps the object. Inside it, two keys differ, both from #18 (your Overpass decision after the step 13 CORS check): `_v` and `overpass`.
  - **`timeZone`:** port-only (B5).
  - **`_res3`:** prototype-only, a flag its loader writes (L462), not a default.
- **`_v: 10 → 11` is a doc-only matter for step 16.**
  - The port's `DEFAULT_ENDPOINTS._v` has been **11 since #18** (Overpass reordered, private.coffee dropped). **The prototype says 10** (L431); it was never bumped there.
  - `phase-0.md`'s config row already says `_v: 11`, so the "correct 10 to 11" item this plan used to list has nothing left to do; it's dropped from §3.
  - **Step 16 changes no code here:** neither `_v` nor `migrateEndpoints`, which is the prototype's L461 rule unchanged (a stored endpoints object without `_v`, or with an older one, is replaced wholesale by the defaults).
  - **A consequence worth knowing:** a prototype export's endpoints carry `_v: 10`, so on import they're replaced by the port's defaults. That's the same rule the prototype applies to its own stale copies. The import summary says so when it happens (§2).

### Saving

**Save validates every field before it stores anything** (deviation from the prototype: it stored an empty field as 0 and garbage as `NaN`, with no checks, L1625).

- **The checks:**
  - **Numbers:** finite, in their stated ranges (Q1): scores 0–100 and DEM cell size 1–30, as their labels say; everything else ≥ 0.
  - **Min/max pairs:** min ≤ max for every pair. The editable fields have none today: the only pair, `aspectFrom` / `aspectTo`, is hidden and ignored. The check is written over a list of pairs, so a pair added later gets it. (The acreage thresholds aren't a pair; see §7.)
  - **Integers where the prototype uses counts:** none of the 23 editable numbers is a count. Scores, acres, feet, cm, hours, degrees, %, dollars and the DEM cell size are all measures, and the prototype uses them as reals (it clamps the cell size, L1012, but never rounds it). The integer check applies to the two counts in the endpoints object: `_v` and `lpAtlasYear`.
  - **Anchors:** every line must parse as `Name, lat, lon`, with lat in −90…90 and lon in −180…180. Lines that don't are named. The prototype silently dropped them at use (L467).
  - **Endpoints:** valid JSON matching the schema; every URL (each string, including those in the `padus`, `overpass` and `parcels` lists) must be `https:`.
  - **Time zone:** a valid IANA zone (accepted by `Intl.DateTimeFormat`). The select only offers valid ones, but an imported file is checked the same way.
- **On failure, nothing is stored.** Save lists each failing field by its label, with the reason, e.g. "House site: min cell score (0–100) — must be between 0 and 100", "Data endpoints — overpass[1] must be an https URL". The field is also marked in place.
- **Saving without edits leaves `ps.cfg` byte-identical.** The form round-trips the config exactly: anchors text ↔ objects, endpoints JSON ↔ object, with key order kept. Save compares the parsed config with the current one, and when nothing changed it writes nothing. That's also why no "These results used earlier settings." note appears.
- **Reset to defaults** fills the dialog with the defaults; **Save** keeps them (deviation). The prototype saved on Reset at once and left the driveway-cost fields showing the old values, which a later Save then wrote back (L1626, a bug).
- **Cancel** and **Esc** close without saving, as the prototype's backdrop/Esc did.
- **What a save changes:**
  - The next **Run** uses the new settings.
  - **Results already shown aren't re-run** (the prototype: "Change them and re-run."). They get 14d's soft note, "These results used earlier settings.", with the run's settings on request.
  - Today the explorer reads the config once (`ExploreShell`, `useState(loadUserConfig)`), so 16a makes it live: a save updates the shell's config, and the note appears on the open parcel right away.
- **Storage:** `ps.cfg`, as now (`lib/client/userConfig.ts`).

## 2. Export and import

**Where:** in the ☰ menu, under History: **Export file** and **Import file**.

### Export

`parcelscreen-YYYY-MM-DD.json` is versioned by **`format` and `version`**:

```jsonc
{
  "format": "parcelscreen-export",
  "version": 1,
  "exportedAt": "2026-10-07T15:00:00.000Z",
  "cfg": { /* UserConfig */ },
  "parcels": { /* the ps.parcels store: { v: 2, open, built[] } */ },
  "screens": [ /* the kept screens listed in built[].screenIds */ ]
}
```

- `parcels` is the `{v: 2, open, built[]}` store History already keeps, which is REQUIREMENTS §3a's versioned contract.
- `screens` are the IndexedDB records listed in those parcels' `screenIds`, so the results come back with them.
- **It's documented in REQUIREMENTS §3a** (this PR) as the file **Phase 1 will import into Supabase**, alongside the `ps.parcels` store it already reads on first sign-in:
  - built parcels become `parcels` rows, as for the store;
  - screens become `screens` rows;
  - `cfg` becomes the user's settings.
  - Any change to its shape takes a new `version` and a converter.

### Import

- **The whole file is validated first, then all of it is applied or none of it.** Every check runs before anything is written:
  - the file shape (Zod), the parcels store and every screen record;
  - `cfg` through the same checks as Save (§1).

  Any failure stops the import, names what failed, and changes nothing: no parcels, no screens, no settings. The hint for a file that isn't an export at all is the prototype's, verbatim: "That file isn't a Parcel Screen export".
- **Every parcel, county or drawn, is matched on its History `key`** (owner, §6.8). Never on the dedupe key.
  - **Identical key → skip.** The History entry is never overwritten. The file's copy is skipped, with its screens, and listed by name in the summary.
  - **New key → add**, with its screens, as its own History entry.
  - **Never drop a distinct recipe.** A parcel that shares a county record with a History parcel but has a different recipe (different pieces, or a different split) is added as its own entry. The summary notes it as "same county record, different recipe". "Shares a county record" means a piece with the same `pieceDedupeKey` (REQUIREMENTS §3).
  - Deduplicating across recipes is Phase 1's job.
  - **History can already hold two recipes of one record:** it's keyed only by `key`, and nothing merges entries by county record.
    - Both are listed in History and found by Search, under the same name.
    - On the map their outlines overlap, so a tap on the shared ground opens the top one, and the other opens from History or Search. That's how two such entries behave today; 16b doesn't change it.
  - The open parcel isn't changed; the file's `open` is ignored.
- **Settings replace the current ones only after a confirm listing the changed fields**, by their labels, e.g. "Replace your settings? Changed: House site: min cell score (60 → 55), Data endpoints."
  - This replaces the prototype's plain "Also import the settings from this file?" (L1609) with the list.
  - If no field differs, there's no confirm.
  - Declining keeps the current settings and still imports the parcels.
- **Hidden fields are ignored and named.** `aspectFrom` / `aspectTo` keep their defaults whatever the file says, and any other field the dialog doesn't show (e.g. the prototype's `_res3`) is dropped. Each one the file carried is named in the summary, with its value when it differs from the default.
- **The summary** opens with the prototype's hint, verbatim: "Imported N parcels". It then lists:
  - **parcels added**, and their screens;
  - **parcels skipped**, the same History key already there, by name;
  - **same county record, different recipe**: the added parcels that share a county record with a History parcel, by name;
  - **settings changed**, by field, or "Settings unchanged" / "Settings kept (you declined)";
  - **ignored fields**, by name;
  - for a prototype file, **endpoints replaced** by the defaults under the `_v` rule (§1).
- **A prototype export** (`{ cfg, saved[] }`, L1605):
  - **Each saved parcel becomes a History parcel** from its boundary (`geo`, `props`) and house: a boundary source "saved parcel", its name and notes. No result comes with it, as in the prototype, where reopening never restored a result: it selected the boundary and you pressed Run (L1602; Q4).
  - **Its `cfg` converts** to the port's shape, and is then validated and confirmed as above:
    - anchors text → objects;
    - the endpoints JSON string → object, through the `_v` migration;
    - hidden fields ignored as above.

    Without the conversion it would fail the port's strict schema and load as all defaults.

### Doesn't this pre-empt Phase 1?

No. Phase 1's importer reads `ps.parcels` on first sign-in (REQUIREMENTS §3a), so a file imported here simply arrives in Phase 1 as History, and the export file is the documented way to carry it across browsers. PLAN.md's Phase 1 "import screen" for prototype exports can reuse 16b's converter.

## 3. Files

| File | What |
| --- | --- |
| `components/Settings/SettingsDialog.tsx` | The dialog: the four sections plus the time zone; the failure list and in-place marks; Reset / Cancel / Save |
| `lib/client/settingsForm.ts` (pure) | Form ↔ `UserConfig`: parse and validate each field (ranges, pairs, integers, anchors, endpoints, time zone); anchors text ↔ objects; endpoints JSON ↔ object; the changed-fields diff by label. Node-tested. |
| `components/Explore/ExploreShell.tsx` | The config becomes state with a setter; Save updates it |
| `components/Explore/Menu.tsx` | Settings enabled; Export file / Import file under History |
| `lib/client/exportFile.ts` (pure) | Build and read the port's file (`format`, `version`); convert a prototype export (parcels and `cfg`); validate everything, then plan the import (added, skipped, settings diff, ignored) without writing. Zod-checked. Node-tested. |
| `lib/client/screenStore.ts` | `getScreens(ids)` / `putScreens(records)` for export and import |
| `docs/REQUIREMENTS.md` | §3a: the export file, as the file Phase 1 imports (in this plan PR) |

No new dependency.

## 4. PRs

1. **16a, Settings:**
   - the dialog, validation and the failure list, Reset / Cancel / Save;
   - the live config and the time zone;
   - the defaults-parity and no-edit-save tests.
2. **16b, Export / import:**
   - the port's file (`format`, `version`: parcels, screens, settings);
   - prototype exports converted;
   - validate-all-then-apply, matching by History key (skip identical, add distinct recipes), the settings confirm, and the summary.

## 5. Checks

- **Defaults parity (new, 16a):** the port's `DEFAULT_USER_CONFIG` equals the prototype's `DEFAULTS`, field by field, types included. The prototype's `DEFAULTS` and `anchors()` are read from `legacy/parcelscreen.html` with the oracle helper.
  - Every threshold and every `dw` cost: same value, same `typeof`.
  - Anchors: equal to the prototype's `anchors()` applied to its text.
  - Endpoints: equal to `JSON.parse` of its string, except exactly `_v` (10 → 11) and `overpass` (#18).
  - `timeZone` is the only port-only key.
  - Any other difference fails.
- **No-edit save (16a):** for the defaults and for an edited config, form → parse gives a config whose `JSON.stringify` equals the stored `ps.cfg` string. Save with no edits writes nothing, and `ps.cfg` is byte-identical afterwards (unit and headless).
- **Validation (16a):** each field's range; a min/max pair out of order (with a test-only pair, since none is editable); `_v` and `lpAtlasYear` as integers; a bad anchor line; an `http:` endpoint; an invalid time zone. Each failure is named with its label and reason, and nothing is stored.
- **Reset** gives `DEFAULT_USER_CONFIG`; Reset then Save stores the defaults.
- **Import (16b):**
  - a file with one bad screen record imports nothing (parcels, screens and settings unchanged);
  - a parcel whose History key is already there is skipped and listed, and the History copy is untouched;
  - the same county record with a different split (and, separately, with different pieces) is added as its own entry and noted "same county record, different recipe"; History then holds both;
  - a drawn-only parcel with a new key is added; with a key already there, it's skipped;
  - settings are replaced only after the confirm, whose list matches the changed fields; declining keeps them;
  - prototype `aspectFrom` / `aspectTo` / `_res3` are ignored, defaults kept, and named;
  - the summary's added / skipped / changed counts.
- **Round trip (16b):** export → import into an empty store gives the same parcels, screens and settings; export → import into the same store skips every parcel and changes nothing.
- **Prototype file (16b):** a prototype `cfg` (the real L415–456 defaults with `_res3`) converts and validates; its endpoints are replaced under the `_v` rule and the summary says so; its saved parcels become History parcels.
- **Fixture:** changing a threshold and re-running changes the result. Ferney Creek with `houseMin` raised gives fewer house sites, and the step 10 parity runs with the defaults are unchanged. **The goldens aren't touched.**
- **Headless:**
  - a save changes the next run, and the open parcel shows "These results used earlier settings."; a no-edit save shows no note;
  - a bad field: Save names it and nothing is stored;
  - Reset then Save restores the defaults;
  - export, clear storage, import: History and its results come back; importing it again skips everything.
- **§7b:** "Settings: edits persist and change the next run; Reset; endpoints JSON with `_v` migration", plus export/import.

## 6. Decisions (owner, 2026-10-07)

1. **Q1 Validation:** the stated ranges (finite; scores 0–100; DEM cell size 1–30; everything else ≥ 0), plus:
   - min ≤ max for every min/max pair;
   - integers where the prototype uses counts;
   - a valid IANA time zone;
   - https URLs in the endpoints.

   On failure, Save names the field and the reason, and nothing is stored.
2. **Q2 Reset:** fills the dialog with the defaults, kept on Save. *Approved as recommended.*
3. **Q3 Export shape:** the port's own file, versioned by `format` and `version`, documented in REQUIREMENTS §3a as the file Phase 1 imports into Supabase. Prototype exports are read on import. *Approved as recommended.*
4. **Q4 Imported prototype parcels** arrive without results, to be run. *Approved as recommended.*
5. **Defaults:** a test that the defaults equal the prototype's field by field, types included, and that a no-edit save leaves the config byte-identical. Goldens untouched.
6. **`_v`:** stated in §1: a doc-only matter for step 16. The code has said 11 since #18, the prototype says 10, and nothing in step 16 changes `_v` or the migration.
7. **Import:**
   - validate the whole file, then apply all or none;
   - settings replaced only after a confirm listing the changed fields;
   - parcels matched as in §6.8, never overwritten;
   - hidden fields ignored (defaults kept) and named;
   - a summary of parcels added and skipped, and settings changed.
8. **Import matching (owner, after #58's first draft):**
   - every parcel, county or drawn, is matched on its History `key`, not the dedupe key;
   - an identical key is skipped and listed;
   - the same county record with a different recipe (different pieces or split) is added as its own History entry, noted "same county record, different recipe" in the summary.

   Never drop a distinct recipe on import: deduplicating across recipes is Phase 1's job. History can already hold two recipes of one record (§2), so nothing needs working around.
9. **Acreage thresholds:** no ordering check between shelf, compact site and house site. They aren't a min/max pair, and the prototype doesn't order them. The defaults happen to rise: 0.1 ≤ 0.15 ≤ 0.3 ac.
