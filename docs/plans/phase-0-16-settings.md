# Step 16: Settings, and export/import (plan)

Status: **draft, for approval.** It covers step 16 of `phase-0.md` §6 ("Settings + saved parcels").

**Saved parcels** already became **History** in 13e: built parcels are kept automatically, with Open and Remove (`phase-0-13e-parcel-tools.md` L59, L235; the 14 plan dropped "Save this parcel"). What's left of them for step 16 is **export and import**.

Line numbers (L…) refer to `legacy/parcelscreen.html`.

## 1. Settings

**Where:** the ☰ menu's **Settings** item (disabled today, "coming in step 16"). It opens a dialog, as in the prototype (§8: no `/settings` route in Phase 0).

### The fields, in the prototype's order and with its labels verbatim (L340–386)

- **Thresholds.** The help text reads: "These encode judgment, not fact. Change them and re-run."
  - The prototype's 15 fields, **minus `aspectFrom` / `aspectTo`**: they're unused by the screen and hidden (§9.4; step 19 unifies the aspect targets).
  - So 13 fields: house site score and area, shelf score and area, compact site acres, garden score and area, frost-pocket height, shallow bedrock, winter sun hours, canopy allowance, road grade warning, and DEM cell size (1–30 m).
- **Driveway unit costs.** The help text reads: "Blue Ridge 2026 rough rates; edit to your excavator's numbers. The estimate is shown as ±30%." The fields are the 10 unit costs, with the same labels.
- **Drive-time anchors.** "One per line: `Name, lat, lon`." It's the same text format; stored as the port's `{ name, lat, lon }[]`.
- **Data endpoints.** "Edit if a service moves. Parcel services are tried in order until one returns a feature." It's a JSON editor over the port's endpoints object, keeping its `_v` (now 11).
- **Time zone (new in the port, B5):** the night sky's civil time (step 17), default `America/New_York`. It's a select of the browser's IANA zones (`Intl.supportedValuesOf("timeZone")`).

### Saving

- **Save validates every field before it saves** (deviation from the prototype). The prototype stored an empty field as 0 and garbage as `NaN`, with no checks (L1625).
  - **Ranges:** numbers must be finite. Scores are 0–100, as their labels say. DEM cell size is 1–30, as its label says. Everything else is ≥ 0. A bad field is marked in place, and Save stays disabled until it's fixed.
  - **Anchors:** lines that don't parse are listed. The prototype silently dropped them at use (L467).
  - **Endpoints:** must parse as JSON and match the schema, or the dialog says what's wrong.
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

`parcelscreen-YYYY-MM-DD.json` holds:

```
{ app: "parcelscreen", v: 1, exportedAt, cfg: UserConfig, parcels: <ps.parcels store>, screens: <their kept screens> }
```

- `parcels` is the `{v: 2, open, built[]}` store History already keeps, which is REQUIREMENTS §3a's versioned contract.
- `screens` are the IndexedDB records listed in those parcels' `screenIds`, so the results come back with them.

### Import

- **A port file:** History merges in parcels whose `key` isn't already there, and their screens. It then asks "Also import the settings from this file?" (the prototype's question, L1609), and on yes replaces them through the same validation as Save. The hints are "Imported N parcels" / "That file isn't a Parcel Screen export" (verbatim).
- **A prototype export** (`{ cfg, saved[] }`, L1605):
  - **Each saved parcel becomes a History parcel** from its boundary (`geo`, `props`) and house: a boundary source "saved parcel", its name and notes. No result comes with it, as in the prototype, where reopening never restored a result: it selected the boundary and you pressed Run (L1602).
  - **Its `cfg` converts** to the port's shape:
    - anchors text → objects;
    - the endpoints JSON string → object, through the `_v` migration;
    - the prototype-only `_res3` dropped.

    Then it's validated. Without the conversion it would fail the port's strict schema and load as all defaults.

### Doesn't this pre-empt Phase 1?

No. Phase 1's importer reads `ps.parcels` on first sign-in (REQUIREMENTS §3a), so a file imported here simply arrives in Phase 1 as History. PLAN.md's Phase 1 "import screen" for prototype exports can reuse 16b's converter.

## 3. Files

| File | What |
| --- | --- |
| `components/Settings/SettingsDialog.tsx` | The dialog: the four sections plus the time zone; validation in place; Reset / Cancel / Save |
| `lib/client/settingsForm.ts` (pure) | Form ↔ `UserConfig`: parse and validate each field, anchors text ↔ objects, endpoints JSON ↔ object. Node-tested. |
| `components/Explore/ExploreShell.tsx` | The config becomes state with a setter; Save updates it |
| `components/Explore/Menu.tsx` | Settings enabled; Export file / Import file under History |
| `lib/client/exportFile.ts` (pure) | Build and read the port's file; convert a prototype export (parcels and `cfg`). Zod-checked. Node-tested. |
| `lib/client/screenStore.ts` | `getScreens(ids)` / `putScreens(records)` for export and import |
| `docs/plans/phase-0.md` | Corrects the config row's "`_v: 10`" to 11 |

No new dependency.

## 4. PRs

1. **16a, Settings:** the dialog, validation, Reset / Cancel / Save, the live config and the time zone.
2. **16b, Export / import:** the port's file (parcels, screens, settings), prototype exports converted, and the merge and hints.

## 5. Checks

- **Unit:**
  - each field's parse and its range;
  - anchors text ↔ objects;
  - endpoints JSON with the `_v` migration;
  - Reset gives `DEFAULT_USER_CONFIG`;
  - a prototype `cfg` (the real L415–456 defaults with `_res3`) converts and validates;
  - a prototype export's saved parcels become History parcels;
  - the port's file round-trips: export → import into an empty store gives the same parcels and screens.
- **Fixture:** changing a threshold and re-running changes the result. Ferney Creek with `houseMin` raised gives fewer house sites, and the step 10 parity runs with the defaults are unchanged.
- **Headless:**
  - a save changes the next run, and the open parcel shows "These results used earlier settings.";
  - a bad field disables Save;
  - Reset then Save restores the defaults;
  - export, clear storage, import: History and its results come back.
- **§7b:** "Settings: edits persist and change the next run; Reset; endpoints JSON with `_v` migration", plus export/import.

## 6. Questions

1. **Q1 Validation ranges.** Finite numbers; scores 0–100; DEM cell size 1–30; everything else ≥ 0. Anything tighter (e.g. canopy ≤ 15°) would be inventing limits.
   - *Recommended: just these, which the labels themselves state.*
2. **Q2 Reset.** Fills the dialog with the defaults, kept on Save (fixing the prototype's stale cost fields), rather than saving at once.
   - *Recommended: yes.*
3. **Q3 Export shape.** §9.3 said "the prototype's exact JSON export shape". The port's parcels carry more than the prototype's records could (pieces, splits, notes, kept results), so an export in the prototype's shape would lose them.
   - *Recommended:* the port's own file for export, and **reading** prototype exports on import, so nothing saved in the prototype is lost.
4. **Q4 Imported prototype parcels** arrive without results, to be run, as the prototype's Open did. *Recommended: yes.*
