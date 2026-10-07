# Step 17: the ground viewer (plan)

Status: **draft, for approval.** It replaces the 3D walkthrough plan of `phase-0.md` §3d and step 17 (owner decision, 2026-10-07, §9.12 there).

**The decision:** with 13g and step 15, the map covers the aerial side of the prototype's 3D walkthrough:

- tilted terrain;
- draped surfaces;
- pins;
- the horizon fan;
- soils;
- the driveway.

Step 17 becomes a **ground-level viewer only**: stand at a point and see the sky.

Line numbers (L…) refer to `legacy/parcelscreen.html`.

## 1. The prototype's 3D, piece by piece

| Prototype | What it is | Proposed |
| --- | --- | --- |
| **Scene 1, "The land"** (L1857) | Turntable of the parcel block, aerial texture, the grey country around it to 6 km | **Covered by the 3D map** (13g terrain, rotate/tilt, the aerial basemap) |
| **Scene 2, "Where you could build"** (L1859) | House-suitability texture, pins, turntable around the chosen site | **Covered** (15a surface, 15b pins, both draped) |
| **Scene 3, "December sun"** (L1861) | Turntable with the moving sun's shadows on the terrain through Dec 21, time bar | **Split.** The sun's path and each hour's blocked/clear state go to the **ground viewer**. Moving terrain shadows on the map are **deferred** (follow-up 32). |
| **Scene 4, "From the house site"** (L1863) | Eye height at the site, Dec 21 arc, hour ticks red where the ridge blocks the sun, the view following the sun | **Kept**: the core of the ground viewer |
| **Scene 5, "Night sky"** (L1865) | Stars, zenith haze, horizon light domes, the galactic band for a month and hour, Milky Way fade, core label, caption | **Kept** |
| **Scene 6, "Under the surface"** (L1867) | Soil-depth walls at 10×: topsoil, subsoil, water-table band, bedrock | **Deferred, not deleted:** follow-up 31, in Phase 2.5 with the cost estimator |
| **Site chips** (`renderChips`, L1832; scenes 2–5) | Pick a site to turn around or stand at | **Covered** by the map's pins plus **"Stand here"** (§2). There are no chips in the viewer. |
| **Time bar** (L280, `buildTicks` L1846, `timeTick` L1847) | Sunrise → sunset over 24 s, scrub, play/pause, hour labels, solar clock | **Kept**, with Dec 21 / Mar 20 / Jun 21 presets. It drives the night sky too. |
| **Night sky** (`buildSky` L1786–1816, core and pole L1806, month/hour selects L274, L1883) | Galactic band placed by sidereal time; Milky Way fade with sky brightness | **Kept.** The time bar replaces the month and hour selects. |
| **Light domes** (L1790–1800) | Horizon glow per atlas direction, blended by maximum | **Kept**, at their azimuths from `sky.domes` |
| **Soil walls** (`buildWalls` L1689–1720) | The scene 6 cutaway | **Deferred**, follow-up 31 |
| Compass, zoom ±, tilt slider (L275, L270–284) | Camera controls | The map has its own compass (13g). The viewer gets drag to look around and a heading readout. |
| Day sky dome (L1784) | Sky background | **Kept** as the viewer's daytime background |
| 3D pins with HTML labels (L1715) | Pins in 3D | **Covered** (15b DOM pins on the terrain) |
| Aerial and overlay textures (L1747–1754) | Textures on the 3D block | **Covered** (the map's basemap and 15a surface) |
| B4 (3D fan with a fixed 3° canopy and the noon sun) | — | **Moot.** There's no 3D fan; the map fan uses the 2D rule. |
| B5 (night-sky date in the browser's time zone) | — | **Kept fixed:** times are civil time in `UserConfig.timeZone` |

## 2. The ground viewer

### Opening it

- **"Stand here" on the map,** next to the **evaluation ring**: the point where the report's sun, sky and driveway were computed.
  - **To stand at another site,** tap its pin first. That evaluates there (15b, not saved), and the ring moves.
  - The **bulls-eye** (house) works the same way: its tap takes the evaluation to the house, then Stand here.
- **A "See it from here" link** in the December sun section of the report, which opens the same viewer.
- **Phones:** the viewer opens full screen. **Desktop:** a large modal. Esc or × closes it.

### What it shows

It's an **eye-level window** onto the horizon around the point: drag to look around, with heading and altitude scales. The day and night views share it.

- **The skyline, from the screen's own horizon, not the 10 m map tiles:**
  - `result.sun.profile`: the skyline angle every 5°, at the evaluation point. That's the profile the report's direct-sun hours, the horizon chart and the map fan are computed from.
  - The **canopy allowance** (`params.canopyDeg`, 3° by default) is drawn as a band above it.
- **The sun's path** for a chosen date, with the **time bar**:
  - Presets: **Dec 21 / Mar 20 / Jun 21**.
  - At each whole hour (solar time, as in the prototype), the sun's position is marked **clear** (white) or **blocked** (red), by the engine's rule: skyline + canopy ≥ the sun's altitude at that azimuth.
  - The header gives that date's **direct-sun hours** (§3).
- **The night sky, the time bar driving it** through the night:
  - The **Milky Way's galactic band** comes from its core and the galactic north pole, by sidereal time at the point's longitude, with the hour as civil time in `UserConfig.timeZone` (B5).
  - Its **fade with sky brightness** is the prototype's: `((mag − 19.6) / 2.2)^1.6`.
  - The **light domes** sit at their azimuths, from `result.sky.domes`, with the prototype's dome shape and maximum blend (L1795).
  - The **zenith haze** comes from the atlas ratio. The **stars** are cosmetic (random, as in the prototype).
- **Captions:**
  - the prototype's scene 4 and scene 5 captions, word for word where they still hold;
  - scene 5's "the core sits N° above the horizon toward … the ridge there is …" uses the same profile.
- **Not in the viewer:**
  - a terrain mesh, textures, pins, soils, the fan or shadows (the map has them);
  - the 3D walkthrough's other scenes.

### It works from a kept result

Everything above is in `ScreenResult`:

- the evaluation point (`focus`, `point`);
- `sun.profile`, `params.canopyDeg`;
- `sky.mag`, `sky.ratio`, `sky.domes`, `sky.coreAlt`.

So the viewer opens after a reload or from History with **no re-run**. The 14d note "Run again to restore the map overlays, horizon fan and 3D view." becomes "Run again to restore the map overlays and horizon fan." (changed in 17a's code; the docs that quote it are updated here).

## 3. Where its numbers come from (owner rule)

Every number the viewer shows comes from the `ScreenResult`, or from the engine's own pure functions run on the result's own inputs. None is recomputed by other code.

- **Direct-sun hours.**
  - **Dec 21 and Jun 21:** shown from `sun.decDirectH` / `decDaylightH` and `junDirectH` / `junDaylightH`, the report's own.
  - **Mar 20:** computed by the engine's `sunHours(lat, horizon, 80, canopyDeg)` (lib/screen/sun.ts) on the same `sun.profile`. The result stores no March figure, so it's labelled "from this screen's skyline".
  - **Test:** the same call for Dec 21 and Jun 21 equals the stored hours exactly, on every golden, which proves the March figure uses the report's method.
- **Each hour's blocked/clear:** the same rule and the same `sunPos` (lib/screen/astro.ts) as `sunHours`. **Test:** counting the clear minutes reproduces the day's direct hours.
- **The skyline:** drawn from `sun.profile`'s points. **Test:** the drawn polygon's vertices are the profile.
- **The sky:**
  - **Brightness, zone and domes:** from `sky` as stored.
  - **The core's altitude and azimuth:** from `eqToHor` and `lstDeg` (astro.ts), as the engine's own `coreAlt` uses. **Test:** the peak altitude over the night equals `sky.coreAlt`.

**A correction to the brief:** the report's horizon is **not** from the 3 m lidar. It's computed on the screen's **30 m wide DEM** (3DEP `exportImage` over a 6 km radius; `config.ts` `sun.wideResM: 30`, sun.ts L139). The 3 m lidar covers only the parcel and a 150 m buffer, so it can't see a ridge a few kilometres off. The viewer uses **that same 30 m-derived profile**, so it agrees with the report exactly. (The 13g map tiles, at about 10 m, are finer than it, but would disagree with the report.)

## 4. Files

| File | What |
| --- | --- |
| `lib/render/ground.ts` (pure) | The eye-level projection (azimuth/altitude → screen), the skyline and canopy polygons from `sun.profile`, the sun's path and hour marks for a date, the night sky's band, domes and haze, all from the result. Node-tested. |
| `components/Ground/GroundViewer.tsx` | The modal or full-screen view: header (point, date, direct hours), canvas, drag to look, caption |
| `components/Ground/TimeBar.tsx` | Presets, scrub, play/pause, hour labels (day) and night hours |
| `components/Map/results/StandHere.tsx` | The "Stand here" button by the evaluation ring |
| `components/Results/blocks/DecemberSun.tsx` | "See it from here" (panel variant only; the print variant drops it, as `onMap` parts do) |

**Rendering:** a 2D canvas with an eye-level (rectilinear) projection, not WebGL (**Q1**).

- **What's drawn:** nothing needs 3D. The skyline is a profile, and the sky is a dome seen from its centre.
- **It's cheap:** no second WebGL context on phones, beside the map's.
- **Dependencies:** it drops `three` / react-three-fiber from the Phase 0 stack; nothing else uses them now.

## 5. PRs

1. **17a, the day:**
   - `lib/render/ground.ts` (projection, skyline, canopy band, sun path, hours);
   - the viewer with its time bar and the Dec 21 / Mar 20 / Jun 21 presets;
   - **Stand here** and **See it from here**;
   - the note's new wording;
   - the §3 tests.
2. **17b, the night:** the Milky Way band by sidereal time, the light domes and haze, stars, the night caption, the §3 sky tests, and the acceptance run.

## 6. Acceptance (replaces the §7b "3D" line)

- **Stand here** from the evaluation ring, after tapping a pin, and from the bulls-eye; **See it from here** from the report. It opens from a kept result after a reload, with no re-run.
- The skyline matches the horizon chart in December sun, with the canopy band above it.
- The Dec 21 and Jun 21 direct-sun hours equal the report's; Mar 20 is labelled.
- Hour marks are red where blocked and white where clear. The time bar plays and scrubs.
- **Night:**
  - the Milky Way moves with the hour;
  - it's faint under a bright sky;
  - domes sit at the atlas's bright azimuths;
  - the caption's core altitude and ridge agree with the view.
- Phone (full screen) and desktop (modal); drag to look.

## 7. Deferred

- **Follow-up 31, soil walls (Phase 2.5, with the cost estimator):**
  - scene 6's 10× cutaway: topsoil, subsoil, water-table band, bedrock, from NRCS (L1689–1720, L1867);
  - deferred, not deleted.
- **Follow-up 32, time-of-day shading on the 3D map (after Phase 0, optional):**
  - scene 3's moving terrain shadows, from the sun's position at a chosen hour;
  - MapLibre's hillshade takes a light direction, so this may be a small change.

## 8. Questions

1. **Q1 Rendering.** A 2D canvas eye-level view, or a react-three-fiber first-person view with a terrain mesh?
   - *Recommended: canvas*, because the skyline is a profile, numbers can't drift from it, it's light on phones, and `three` can leave the stack.
   - A WebGL view could add near terrain (from the 3 m DEM, live session only) later.
2. **Q2 Entry points.** *Recommended:* Stand here by the evaluation ring, and See it from here in December sun. Standing at another site is a pin tap (evaluates there, not saved), then Stand here.
3. **Q3 The skyline's source:** the screen's own horizon profile (30 m wide DEM, as the report), not the 3 m lidar (§3). *Recommended: yes*, for exact agreement.
4. **Q4 Night dates.** The time bar's presets (Dec 21 / Mar 20 / Jun 21) drive the night sky too. The prototype's month select allowed any month. *Recommended:* the three presets plus "today"; any month can follow if wanted.
