# Step 17: the ground viewer (plan)

Status: **approved as written (owner, 2026-10-07); decisions in §8; changes after the 17a review in §9.** It replaces the 3D walkthrough plan of `phase-0.md` §3d and step 17 (owner decision, 2026-10-07, §9.12 there).

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
  - **Drawn exactly as stored:** the 72 points of the 5° profile, joined by straight segments. It adds no detail the profile doesn't have: no smoothing, no interpolated peaks, no terrain between the points.
  - The **canopy allowance** (`params.canopyDeg`, 3° by default) is drawn as a band above it, along the same segments.
- **The date, for the day and the night:** presets **Dec 21 / Mar 20 / Jun 21 / today**, and a **date picker for any date**. The prototype allowed any month; Milky Way planning needs specific nights weeks out (owner, §8).
- **The sun's path** for the chosen date, with the **time bar**:
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
  - **Any other date** (Mar 20, today, or one picked): computed by the engine's `sunHours(lat, horizon, dayOfYear, canopyDeg)` (lib/screen/sun.ts) on the same stored `sun.profile`. The result stores no figure for them, so they're labelled "from this screen's skyline".
  - **Test:** the same call for Dec 21 and Jun 21 reproduces the stored hours exactly, on every golden. That proves every other date's figure uses the report's method.
- **Each hour's blocked/clear:** the same rule and the same `sunPos` (lib/screen/astro.ts) as `sunHours`. **Test:** counting the clear minutes reproduces the day's direct hours.
- **The skyline:** drawn from `sun.profile`'s points with straight segments. **Test:** the drawn polygon's vertices are exactly the profile's 72 points, and nothing else.
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
- **Dependencies:** react-three-fiber (and `three`) leave the Phase 0 stack when step 17 lands (owner, §8): neither is installed today, so 17's PR takes them off the fixed-stack lists in `CLAUDE.md` and `PLAN.md`.

## 5. PRs

1. **17a, the day:**
   - `lib/render/ground.ts` (projection, skyline, canopy band, sun path, hours);
   - the viewer with its time bar, the Dec 21 / Mar 20 / Jun 21 / today presets and the date picker;
   - **Stand here** and **See it from here**;
   - the note's new wording;
   - the §3 tests.
2. **17b, the night:** the Milky Way band by sidereal time, the light domes and haze, stars, the night caption, the §3 sky tests, and the acceptance run.

## 6. Acceptance (replaces the §7b "3D" line)

- **Stand here** from the evaluation ring, after tapping a pin, and from the bulls-eye; **See it from here** from the report. It opens from a kept result after a reload, with no re-run.
- The skyline matches the horizon chart in December sun, with the canopy band above it.
- The Dec 21 and Jun 21 direct-sun hours equal the report's; any other date (Mar 20, today, a picked date) is labelled as computed from the screen's skyline.
- The date picker takes any date, for the day and the night.
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
- **Follow-up 33, the moon (after Phase 0; owner, §8):**
  - the night view has no moon today, as in the prototype;
  - add its phase, rise and set, and position for the chosen date and hour, and its light washing out the Milky Way.
- **Follow-up 32, time-of-day shading on the 3D map (after Phase 0, optional):**
  - scene 3's moving terrain shadows, from the sun's position at a chosen hour;
  - MapLibre's hillshade takes a light direction, so this may be a small change.

## 8. Decisions (owner, 2026-10-07)

1. **Q1 Rendering:** a **2D canvas** eye-level view. React-three-fiber leaves when 17 lands.
2. **Q2 Entry points:** both. **Stand here** by the evaluation ring; **See it from here** in December sun. Standing at another site is a pin tap (evaluates there, not saved), then Stand here.
3. **Q3 Skyline source:** the **stored 30 m horizon profile** (`result.sun.profile`), as the report uses, not the 3 m lidar.
4. **Q4 Dates:** the presets Dec 21 / Mar 20 / Jun 21 / today, **and a date picker for any date**, day and night (dropping the prototype's any-month choice would be a regression). Hours for any non-stored date come from the engine's `sunHours` on the stored profile, under the reproduce-Dec/Jun test.
5. **The skyline** draws the stored 5° profile with straight segments between its points and adds no detail it doesn't have.
6. **The moon:** follow-up 33 (§7): phase, rise and set, and position in the night view.

## 9. After the 17a review (owner, 2026-10-07)

The first 17a cut drew only the report's skyline, as a silhouette. The owner found the prototype's terrain much better.

1. **A 3D eye-level spike was tried and dropped:** MapLibre's own terrain with the camera 2 m up. Distant ridges rendered well, but near the camera the ~10 m terrain broke into large slabs on every view, and draped aerial imagery smeared into vertical streaks.
2. **Ridges by distance (owner's option 1).**
   - **A fetch on open, a deviation from "no re-run, no fetch" (§2):** opening the viewer re-fetches the screen's own wide DEM, the parcel plus 6 km at 30 m, through the engine's `fetchDEM`. It isn't kept, like every DEM raster.
   - **The bands:** the skyline split into distance bands (0–½, ½–1½, 1½–3 and 3–6 km) with the engine's own march (`lib/render/ridges.ts`), painted far to near with haze.
   - **Fallback:** while the data loads, or if it can't be had, the viewer shows the plain skyline with a short note.
   - **Test:** the bands' envelope at the report's 5° points is the stored skyline exactly, on both fixtures.
3. **The bands aren't clipped to the report's skyline.**
   - Between the 5° points the 30 m terrain can rise above the report's straight line, and the view shows that.
   - **The caption says so:** "Shaded ridges are the full 30 m terrain; the white line is the report's 5° skyline, which can miss narrow peaks between samples."
   - Every number shown is still the report's.
4. **The projection is a cylindrical panorama:** x is azimuth, wrapping round 360°; y is altitude. This replaces the eye-level rectilinear projection (§4), which couldn't hold a June sun and the skyline together.
   - **One altitude scale** applies to everything drawn: terrain bands, skyline, canopy line, sun path and ticks.
   - **The scale:** linear from −5° to 30° over the lower 70% of the height, then compressed from 30° to 90° in the rest.
   - Grid lines are labelled at 0/10/20/30/45/60/90°.
   - **So the sun is always in frame,** for any date and hour.
   - Azimuth uses the linear part's pixels per degree. Drag pans azimuth.
5. **The foreground** (below 0°) is 10% of the height. It's lighter than before, and never darker than the nearest ridge band.
6. **The 5° sampling, measured.** The same 30 m data at 1° steps instead of 5° gives these direct-sun hours. It's follow-up 35: horizon sampling at 1°, which changes recorded numbers, so it waits until after Phase 0.

   | Site | Canopy | Dec 21 at 5° | at 1° | Δ | Jun 21 at 5° | at 1° | Δ |
   |---|---|---|---|---|---|---|---|
   | Ferney Creek 52-47A (VA) | 3° | 8.70 | 8.72 | +1 min | 13.80 | 13.80 | 0 |
   | Ferney Creek 52-47A (VA) | none | 9.35 | 9.35 | 0 | 14.37 | 14.37 | 0 |
   | Macks Mountain 35-3 (VA) | 3° | 8.33 | 8.33 | 0 | 12.98 | 12.98 | 0 |
   | Macks Mountain 35-3 (VA) | none | 8.93 | 8.93 | 0 | 13.52 | 13.52 | 0 |
   | Ashe Co. 022949922877 (NC) | 3° | 5.62 | 5.78 | +10 min | 12.12 | 12.10 | −1 min |
   | Ashe Co. 022949922877 (NC) | none | 5.93 | 6.08 | +9 min | 12.63 | 12.58 | −3 min |

   The change can go either way: the engine reads the nearest sample, so a coarse 5° sample can sit above or below the finer terrain.
