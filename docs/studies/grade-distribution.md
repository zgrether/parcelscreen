# Grade distribution study (report only)

Batch A, before A3 (owner, 2026-10-09). How Parcel Screen's site grades spread over real parcels in the six counties
the household is looking in, which factors carry the ranking, which barely vary, and what could replace them.
**No scoring code changes here**; A3 decides what to change.

- **Data:** 27 parcels, screened 2026-10-09 with today's rules (engine 4) and default settings.
- **Reproduce:** `pnpm study:grades` (live; picks and screens into `tmp/study/`), then `STAGE=report pnpm study:grades`
  (offline; writes this file). Tool: `test/tools/grade-study.test.ts`, `gradeStudyReport.ts`, `gradeStudySim.ts`,
  `gradeStudyDoc.ts`. The numbers in the prose are computed by the same run.
- **Your History:** not included. It lives in your browser's IndexedDB, which I can't read. Export it
  (History › Export) to `tmp/study/history.json` and I'll add those parcels to the next run.

## 1. Your gut grades first

Grade these 9 before opening anything below: the rest of this file shows the tool's grades. They were
picked evenly through the tool's ranking, so they cover its whole range, and are listed by parcel ID so their order
gives nothing away. Open each point in the app (tap the parcel there), or on the map links. A–F, with a note if you
like; then tell me (or edit this table in the PR) and I'll fill in §8.

| # | County | Parcel | Acres | Point | Maps | Your grade | Your note |
|---|---|---|---|---|---|---|---|
| G1 | Ashe County, NC | 022060149723 | 17.4 | 36.4854, -81.51117 | [satellite](https://www.google.com/maps/@36.4854,-81.51117,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.4854&mlon=-81.51117#map=16/36.4854/-81.51117) |  |  |
| G2 | Ashe County, NC | 062063002686 | 36.0 | 36.55707, -81.51843 | [satellite](https://www.google.com/maps/@36.55707,-81.51843,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.55707&mlon=-81.51843#map=16/36.55707/-81.51843) |  |  |
| G3 | Grayson County, VA | 10051 | 65.5 | 36.57704, -81.14046 | [satellite](https://www.google.com/maps/@36.57704,-81.14046,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.57704&mlon=-81.14046#map=16/36.57704/-81.14046) |  |  |
| G4 | Watauga County, NC | 2914-75-6357-000 | 18.1 | 36.31825, -81.65649 | [satellite](https://www.google.com/maps/@36.31825,-81.65649,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.31825&mlon=-81.65649#map=16/36.31825/-81.65649) |  |  |
| G5 | Watauga County, NC | 2915-11-1151-000 | 93.7 | 36.33153, -81.67827 | [satellite](https://www.google.com/maps/@36.33153,-81.67827,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.33153&mlon=-81.67827#map=16/36.33153/-81.67827) |  |  |
| G6 | Watauga County, NC | 2923-28-2294-000 | 97.4 | 36.3007, -81.64068 | [satellite](https://www.google.com/maps/@36.3007,-81.64068,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.3007&mlon=-81.64068#map=16/36.3007/-81.64068) |  |  |
| G7 | Alleghany County, NC | 3060222403 | 84.6 | 36.48717, -81.16717 | [satellite](https://www.google.com/maps/@36.48717,-81.16717,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.48717&mlon=-81.16717#map=16/36.48717/-81.16717) |  |  |
| G8 | Carroll County, VA | 40-A-31 | 97.8 | 36.81074, -80.61567 | [satellite](https://www.google.com/maps/@36.81074,-80.61567,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.81074&mlon=-80.61567#map=16/36.81074/-80.61567) |  |  |
| G9 | Floyd County, VA | ferney-creek-52-47A (fixture) | 43.9 | 36.8874, -80.45455 | [satellite](https://www.google.com/maps/@36.8874,-80.45455,700m/data=!3m1!1e3) · [OSM](https://www.openstreetmap.org/?mlat=36.8874&mlon=-80.45455#map=16/36.8874/-80.45455) |  |  |

<details>
<summary><b>The study</b> (open after grading)</summary>

## 2. Findings in brief

1. **No #1 site grades A; 56% are B and 41% C.** Scores
   run 46–79 (median 65). Quality alone would make 67% of
   them A (median 82), but cost alone is an F for 81% (median cost index 72
   of 100). With the 70/30 split an A needs quality ≈ 86+ **and** cost ≤ 35: none of these parcels gets there.
2. **The septic term is near-constant:** 23 of 27 #1 sites take the full 40 points ("Very limited"). NRCS's
   reasons: "Seepage, bottom layer" on 15, the map unit's slope (8 to >15%) on
   17, shallow bedrock (100–180 cm) on 5. **Foundation** is at its
   25-point maximum on 17, almost all for the map unit's slope.
3. **Slope is counted three times:** in quality (slope), in cost (pad), and again inside both NRCS ratings through the
   map unit's representative slope (median 21%, while the lidar bench itself is 13%). Slope and pad correlate
   at −0.62 by construction, slope and foundation at −0.52.
4. **Using the site's own slope in the NRCS ratings changes little** (what-if A): the benches are 8–20% —
   still inside NRCS's 8–15% ramp — and seepage or bedrock keeps most septic ratings at the maximum.
5. **The sky term barely discriminates:** every parcel is 20.75–21.59 mag/arcsec², and 24 of 27 take the
   full 25-point light-dome penalty because its "full" threshold (w = 3) is met by almost any town 30–60 km south.
   Sky scores land at 32–59: C or D for everyone.
6. **Frost and slope sit near their ceilings** (93% and 89% A-band), as expected: the site search
   already prefers benches above the valley floor. They act as penalties for the exceptions, which is their job.
7. **Fixing the soil inputs lifts grades but doesn't spread them** (what-if B: 4% / 78% / 15% / 4% / 0% for A/B/C/D/F). The
   spread is limited by quality's narrow range. Any grade letter that's meant to separate these parcels needs
   cutoffs calibrated on them, which is what your gut grades are for (§7).

## 3. The parcels and how each was chosen

Six counties: Floyd, Carroll and Grayson (VA); Ashe, Watauga and Alleghany (NC). In each, points were drawn with a
fixed seed (the county's FIPS code) inside the Census TIGER county outline; the county parcel record under each
point was kept if it was 5–100 acres and not already kept, until four were kept. Plus the three fixtures (screened
from their recordings, so they equal `expected.json`; Macks Mountain falls in Floyd County by the Census outline).
Parcel IDs only; no owner names.

| # | County | Parcel | Acres | How chosen | Sites | #1 grade, score | Verdict | Steps failed |
|---|---|---|---|---|---|---|---|---|
| 1 | Floyd County, VA | ferney-creek-52-47A | 43.9 | a reference fixture (screened from its recordings; equals expected.json) | 5 | B 79 | ok | none |
| 2 | Floyd County, VA | macks-mountain-35-3 | 292 | a reference fixture (screened from its recordings; equals expected.json) | 8 | C 62 | marginal | none |
| 3 | Grayson County, VA | grayson-mud-creek-6273 | 30.1 | a reference fixture (screened from its recordings; equals expected.json) | 4 | C 58 | marginal | none |
| 4 | Floyd County, VA | 7-77A | 12.0 | random point #1 (seed 51063) inside the county; the parcel under it is 12.0 ac | 4 | C 54 | marginal | none |
| 5 | Floyd County, VA | 17-47A | 35.3 | random point #3 (seed 51063) inside the county; the parcel under it is 35.3 ac | 8 | B 67 | marginal | none |
| 6 | Floyd County, VA | 41-54A | 25.1 | random point #4 (seed 51063) inside the county; the parcel under it is 25.1 ac | 5 | B 78 | marginal | none |
| 7 | Floyd County, VA | 11-13 | 13.4 | random point #7 (seed 51063) inside the county; the parcel under it is 13.4 ac | 4 | B 69 | marginal | none |
| 8 | Carroll County, VA | 40-A-31 | 97.8 | random point #2 (seed 51035) inside the county; the parcel under it is 97.8 ac | 8 | B 70 | marginal | none |
| 9 | Carroll County, VA | 52-A-17A | 13.1 | random point #7 (seed 51035) inside the county; the parcel under it is 13.1 ac | 2 | B 67 | marginal | none |
| 10 | Carroll County, VA | 80-A-39 | 67.5 | random point #9 (seed 51035) inside the county; the parcel under it is 67.5 ac | 5 | B 70 | ok | none |
| 11 | Carroll County, VA | 11-A-60A | 22.5 | random point #12 (seed 51035) inside the county; the parcel under it is 22.5 ac | 7 | B 66 | marginal | padus, driveway |
| 12 | Grayson County, VA | 1446 | 52.2 | random point #5 (seed 51077) inside the county; the parcel under it is 52.2 ac | 3 | C 52 | marginal | none |
| 13 | Grayson County, VA | 10051 | 65.5 | random point #8 (seed 51077) inside the county; the parcel under it is 65.5 ac | 8 | B 69 | marginal | padus |
| 14 | Grayson County, VA | 8606 | 65.3 | random point #9 (seed 51077) inside the county; the parcel under it is 65.3 ac | 8 | B 71 | marginal | none |
| 15 | Grayson County, VA | 977 | 44.4 | random point #13 (seed 51077) inside the county; the parcel under it is 44.4 ac | 5 | C 64 | marginal | none |
| 16 | Ashe County, NC | 152983103734 | 29.6 | random point #5 (seed 37009) inside the county; the parcel under it is 29.6 ac | 6 | C 59 | marginal | none |
| 17 | Ashe County, NC | 022060149723 | 17.4 | random point #10 (seed 37009) inside the county; the parcel under it is 17.4 ac | 3 | C 63 | marginal | none |
| 18 | Ashe County, NC | 013010813620 | 67.1 | random point #11 (seed 37009) inside the county; the parcel under it is 67.1 ac | 8 | B 66 | marginal | none |
| 19 | Ashe County, NC | 062063002686 | 36.0 | random point #12 (seed 37009) inside the county; the parcel under it is 36.0 ac | 5 | B 65 | marginal | none |
| 20 | Watauga County, NC | 2923-28-2294-000 | 97.4 | random point #1 (seed 37189) inside the county; the parcel under it is 97.4 ac | 8 | C 62 | marginal | none |
| 21 | Watauga County, NC | 2915-11-1151-000 | 93.7 | random point #3 (seed 37189) inside the county; the parcel under it is 93.7 ac | 2 | D 46 | marginal | none |
| 22 | Watauga County, NC | 2914-75-6357-000 | 18.1 | random point #8 (seed 37189) inside the county; the parcel under it is 18.1 ac | 5 | C 57 | marginal | none |
| 23 | Watauga County, NC | 1984-49-9744-000 | 47.7 | random point #9 (seed 37189) inside the county; the parcel under it is 47.7 ac | 4 | B 65 | marginal | none |
| 24 | Alleghany County, NC | 3060222403 | 84.6 | random point #6 (seed 37005) inside the county; the parcel under it is 84.6 ac | 8 | B 67 | marginal | none |
| 25 | Alleghany County, NC | 3070512437 | 7.5 | random point #8 (seed 37005) inside the county; the parcel under it is 7.5 ac | 3 | B 70 | marginal | none |
| 26 | Alleghany County, NC | 4909453479 | 93.3 | random point #11 (seed 37005) inside the county; the parcel under it is 93.3 ac | 7 | C 63 | marginal | none |
| 27 | Alleghany County, NC | 3040264659 | 63.5 | random point #12 (seed 37005) inside the county; the parcel under it is 63.5 ac | 6 | C 63 | marginal | driveway |

<details><summary>Every draw, kept or not (the selection log)</summary>

```
fixture ferney-creek-52-47A: 43.88 ac
fixture macks-mountain-35-3: 292.01 ac
fixture grayson-mud-creek-6273: 30.15 ac
Floyd County, VA #1 37.05409,-80.25887: KEPT parcel 7-77A, 12.0 ac; 4 sites, #1 C 54; failed []; 23 s
Floyd County, VA #2 36.83374,-80.28226: outside the county outline
Floyd County, VA #3 37.03162,-80.29569: KEPT parcel 17-47A, 35.3 ac; 8 sites, #1 B 67; failed []; 24 s
Floyd County, VA #4 36.94933,-80.38994: KEPT parcel 41-54A, 25.1 ac; 5 sites, #1 B 78; failed []; 20 s
Floyd County, VA #5 36.91063,-80.56187: parcel 49-9, 117.2 ac, outside 5–100 ac
Floyd County, VA #6 36.99301,-80.61645: outside the county outline
Floyd County, VA #7 37.08177,-80.12199: KEPT parcel 11-13, 13.4 ac; 4 sites, #1 B 69; failed []; 23 s
Carroll County, VA #1 36.90861,-80.89588: outside the county outline
Carroll County, VA #2 36.81074,-80.61567: KEPT parcel 40-A-31, 97.8 ac; 8 sites, #1 B 70; failed []; 37 s
Carroll County, VA #3 36.69589,-80.8606: parcel 94-A-325, 4.9 ac, outside 5–100 ac
Carroll County, VA #4 36.6552,-80.59327: parcel 3812-80, 214.0 ac, outside 5–100 ac
Carroll County, VA #5 36.67749,-81.0042: outside the county outline
Carroll County, VA #6 36.87786,-80.7723: outside the county outline
Carroll County, VA #7 36.80047,-80.73988: KEPT parcel 52-A-17A, 13.1 ac; 2 sites, #1 B 67; failed []; 58 s
Carroll County, VA #8 36.7848,-80.68863: parcel 53-A-88, 107.6 ac, outside 5–100 ac
Carroll County, VA #9 36.74829,-80.81988: KEPT parcel 80-A-39, 67.5 ac; 5 sites, #1 B 70; failed []; 71 s
Carroll County, VA #10 36.8428,-80.5623: outside the county outline
Carroll County, VA #11 36.57776,-80.91256: outside the county outline
Carroll County, VA #12 36.86579,-80.65914: KEPT parcel 11-A-60A, 22.5 ac; 7 sites, #1 B 66; failed [padus, driveway]; 28 s
Grayson County, VA #1 36.62282,-81.49436: parcel 0, 4299.9 ac, outside 5–100 ac
Grayson County, VA #2 36.75613,-81.37123: outside the county outline
Grayson County, VA #3 36.79293,-81.14267: outside the county outline
Grayson County, VA #4 36.78118,-80.89519: outside the county outline
Grayson County, VA #5 36.67047,-81.29192: KEPT parcel 1446, 52.2 ac; 3 sites, #1 C 52; failed []; 39 s
Grayson County, VA #6 36.5846,-81.37042: parcel 8931, 163.7 ac, outside 5–100 ac
Grayson County, VA #7 36.80217,-81.26281: outside the county outline
Grayson County, VA #8 36.57704,-81.14046: KEPT parcel 10051, 65.5 ac; 8 sites, #1 B 69; failed [padus]; 41 s
Grayson County, VA #9 36.64172,-81.10872: KEPT parcel 8606, 65.3 ac; 8 sites, #1 B 71; failed []; 39 s
Grayson County, VA #10 36.75099,-80.8949: outside the county outline
Grayson County, VA #11 36.77345,-81.25818: outside the county outline
Grayson County, VA #12 36.69684,-81.48153: parcel 0, 31678.6 ac, outside 5–100 ac
Grayson County, VA #13 36.63518,-81.18854: KEPT parcel 977, 44.4 ac; 5 sites, #1 C 64; failed []; 27 s
Ashe County, NC #1 36.42152,-81.31532: parcel 143918807364, 1.1 ac, outside 5–100 ac
Ashe County, NC #2 36.31849,-81.72313: outside the county outline
Ashe County, NC #3 36.50031,-81.44662: parcel 182081111970, 260.9 ac, outside 5–100 ac
Ashe County, NC #4 36.34829,-81.71286: outside the county outline
Ashe County, NC #5 36.2817,-81.43757: KEPT parcel 152983103734, 29.6 ac; 6 sites, #1 C 59; failed []; 26 s
Ashe County, NC #6 36.58802,-81.69519: outside the county outline
Ashe County, NC #7 36.44795,-81.26929: outside the county outline
Ashe County, NC #8 36.57398,-81.49723: parcel 062063577681, 149.6 ac, outside 5–100 ac
Ashe County, NC #9 36.30068,-81.25934: outside the county outline
Ashe County, NC #10 36.4854,-81.51117: KEPT parcel 022060149723, 17.4 ac; 3 sites, #1 C 63; failed []; 42 s
Ashe County, NC #11 36.4791,-81.31816: KEPT parcel 013010813620, 67.1 ac; 8 sites, #1 B 66; failed []; 40 s
Ashe County, NC #12 36.55707,-81.51843: KEPT parcel 062063002686, 36.0 ac; 5 sites, #1 B 65; failed []; 42 s
Watauga County, NC #1 36.3007,-81.64068: KEPT parcel 2923-28-2294-000, 97.4 ac; 8 sites, #1 C 62; failed []; 26 s
Watauga County, NC #2 36.36325,-81.62183: outside the county outline
Watauga County, NC #3 36.33153,-81.67827: KEPT parcel 2915-11-1151-000, 93.7 ac; 2 sites, #1 D 46; failed []; 25 s
Watauga County, NC #4 36.15039,-81.62528: parcel 2829-92-0463-000, 2005.6 ac, outside 5–100 ac
Watauga County, NC #5 36.38243,-81.61333: outside the county outline
Watauga County, NC #6 36.28018,-81.76638: parcel 1983-31-0760-000, 145.7 ac, outside 5–100 ac
Watauga County, NC #7 36.34068,-81.4852: outside the county outline
Watauga County, NC #8 36.31825,-81.65649: KEPT parcel 2914-75-6357-000, 18.1 ac; 5 sites, #1 C 57; failed []; 25 s
Watauga County, NC #9 36.3277,-81.76416: KEPT parcel 1984-49-9744-000, 47.7 ac; 4 sites, #1 B 65; failed []; 26 s
Alleghany County, NC #1 36.44811,-81.11471: parcel 3978797387, 144.0 ac, outside 5–100 ac
Alleghany County, NC #2 36.45868,-80.98326: parcel 4919601462, 153.6 ac, outside 5–100 ac
Alleghany County, NC #3 36.44368,-81.27596: outside the county outline
Alleghany County, NC #4 36.48202,-81.08686: no parcel (services.nconemap.gov: no parcel at this point; vginmaps.vdem.virginia.gov: no parcel at this point; geoviewer.cot.tn.gov: no parcel at this point)
Alleghany County, NC #5 36.49236,-80.99101: parcel 4010220455, 325.0 ac, outside 5–100 ac
Alleghany County, NC #6 36.48717,-81.16717: KEPT parcel 3060222403, 84.6 ac; 8 sites, #1 B 67; failed []; 25 s
Alleghany County, NC #7 36.51526,-81.32938: outside the county outline
Alleghany County, NC #8 36.48374,-81.12585: KEPT parcel 3070512437, 7.5 ac; 3 sites, #1 B 70; failed []; 25 s
Alleghany County, NC #9 36.46704,-81.12821: parcel 3979208827, 271.7 ac, outside 5–100 ac
Alleghany County, NC #10 36.55078,-80.92889: parcel 4032527752, 213.1 ac, outside 5–100 ac
Alleghany County, NC #11 36.47163,-81.02406: KEPT parcel 4909453479, 93.3 ac; 7 sites, #1 C 63; failed []; 27 s
Alleghany County, NC #12 36.49842,-81.23441: KEPT parcel 3040264659, 63.5 ac; 6 sites, #1 C 63; failed [driveway]; 23 s
```

</details>

## 4. Grades

| | n | A | B | C | D | F |
|---|---|---|---|---|---|---|
| Overall grade, #1 site | 27 | 0% | 56% | 41% | 4% | 0% |
| Overall grade, every ranked site | 149 | 0% | 19% | 74% | 4% | 2% |
| Quality alone (qGrade), #1 site | 27 | 67% | 33% | 0% | 0% | 0% |
| Cost alone (100 − cost), #1 site | 27 | 0% | 4% | 4% | 11% | 81% |

Score percentiles of the #1 sites: p20 59, p40 63, p60 67, p80 70.

## 5. Per factor

The factors as stored on each parcel's #1 site (`sites[0].q.*` and `.c.*`). "A / B / C / D / F" is the share of
parcels whose factor lands in each grade band on the app's absolute cutoffs (80/65/50/35): quality factors on their
0–100 score, cost parts as 100 − points × 100 / max (0 points is 100). **Near-constant** flags a factor with two or
fewer values, one value on 70%+ of parcels, or a spread under 5% of its scale.

### #1 sites

| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |
|---|---|---|---|---|---|---|---|---|---|---|
| Sun (Dec direct share × 100) | 27 | 67.0 | 71.4 | 86.0 | 93.0 | 94.0 | 8.1 | 17 | 74% / 26% / 0% / 0% / 0% |  |
| Aspect | 27 | 41.0 | 44.6 | 92.0 | 100 | 100 | 20.5 | 19 | 70% / 7% / 4% / 19% / 0% |  |
| Frost (height above the valley floor) | 27 | 75.0 | 86.8 | 100 | 100 | 100 | 7.0 | 11 | 93% / 7% / 0% / 0% / 0% |  |
| Slope | 27 | 67.0 | 80.2 | 90.0 | 97.2 | 100 | 7.4 | 17 | 89% / 11% / 0% / 0% / 0% |  |
| Sky (per parcel) | 27 | 32.0 | 39.0 | 50.0 | 57.0 | 59.0 | 7.2 | 20 | 0% / 0% / 56% / 37% / 7% |  |
| Septic (NRCS rating) | 27 | 20.0 | 23.0 | 40.0 | 40.0 | 40.0 | 6.7 | 3 | 0% / 0% / 11% / 4% / 85% | **85% at 40.0** |
| Foundation (NRCS rating) | 27 | 0.0 | 10.0 | 25.0 | 25.0 | 25.0 | 7.9 | 4 | 4% / 0% / 33% / 0% / 63% |  |
| Rock (bedrock < 100 cm) | 27 | 0.0 | 0.0 | 0.0 | 15.0 | 15.0 | 6.6 | 2 | 74% / 0% / 0% / 0% / 26% | **2 values** |
| Pad (slope) | 27 | 0.0 | 0.5 | 2.4 | 15.0 | 15.0 | 4.8 | 22 | 81% / 4% / 0% / 0% / 15% |  |
| Driveway | 27 | 0.0 | 1.0 | 6.5 | 24.8 | 40.0 | 11.1 | 25 | 59% / 7% / 11% / 11% / 11% |  |
| Quality (total) | 27 | 66.0 | 74.6 | 82.0 | 86.4 | 87.0 | 5.2 | 14 | 67% / 33% / 0% / 0% / 0% |  |
| Cost index (total) | 27 | 35.0 | 57.0 | 72.0 | 99.4 | 100 | 17.3 | 18 | 0% / 4% / 4% / 11% / 81% |  |
| Score | 27 | 46.0 | 55.8 | 65.0 | 70.4 | 79.0 | 7.1 | 17 | 0% / 56% / 41% / 4% / 0% |  |

### Every ranked site

| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |
|---|---|---|---|---|---|---|---|---|---|---|
| Sun (Dec direct share × 100) | 149 | 31.0 | 73.0 | 83.0 | 92.0 | 94.0 | 9.2 | 33 | 73% / 23% / 3% / 1% / 1% |  |
| Aspect | 149 | 41.0 | 45.8 | 86.0 | 100 | 100 | 20.7 | 47 | 58% / 15% / 11% / 16% / 0% |  |
| Frost (height above the valley floor) | 149 | 70.0 | 83.6 | 100 | 100 | 100 | 7.4 | 23 | 93% / 7% / 0% / 0% / 0% |  |
| Slope | 149 | 53.0 | 58.0 | 81.0 | 96.0 | 100 | 14.1 | 45 | 54% / 22% / 24% / 0% / 0% |  |
| Sky (per parcel) | 149 | 32.0 | 39.0 | 51.0 | 57.0 | 59.0 | 6.5 | 20 | 0% / 0% / 63% / 33% / 4% |  |
| Septic (NRCS rating) | 149 | 20.0 | 40.0 | 40.0 | 40.0 | 40.0 | 4.3 | 3 | 0% / 0% / 4% / 1% / 95% | **95% at 40.0** |
| Foundation (NRCS rating) | 149 | 0.0 | 10.0 | 25.0 | 25.0 | 25.0 | 5.2 | 4 | 1% / 0% / 12% / 0% / 87% | **87% at 25.0** |
| Rock (bedrock < 100 cm) | 149 | 0.0 | 0.0 | 0.0 | 15.0 | 15.0 | 7.1 | 2 | 66% / 0% / 0% / 0% / 34% | **2 values** |
| Pad (slope) | 149 | 0.0 | 0.8 | 4.7 | 15.0 | 15.0 | 6.5 | 68 | 46% / 4% / 0% / 0% / 50% |  |
| Driveway | 149 | 0.0 | 2.0 | 12.7 | 30.1 | 40.0 | 11.0 | 133 | 36% / 21% / 18% / 10% / 15% |  |
| Quality (total) | 149 | 18.0 | 71.8 | 79.0 | 84.2 | 88.0 | 9.0 | 26 | 46% / 50% / 1% / 1% / 1% |  |
| Cost index (total) | 149 | 35.0 | 67.0 | 92.0 | 100 | 100 | 14.1 | 43 | 0% / 1% / 1% / 5% / 93% |  |
| Score | 149 | 19.0 | 51.0 | 58.0 | 67.0 | 79.0 | 7.7 | 33 | 0% / 19% / 74% / 4% / 2% |  |

### The cost parts' values

| Part | Values (points: share of #1 sites) |
|---|---|
| Septic (NRCS rating) | 20.0: 11%, 25.0: 4%, 40.0: 85% |
| Foundation (NRCS rating) | 0.0: 4%, 10.0: 30%, 12.0: 4%, 25.0: 63% |
| Rock (bedrock < 100 cm) | 0.0: 74%, 15.0: 26% |
| Pad (slope) | 0.0: 7%, 0.1: 4%, 0.7: 4%, 0.8: 4%, 1.2: 11%, 1.4: 4%, 1.6: 4%, 1.9: 4%, 2.0: 7%, 2.4: 7%, 2.7: 4%, 2.8: 7%, 2.9: 4%, 3.1: 4%, 3.6: 4%, 3.9: 4%, 4.2: 4%, 15.0: 15% |
| Driveway | 0.0: 7%, 0.7: 4%, 1.1: 4%, 2.3: 4%, 2.6: 4%, 3.5: 4%, 4.4: 4%, 4.6: 4%, 4.8: 4%, 5.1: 4%, 5.9: 4%, 6.1: 4%, 6.5: 4%, 6.8: 4%, 7.1: 4%, 11.8: 4%, 13.1: 4%, 16.8: 4%, 18.6: 4%, 18.9: 4%, 20.6: 4%, 21.5: 4%, 24.0: 4%, 26.2: 4%, 40.0: 7% |

### Raw inputs (#1 sites)

| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |
|---|---|---|---|---|---|---|---|---|---|---|
| Dec direct sun / daylight | 27 | 0.7 | 0.7 | 0.9 | 0.9 | 0.9 | 0.1 | 17 |  |  |
| Slope (°) | 27 | 4.6 | 6.4 | 7.6 | 9.2 | 11.3 | 1.3 | 27 |  |  |
| Aspect off 160° (°) | 27 | 2.1 | 24.6 | 46.3 | 141 | 167 | 44.5 | 27 |  |  |
| Above the valley floor (ft) | 27 | 84.9 | 161 | 302 | 664 | 1372 | 278 | 27 |  |  |
| Driveway (ft) | 25 | 72.8 | 244 | 681 | 1529 | 4039 | 880 | 25 |  |  |
| Site acres | 27 | 0.2 | 0.4 | 1.7 | 10.5 | 18.8 | 4.7 | 27 |  |  |

## 6. How the factors move together

Pearson's r across the #1 sites (|r| ≥ 0.5 in bold). With 27 parcels, |r| under about 0.38 isn't distinguishable
from zero.

| | sun | aspect | frost | slope | sky | septic | foundation | rock | pad | driveway |
|---|---|---|---|---|---|---|---|---|---|---|
| **sun** | 1 | 0.01 | -0.01 | 0.02 | 0.17 | -0.01 | -0.05 | 0.14 | -0.20 | -0.04 |
| **aspect** | 0.01 | 1 | 0.31 | -0.13 | 0.13 | -0.03 | -0.05 | -0.08 | -0.25 | -0.07 |
| **frost** | -0.01 | 0.31 | 1 | 0.10 | 0.06 | -0.27 | -0.41 | -0.32 | 0.06 | -0.47 |
| **slope** | 0.02 | -0.13 | 0.10 | 1 | -0.27 | -0.23 | **-0.52** | -0.43 | **-0.62** | 0.07 |
| **sky** | 0.17 | 0.13 | 0.06 | -0.27 | 1 | -0.05 | 0.38 | -0.10 | -0.07 | -0.40 |
| **septic** | -0.01 | -0.03 | -0.27 | -0.23 | -0.05 | 1 | 0.46 | 0.24 | -0.01 | -0.07 |
| **foundation** | -0.05 | -0.05 | -0.41 | **-0.52** | 0.38 | 0.46 | 1 | 0.12 | 0.06 | -0.20 |
| **rock** | 0.14 | -0.08 | -0.32 | -0.43 | -0.10 | 0.24 | 0.12 | 1 | 0.48 | 0.25 |
| **pad** | -0.20 | -0.25 | 0.06 | **-0.62** | -0.07 | -0.01 | 0.06 | 0.48 | 1 | 0.00 |
| **driveway** | -0.04 | -0.07 | -0.47 | 0.07 | -0.40 | -0.07 | -0.20 | 0.25 | 0.00 | 1 |

| Factor | r with score (#1 sites) | r with score (every site) |
|---|---|---|
| Sun (Dec direct share × 100) | 0.35 | 0.48 |
| Aspect | 0.40 | 0.32 |
| Frost (height above the valley floor) | 0.63 | 0.47 |
| Slope | 0.42 | 0.27 |
| Sky (per parcel) | 0.28 | 0.21 |
| Septic (NRCS rating) | -0.50 | -0.21 |
| Foundation (NRCS rating) | -0.45 | -0.32 |
| Rock (bedrock < 100 cm) | -0.56 | -0.29 |
| Pad (slope) | -0.50 | -0.46 |
| Driveway | -0.45 | -0.23 |

Reading it: **slope, pad and foundation are one signal** (pad is a function of slope; foundation's NRCS rating is
mostly the map unit's slope). **Frost and driveway** pull against each other (−0.47): higher benches have longer
driveways. Sun, aspect and sky are independent of everything else here.

## 7. Proposals

### Near-constant factors, and replacements from the soil properties

**Septic (85% at the maximum).** The NRCS class is a three-step summary of a fuzzy rating whose value is also 1.0 for
almost every site, so the continuous value doesn't help either. The limiting features underneath do vary:

| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |
|---|---|---|---|---|---|---|---|---|---|---|
| NRCS septic rating value (0 = not limited … 1 = very limited) | 27 | 0.5 | 0.8 | 1.0 | 1.0 | 1.0 | 0.2 | 2 |  | **2 values** |
| NRCS dwellings-w/o-basements rating value | 27 | 0.0 | 0.4 | 1.0 | 1.0 | 1.0 | 0.3 | 4 |  |  |
| Depth to bedrock, min (cm) | 9 | 48.0 | 58.4 | 81.0 | 117 | 127 | 23.8 | 7 |  |  |
| Depth to any restriction (cm) | 7 | 61.0 | 73.0 | 94.0 | 119 | 127 | 19.8 | 6 |  |  |
| Ksat, slowest layer above 150 cm (µm/s) | 27 | 0.0 | 0.0 | 9.0 | 28.0 | 28.0 | 9.1 | 7 |  |  |
| Map unit's representative slope (%) | 27 | 8.0 | 11.0 | 21.0 | 37.0 | 45.0 | 11.1 | 12 |  |  |

| NRCS septic class (#1 site) | parcels | median rating value | median bedrock (cm) | median restriction (cm) | median Ksat (µm/s) | median unit slope (%) |
|---|---|---|---|---|---|---|
| Somewhat limited | 3 | 0.5 | — | — | 9.0 | 11.0 |
| Very limited | 24 | 1.0 | 81.0 | 94.0 | 9.0 | 23.0 |

Proposed replacement (what-if B below): septic points = 40 × the worst of
- NRCS's own limitation values other than slope, each already 0–1 and graded by the soil property behind it:
  depth to bedrock or another restriction, slow water movement (the slowest layer's Ksat), large stones, filtering
  capacity;
- **the bench's lidar slope** through NRCS's slope ramp (8% → 0, 15% → 1), not the map unit's;
- "seepage, bottom layer" (fast lower layers: a design and setback issue more than a no) at **half** weight, shown
  as a note.

The properties in the table above (depth, Ksat, slope) are what those values are built from; using NRCS's values
keeps its thresholds rather than inventing ours.

**Foundation (63% at the maximum).** Drop the slope part (already in quality's slope and cost's pad); keep NRCS's
other limits (large stones, bedrock, wetness, shrink-swell).

**Rock (two values).** Scale by depth: 15 points at ≤ 50 cm to 0 at ≥ 150 cm, instead of 15 below 100 cm and 0 above.

**Sky's dome penalty (full for 24 of 27).** Saturate at w = 8 (the worst seen here) instead of w = 3, so a
town 30 km south costs more than one 60 km south.

### What those would do (report only)

Each what-if re-costs the #1 site from its stored parts; other sites aren't re-ranked.
**A:** the site's lidar slope in place of the map unit's in both NRCS ratings, rock by depth.
**B:** A, plus seepage at half weight, no slope in foundation, and the dome penalty full at w = 8.

| | A | B | C | D | F |
|---|---|---|---|---|---|
| Today | 0% | 56% | 41% | 4% | 0% |
| What-if A | 0% | 59% | 37% | 4% | 0% |
| What-if B | 4% | 78% | 15% | 4% | 0% |

| Parcel | Site / unit slope (%) | NRCS septic limits besides slope | Septic today → A → B | Foundation today → B | Rock today → A | Sky today → B | Cost today → B | Score, grade today → B |
|---|---|---|---|---|---|---|---|---|
| ferney-creek-52-47A | 11.6 / 11 | slope only | 20 → 21.4 → 21.4 | 10 → 0.0 | 0 → 0.0 | 55 → 67 | 36 → 27 | 79 B → 83 A |
| macks-mountain-35-3 | 14.4 / 21 | depth to bedrock, seepage, bottom layer, large stones | 40 → 40.0 → 40.0 | 25 → 23.6 | 15 → 15.0 | 54 → 65 | 95 → 94 | 62 C → 63 C |
| grayson-mud-creek-6273 | 19.9 / 45 | depth to bedrock | 40 → 40.0 → 40.0 | 25 → 0.0 | 15 → 8.4 | 59 → 73 | 100 → 68 | 58 C → 68 B |
| 7-77A | 14.0 / 11 | seepage, bottom layer | 40 → 40.0 → 35.2 | 10 → 0.0 | 15 → 11.9 | 42 → 55 | 100 → 82 | 54 C → 61 C |
| 17-47A | 9.5 / 11 | seepage, bottom layer | 40 → 40.0 → 20.0 | 10 → 0.0 | 0 → 0.0 | 39 → 53 | 67 → 37 | 67 B → 78 B |
| 41-54A | 13.3 / 11 | slope only | 20 → 31.5 → 31.5 | 10 → 0.0 | 0 → 0.0 | 53 → 68 | 35 → 37 | 78 B → 79 B |
| 11-13 | 12.5 / 11 | seepage, bottom layer | 40 → 40.0 → 27.9 | 10 → 0.0 | 15 → 11.9 | 48 → 60 | 73 → 48 | 69 B → 78 B |
| 40-A-31 | 14.6 / 30 | slope only | 40 → 38.0 → 38.0 | 25 → 0.0 | 0 → 0.0 | 54 → 64 | 68 → 41 | 70 B → 79 B |
| 52-A-17A | 13.9 / 30 | slope only | 40 → 34.9 → 34.9 | 25 → 0.0 | 0 → 0.0 | 43 → 55 | 72 → 42 | 67 B → 78 B |
| 80-A-39 | 12.2 / 11 | slope only | 20 → 26.5 → 26.5 | 10 → 0.0 | 0 → 0.0 | 40 → 49 | 71 → 68 | 70 B → 72 B |
| 11-A-60A | 12.2 / 30 | depth to bedrock | 40 → 30.9 → 30.9 | 25 → 1.2 | 0 → 3.5 | 56 → 69 | 67 → 38 | 66 B → 76 B |
| 1446 | 17.4 / 45 | seepage, bottom layer, depth to bedrock, filtering capacity | 40 → 40.0 → 40.0 | 25 → 7.1 | 15 → 10.3 | 32 → 47 | 99 → 77 | 52 C → 60 C |
| 10051 | 16.0 / 20 | slope only | 40 → 40.0 → 40.0 | 25 → 0.0 | 0 → 0.0 | 51 → 62 | 70 → 45 | 69 B → 77 B |
| 8606 | 14.9 / 11 | seepage, bottom layer | 40 → 40.0 → 39.3 | 10 → 0.0 | 0 → 0.0 | 50 → 63 | 59 → 48 | 71 B → 76 B |
| 977 | 14.0 / 25 | depth to bedrock | 40 → 40.0 → 40.0 | 25 → 0.0 | 15 → 8.4 | 58 → 70 | 90 → 58 | 64 C → 75 B |
| 152983103734 | 12.7 / 20 | slope only | 40 → 28.9 → 28.9 | 25 → 0.0 | 0 → 0.0 | 52 → 59 | 93 → 57 | 59 C → 70 B |
| 022060149723 | 13.1 / 35 | seepage, bottom layer | 25 → 40.0 → 30.5 | 12 → 0.0 | 0 → 0.0 | 50 → 61 | 54 → 47 | 63 C → 66 B |
| 013010813620 | 13.3 / 35 | slope only | 40 → 31.9 → 31.9 | 25 → 0.0 | 0 → 0.0 | 57 → 71 | 73 → 40 | 66 B → 78 B |
| 062063002686 | 8.1 / 12 | seepage, bottom layer | 40 → 40.0 → 20.0 | 10 → 0.0 | 0 → 0.0 | 48 → 64 | 69 → 39 | 65 B → 76 B |
| 2923-28-2294-000 | 11.6 / 23 | seepage, bottom layer, depth to bedrock | 40 → 40.0 → 37.6 | 25 → 0.0 | 0 → 5.4 | 45 → 54 | 79 → 57 | 62 C → 69 B |
| 2915-11-1151-000 | 14.5 / 23 | depth to bedrock, seepage, bottom layer | 40 → 40.0 → 40.0 | 25 → 22.5 | 15 → 13.3 | 39 → 46 | 100 → 96 | 46 D → 48 D |
| 2914-75-6357-000 | 15.7 / 40 | large stones, seepage, bottom layer | 40 → 40.0 → 40.0 | 25 → 25.0 | 0 → 0.0 | 50 → 56 | 90 → 90 | 57 C → 58 C |
| 1984-49-9744-000 | 12.1 / 12 | large stones, seepage, bottom layer | 40 → 40.0 → 40.0 | 25 → 25.0 | 0 → 0.0 | 46 → 46 | 69 → 69 | 65 B → 65 B |
| 3060222403 | 14.3 / 23 | slope only | 40 → 36.4 → 36.4 | 25 → 0.0 | 0 → 0.0 | 52 → 67 | 74 → 45 | 67 B → 77 B |
| 3070512437 | 10.7 / 8 | seepage, bottom layer | 40 → 40.0 → 20.0 | 0 → 0.0 | 0 → 0.0 | 33 → 47 | 59 → 39 | 70 B → 78 B |
| 4909453479 | 13.4 / 18 | seepage, bottom layer | 40 → 40.0 → 32.0 | 25 → 0.0 | 0 → 0.0 | 49 → 61 | 67 → 34 | 63 C → 74 B |
| 3040264659 | 16.5 / 35 | seepage, bottom layer | 40 → 40.0 → 40.0 | 25 → 0.0 | 0 → 0.0 | 57 → 70 | 74 → 49 | 63 C → 72 B |

### Absolute or relative cutoffs, per factor

"Absolute": fixed thresholds on the physical quantity, the same for every parcel and every year. "Relative": bands
by percentile among the parcels in your library, so a grade means "better than most of what we've looked at".

| Factor | Proposal | Why |
|---|---|---|
| Sun | Absolute | December hours of direct sun are physical, and they spread (67–94). |
| Aspect | Absolute | A south face is south anywhere. |
| Frost | Absolute | It's a hollow penalty; near-ceiling scores are the point. |
| Slope | Absolute | Construction cost follows degrees, not rank. |
| Sky | Absolute, re-anchored | The sky is the same everywhere in this region; a relative scale would invent differences of 0.8 mag. Fix the dome saturation instead. |
| Septic, foundation, rock | Absolute, continuous | Soil limits are physical; make them continuous so they separate parcels (above). |
| Pad, driveway | Absolute | They're dollars. |
| **The overall grade** | **Absolute, but calibrated once** on this set and your gut grades, then fixed | Relative grades would shift as the library grows (an A today becomes a B after a good find). Today's 80/65/50/35 were never calibrated: on these parcels nothing reaches 80. Calibrate them to where your grades fall, and show a parcel's rank in the library separately. |

## 8. Your grades against the tool's

*Pending your grades in §1.* When they're in, this section reports exact matches, within-one-letter matches, the
rank correlation (Spearman) between your order and the tool's, and for each disagreement the factor that moved the
tool most. Then the cutoffs that would best match your letters, for A3.

<details><summary>The tool's grades for G1–G9 (open after grading)</summary>

| # | Parcel | Tool's #1 grade, score | Quality | Cost index | What-if B |
|---|---|---|---|---|---|
| G1 | 022060149723 | C 63 | 70 | 54 | B 66 |
| G2 | 062063002686 | B 65 | 80 | 69 | B 76 |
| G3 | 10051 | B 69 | 85 | 70 | B 77 |
| G4 | 2914-75-6357-000 | C 57 | 77 | 90 | C 58 |
| G5 | 2915-11-1151-000 | D 46 | 66 | 100 | D 48 |
| G6 | 2923-28-2294-000 | C 62 | 79 | 79 | B 69 |
| G7 | 3060222403 | B 67 | 85 | 74 | B 77 |
| G8 | 40-A-31 | B 70 | 86 | 68 | B 79 |
| G9 | ferney-creek-52-47A | B 79 | 86 | 36 | A 83 |

</details>

## 9. Per-parcel soil under the #1 site

| # | County | Parcel | #1 soil | Septic class (value) | Dwellings class (value) | Bedrock / restriction (cm) | Ksat min (µm/s) | Unit slope (%) | Site slope (°) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Floyd County, VA | ferney-creek-52-47A | Glenelg | Somewhat limited (0.50) | Somewhat limited (0.37) | — / — | 9.00 | 11 | 6.6 |
| 2 | Floyd County, VA | macks-mountain-35-3 | Marbleyard | Very limited (1.00) | Very limited (1.00) | 48 / 91 lithic bedrock | 0.01 | 21 | 8.2 |
| 3 | Grayson County, VA | grayson-mud-creek-6273 | Pigeonroost | Very limited (1.00) | Very limited (1.00) | 94 / 94 paralithic bedrock | 0.01 | 45 | 11.3 |
| 4 | Floyd County, VA | 7-77A | Edneytown | Very limited (1.00) | Somewhat limited (0.37) | 71 / — | 9.00 | 11 | 8.0 |
| 5 | Floyd County, VA | 17-47A | Tate | Very limited (1.00) | Somewhat limited (0.37) | — / — | 9.00 | 11 | 5.4 |
| 6 | Floyd County, VA | 41-54A | Glenelg | Somewhat limited (0.50) | Somewhat limited (0.37) | — / — | 9.00 | 11 | 7.6 |
| 7 | Floyd County, VA | 11-13 | Edneytown | Very limited (1.00) | Somewhat limited (0.37) | 71 / — | 9.00 | 11 | 7.1 |
| 8 | Carroll County, VA | 40-A-31 | Chester | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 30 | 8.3 |
| 9 | Carroll County, VA | 52-A-17A | Chester | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 30 | 7.9 |
| 10 | Carroll County, VA | 80-A-39 | Chester | Somewhat limited (0.50) | Somewhat limited (0.37) | — / — | 9.00 | 11 | 7.0 |
| 11 | Carroll County, VA | 11-A-60A | Myersville | Very limited (1.00) | Very limited (1.00) | 127 / 127 paralithic bedrock | 7.00 | 30 | 7.0 |
| 12 | Grayson County, VA | 1446 | Peaks | Very limited (1.00) | Very limited (1.00) | 81 / 81 lithic bedrock | 0.00 | 45 | 9.9 |
| 13 | Grayson County, VA | 10051 | Glenelg | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 20 | 9.1 |
| 14 | Grayson County, VA | 8606 | Edneytown | Very limited (1.00) | Somewhat limited (0.37) | — / — | 9.00 | 11 | 8.5 |
| 15 | Grayson County, VA | 977 | Pigeonroost | Very limited (1.00) | Very limited (1.00) | 94 / 94 paralithic bedrock | 0.01 | 25 | 7.9 |
| 16 | Ashe County, NC | 152983103734 | Evard | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 20 | 7.2 |
| 17 | Ashe County, NC | 022060149723 | Edneyville | Very limited (1.00) | Very limited (1.00) | — / — | 28.00 | 35 | 7.4 |
| 18 | Ashe County, NC | 013010813620 | Watauga | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 35 | 7.6 |
| 19 | Ashe County, NC | 062063002686 | Tusquitee | Very limited (1.00) | Somewhat limited (0.63) | — / — | 28.00 | 12 | 4.6 |
| 20 | Watauga County, NC | 2923-28-2294-000 | Porters | Very limited (1.00) | Very limited (1.00) | 114 / 114 paralithic bedrock | 0.04 | 23 | 6.6 |
| 21 | Watauga County, NC | 2915-11-1151-000 | Burton | Very limited (1.00) | Very limited (1.00) | 61 / 61 lithic bedrock | 0.03 | 23 | 8.3 |
| 22 | Watauga County, NC | 2914-75-6357-000 | Cullasaja | Very limited (1.00) | Very limited (1.00) | — / — | 28.00 | 40 | 8.9 |
| 23 | Watauga County, NC | 1984-49-9744-000 | Cullasaja | Very limited (1.00) | Very limited (1.00) | — / — | 28.00 | 12 | 6.9 |
| 24 | Alleghany County, NC | 3060222403 | Watauga | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 23 | 8.1 |
| 25 | Alleghany County, NC | 3070512437 | Chester | Very limited (1.00) | Not limited (0.00) | — / — | 9.00 | 8 | 6.1 |
| 26 | Alleghany County, NC | 4909453479 | Chester | Very limited (1.00) | Very limited (1.00) | — / — | 9.00 | 18 | 7.6 |
| 27 | Alleghany County, NC | 3040264659 | Chandler | Very limited (1.00) | Very limited (1.00) | — / — | 28.00 | 35 | 9.4 |

## 10. Caveats

- 27 parcels is enough to see which factors don't vary and which move together; not enough to estimate small
  correlations (|r| < 0.38) or tail behaviour.
- One draw per county, 5–100 acres; no parcel over 100 acres except the Macks fixture (292 ac).
- Some runs had a failed step (shown in §3); a failed PAD-US or driveway step doesn't change site scores, but a
  failed driveway route leaves #1's driveway at its straight-line estimate.
- The soil properties are the dominant major component of the map unit under #1's point (SDA), at map-unit scale.
- The what-ifs re-cost #1 only and don't re-rank, and use NRCS's slope ramp as these map units report it.

</details>
