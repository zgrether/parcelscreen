# Grade distribution at engine 6: the study re-run

The parcels of `grade-distribution.md` (engine 4), screened again with today's rules after Batch A's
A3 and A3b. Report only. Reproduce: `STUDY_DIR=tmp/study-e6 pnpm study:grades`, then the report stage with
`PREV_DIR` set to the earlier run. The first run's findings, proposals and caveats stay in `grade-distribution.md`.

## 10. Since the last run: engine 4 → engine 6

The same 27 parcels, screened again with today's rules. Same selection (the seeded draws find the same
parcels), so every difference is the engine's.

| Grades | n | A | B | C | D | F | A or B |
|---|---|---|---|---|---|---|---|
| #1 site, engine 4 | 27 | 0% | 56% | 41% | 4% | 0% | 56% |
| #1 site, engine 6 | 27 | 30% | 48% | 19% | 4% | 0% | 78% |
| Every ranked site, engine 4 | 149 | 0% | 19% | 74% | 4% | 2% | 19% |
| Every ranked site, engine 6 | 149 | 7% | 50% | 39% | 3% | 1% | 56% |

Median #1 score: 65 → 72. 16 of 27 parcels' #1 changed grade.

| Parcel | #1 at engine 4 | #1 at engine 6 |
|---|---|---|
| ferney-creek-52-47A (Floyd County, VA) | B 79 | A 82 |
| macks-mountain-35-3 (Floyd County, VA) | C 62 | B 65 |
| grayson-mud-creek-6273 (Grayson County, VA) | C 58 | C 61 |
| 7-77A (Floyd County, VA) | C 54 | C 61 |
| 17-47A (Floyd County, VA) | B 67 | B 72 |
| 41-54A (Floyd County, VA) | B 78 | A 82 |
| 11-13 (Floyd County, VA) | B 69 | B 73 |
| 40-A-31 (Carroll County, VA) | B 70 | A 80 |
| 52-A-17A (Carroll County, VA) | B 67 | A 80 |
| 80-A-39 (Carroll County, VA) | B 70 | A 81 |
| 11-A-60A (Carroll County, VA) | B 66 | B 76 |
| 1446 (Grayson County, VA) | C 52 | C 54 |
| 10051 (Grayson County, VA) | B 69 | A 80 |
| 8606 (Grayson County, VA) | B 71 | B 73 |
| 977 (Grayson County, VA) | C 64 | B 67 |
| 152983103734 (Ashe County, NC) | C 59 | B 72 |
| 022060149723 (Ashe County, NC) | C 63 | B 72 |
| 013010813620 (Ashe County, NC) | B 66 | A 82 |
| 062063002686 (Ashe County, NC) | B 65 | B 70 |
| 2923-28-2294-000 (Watauga County, NC) | C 62 | B 77 |
| 2915-11-1151-000 (Watauga County, NC) | D 46 | D 47 |
| 2914-75-6357-000 (Watauga County, NC) | C 57 | C 55 |
| 1984-49-9744-000 (Watauga County, NC) | B 65 | C 63 |
| 3060222403 (Alleghany County, NC) | B 67 | A 81 |
| 3070512437 (Alleghany County, NC) | B 70 | B 72 |
| 4909453479 (Alleghany County, NC) | C 63 | B 69 |
| 3040264659 (Alleghany County, NC) | C 63 | B 75 |

## Grades at engine 6

| | n | A | B | C | D | F |
|---|---|---|---|---|---|---|
| Overall grade, #1 site | 27 | 30% | 48% | 19% | 4% | 0% |
| Overall grade, every ranked site | 149 | 7% | 50% | 39% | 3% | 1% |
| Quality alone (qGrade), #1 site | 27 | 78% | 22% | 0% | 0% | 0% |
| Cost alone (100 − cost), #1 site | 27 | 0% | 22% | 19% | 30% | 30% |

## Per factor at engine 6 (#1 sites)

| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |
|---|---|---|---|---|---|---|---|---|---|---|
| Sun (Dec direct share × 100) | 27 | 69.0 | 73.0 | 86.0 | 92.4 | 94.0 | 7.3 | 16 | 70% / 30% / 0% / 0% / 0% |  |
| Aspect | 27 | 44.0 | 47.2 | 93.0 | 100 | 100 | 18.9 | 17 | 78% / 4% / 4% / 15% / 0% |  |
| Frost (height above the valley floor) | 27 | 75.0 | 84.4 | 100 | 100 | 100 | 7.6 | 12 | 89% / 11% / 0% / 0% / 0% |  |
| Slope | 27 | 76.0 | 81.0 | 90.0 | 100 | 100 | 6.6 | 15 | 96% / 4% / 0% / 0% / 0% |  |
| Sky (per parcel) | 27 | 46.0 | 47.0 | 61.0 | 70.0 | 73.0 | 8.2 | 20 | 0% / 33% / 48% / 19% / 0% |  |
| Septic (NRCS rating) | 27 | 20.0 | 20.0 | 40.0 | 40.0 | 40.0 | 9.9 | 2 | 0% / 0% / 44% / 0% / 56% | **2 values** |
| Foundation (NRCS rating) | 27 | 0.0 | 0.0 | 0.0 | 10.0 | 25.0 | 7.1 | 3 | 74% / 0% / 19% / 0% / 7% | **74% at 0.0** |
| Rock (bedrock < 100 cm) | 27 | 0.0 | 0.0 | 0.0 | 11.0 | 15.0 | 5.0 | 7 | 70% / 4% / 0% / 7% / 19% | **70% at 0.0** |
| Pad (slope) | 27 | 0.0 | 0.1 | 2.0 | 3.8 | 15.0 | 2.8 | 24 | 96% / 0% / 0% / 0% / 4% |  |
| Driveway | 27 | 1.1 | 8.1 | 13.6 | 38.5 | 40.0 | 11.4 | 26 | 11% / 44% / 15% / 7% / 22% |  |
| Quality (total) | 27 | 67.0 | 77.0 | 85.0 | 88.4 | 90.0 | 5.2 | 13 | 78% / 22% / 0% / 0% / 0% |  |
| Cost index (total) | 27 | 29.0 | 31.6 | 55.0 | 92.8 | 100 | 22.8 | 22 | 0% / 22% / 19% / 30% / 30% |  |
| Score | 27 | 47.0 | 58.6 | 72.0 | 81.4 | 82.0 | 9.3 | 17 | 30% / 48% / 19% / 4% / 0% |  |

| Part | Values (points: share of #1 sites) |
|---|---|
| Septic (NRCS rating) | 20.0: 44%, 40.0: 56% |
| Foundation (NRCS rating) | 0.0: 74%, 10.0: 19%, 25.0: 7% |
| Rock (bedrock < 100 cm) | 0.0: 70%, 3.5: 4%, 8.4: 7%, 10.3: 7%, 11.9: 4%, 13.3: 4%, 15.0: 4% |
| Pad (slope) | 0.0: 11%, 0.1: 7%, 0.8: 4%, 1.0: 4%, 1.2: 11%, 1.4: 4%, 1.6: 4%, 1.9: 4%, 2.0: 4%, 2.4: 7%, 2.6: 4%, 2.7: 4%, 2.8: 4%, 2.9: 7%, 3.1: 4%, 3.4: 4%, 3.7: 4%, 3.9: 7%, 15.0: 4% |
| Driveway | 1.1: 4%, 7.0: 4%, 7.8: 4%, 8.2: 4%, 8.4: 4%, 8.6: 4%, 8.7: 4%, 9.5: 4%, 9.7: 4%, 10.3: 4%, 11.9: 4%, 12.4: 4%, 13.4: 4%, 13.6: 4%, 13.8: 4%, 14.9: 4%, 15.8: 4%, 17.4: 4%, 18.8: 4%, 20.2: 4%, 25.7: 4%, 30.2: 4%, 34.6: 4%, 38.4: 4%, 38.5: 4%, 40.0: 7% |

## How the factors move together at engine 6

| | sun | aspect | frost | slope | sky | septic | foundation | rock | pad | driveway |
|---|---|---|---|---|---|---|---|---|---|---|
| **sun** | 1 | 0.08 | 0.07 | -0.01 | **0.56** | -0.43 | **-0.51** | -0.05 | -0.14 | -0.17 |
| **aspect** | 0.08 | 1 | 0.27 | -0.16 | -0.03 | -0.18 | -0.16 | -0.41 | 0.12 | -0.08 |
| **frost** | 0.07 | 0.27 | 1 | 0.09 | -0.02 | -0.20 | -0.42 | **-0.54** | -0.02 | **-0.59** |
| **slope** | -0.01 | -0.16 | 0.09 | 1 | -0.00 | 0.12 | -0.10 | 0.07 | **-0.78** | -0.30 |
| **sky** | **0.56** | -0.03 | -0.02 | -0.00 | 1 | -0.31 | -0.40 | -0.07 | -0.21 | -0.11 |
| **septic** | -0.43 | -0.18 | -0.20 | 0.12 | -0.31 | 1 | 0.36 | 0.49 | 0.06 | 0.37 |
| **foundation** | **-0.51** | -0.16 | -0.42 | -0.10 | -0.40 | 0.36 | 1 | 0.23 | 0.16 | 0.19 |
| **rock** | -0.05 | -0.41 | **-0.54** | 0.07 | -0.07 | 0.49 | 0.23 | 1 | 0.17 | 0.35 |
| **pad** | -0.14 | 0.12 | -0.02 | **-0.78** | -0.21 | 0.06 | 0.16 | 0.17 | 1 | 0.39 |
| **driveway** | -0.17 | -0.08 | **-0.59** | -0.30 | -0.11 | 0.37 | 0.19 | 0.35 | 0.39 | 1 |
