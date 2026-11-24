# NCDPI data pipeline — OSP district finance & student outcomes study

Automated extraction of district-level enrollment, finance and personnel data from the
[NC DPI Statistical Profile](https://www.dpi.nc.gov/districts-schools/district-operations/financial-and-business-services/demographics-and-finances),
plus integration of NC DPI's 2025–26 disaggregated End-of-Grade / End-of-Course performance
data. Together they replace the manual "pick a district, pick a year, open the table, export"
workflow and add the student-outcome endpoint needed for the epidemiological analysis.

**Finance deliverable: 30 districts × 21 fiscal years (FY2005–FY2025) = 630 rows, no gaps.**
**Outcomes deliverable: the same 30 districts, 2025–26, with 40 student subgroups and
54,990 district-level disaggregated rows, plus a one-row-per-district merged analysis file.**
**ROI: cost per proficient student** in the merged file and a third map view.
The 30 districts are the study panel supplied by Bob (10 large / 10 medium / 10 small by
OSP recipient count).

---

## What we found

There is **no directory of CSV files** to download and no public REST endpoint. The
Statistical Profile is an Oracle APEX application (`fbs_stat_prof`, app 145), fronted by
a Cloudflare managed challenge that rejects plain HTTP clients and headless/automated
browsers.

But the app exposes the whole dataset through **APEX interactive reports**, which support
a CSV export of *all rows* — not just the visible page:

| Table | APEX page | Shape | Extraction |
|---|---|---|---|
| **A6** Public School Personnel Summary | 110 | ~123,000 detail rows, all LEAs × all years | **22 filtered CSV downloads** (one per year) |
| **A7** Current Expenditures by Source of Funds | 114 | 15,827 rows, all LEAs × all years | **1 CSV download** |

A6's region is capped at 30,000 rows, so it is pulled one school year at a time (the
`Year` filter keeps each download ~2,000–5,700 rows). A7 fits under the cap in a single
request. This replaces roughly **1,260 per-record page loads with 23 downloads**.

## Fiscal year convention

The NCDPI app year code is the **ending** calendar year of the school year, and matches
NC's state fiscal year:

```
FY2005 -> school year 2004-05      FY2025 -> school year 2024-25
```

So Bob's "fiscal years 2005 through 2025" is exactly the app's `Year` 2005–2025 = 21
years. (A6 additionally has 2025-26, but A7 has not published 2025-26 yet, so it is
excluded to keep the panel balanced.)

The **outcomes** data is a single 2025–26 snapshot. Under the same convention it is one
year after the last finance year: school year 2025–26 = NCDPI year code 2026. The merged
analysis file labels the two endpoints explicitly (`fiscal_year_finance = 2025`,
`school_year_outcomes = 2025-26`) rather than pretending they are the same period.

## Field mapping

| Bob's field | Source | Definition used |
|---|---|---|
| ADM (Enrollment) | A7 | Final ADM shown in the blue title above the table |
| Total Expenditures | A7 | `Source Total`, **TOTAL** row |
| Total Per Pupil Expenditures | A7 | `Per Pupil Total`, TOTAL row, rounded half-up |
| Local Per Pupil Expenditures | A7 | `Per Pupil Local`, TOTAL row, rounded half-up |
| State Per Pupil Expenditures | A7 | `Per Pupil State`, TOTAL row, rounded half-up |
| Federal Per Pupil Expenditures | A7 | `Per Pupil Federal`, TOTAL row, rounded half-up |
| Grand Total Personnel | A6 | `Total Funds`, **Grand Total** |
| Total Teachers | A6 | Teachers, **Subtotal**, Total Funds |
| Total Admin | A6 | Administrators, Subtotal, Total Funds |
| Total Professionals | A6 | Professionals, Subtotal, Total Funds |
| Others | A6 | Others, Subtotal, Total Funds |

**Rounding:** per-pupil dollars use Bob's rule — cents `.50` and above round up, below
`.50` drop the cents (half-up). Expenditures and personnel counts are already whole
numbers.

### ADM note
ADM is not a column in the A7 CSV export, so it is recovered as
`round(SourceTotal ÷ PerPupilTotal)`. Because ADM is an integer and per-pupil is rounded
to cents, the residual never exceeds **0.31** across all 2,415 district-years, so the
rounded value is unambiguous. It was compared against the live `Final ADM` header field
on every validation sample and matched in all cases.

## Student outcomes (2025–26)

Source: NC DPI Office of Accountability and Testing, *Disaggregated State, Public School
Unit and School Level Performance Data for 2025–2026* (September 2026). The supplied files
are `Disag_2025-26/Disag_2025-26_Data.txt` (1,863,702 lines, 159 MB, tab-delimited) and
`Disag_2025-26/Disag_2025-26_Description.pdf` (code definitions). **The raw directory is
git-ignored** — it is large and re-obtainable from NCDPI; only the derived outputs are
committed.

The raw file mixes state, Public School Unit (PSU), and individual school rows. Our study
districts are the PSU rows whose `school_code` is `<3-digit LEA>LEA` (e.g. `920LEA` = Wake
County Schools). `build_outcomes.py` keeps **only those PSU rows** for the 30 study LEAs
(54,990 rows across ~1,833 subject × grade × assessment-type × subgroup cells per district).
School-level rows remain in the raw source if a within-district analysis is wanted later.

Each row has: `school_code, name, grade_span, subject, grade, type, subgroup, num_tested,
pct_notprof, pct_l3, pct_l4, pct_l5, pct_ccr, pct_glp, avg_score`. The headline outcomes
used on the map come from the `ALL / ALL / ALL / ALL` cell (all subjects, all grades, all
assessment types, all students):

* **GLP** — Grade-Level Proficient, achievement level 3 or above (`pct_glp`)
* **CCR** — College & Career Ready, achievement levels 4 and 5 (`pct_ccr`)
* `pct_notprof`, `pct_l3`, `pct_l4`, `pct_l5` are also retained and selectable.

`avg_score` is only reported for subject-specific regular assessments (not for the ALL
composite), so it is preserved in the tidy file but is not a headline map measure.

**Masking.** NCDPI suppresses percentages below 5% and above 95% (`<5` / `>95`, and `-`
for masked calculations). Masked cells are left blank in the numeric columns and the
original token is recorded in a `masked` field (e.g. `pct_l5:<5`). This matters most for
`pct_l5` (24,672 masked cells across the tidy file) and for small demographic subgroups —
it is why the site shows blank bars rather than invented values. Headline `pct_glp` and
`pct_ccr` are complete for all 30 districts.

**Subgroup coverage.** 40 subgroups are present in the source. The tidy file and
`docs/data/outcomes.json` keep all of them; the headline CSV and the site's subgroup
selector use a curated set of 19 (ALL, EDS/NOT_EDS, SWD/NOT_SWD, ELS/NOT_ELS, race,
sex, AIG/NOT_AIG, HMS, MIL). Not every small district has every subgroup — 535 of the
expected 570 district × subgroup cells are reported.

## Return on investment (ROI)

ROI is defined as **cost per proficient student**:

```
cpp_<subgroup> = FY2025 total per-pupil spending / (2025-26 pct_glp_<subgroup> / 100)
```

It answers "how many FY2025 dollars were spent for each student who reached grade-level
proficiency in 2025–26?" Lower is better. The merged file has one `cpp_` column for each
of the 19 curated subgroups, including `cpp_ALL`; all are whole dollars, and they are
blank where GLP is masked or zero. Across the 30 districts, `cpp_ALL` runs from
$15,152 (Union) to $62,494.

The website deliberately exposes only **two** ROI measures:

1. **All students** (`cpp_ALL`) — the main efficiency comparison.
2. **Excludes students with disabilities** (`cpp_NOT_SWD`) — $14,137 to $55,698 across
   the 30 districts.

The second measure still **includes English learners**. NC DPI does not publish an
intersection subgroup for "not disabled AND not English learner," so a true both-excluded
ROI cannot be computed from the aggregated file. Subgroup ROI is otherwise not shown:
district-wide spending divided by a subgroup's proficiency rate would assume every group
receives the same per-pupil spending, which is not true. Subgroup *rates* remain available
in Student outcomes mode and in the merged file.

This is an **efficiency ratio, not a causal estimate**. It divides one cross-sectional
spending measure by one cross-sectional outcome measure one year later; it does not
control for student need, district size, baseline achievement, or the timing of spending.
The site ranks districts from lowest cost upward, and its red color scale is relative to
each district's OSP-group median rather than to the full 30-district range (see
Interactive map below).

## Validation performed

* **67 district-years** re-fetched from the live per-record pages (109/113) and compared
  field by field: **67/67 exact, zero mismatches** (`data/validation_live_sample.json`).
  This includes **every one of the 30 study districts at FY2025**, the 10 large districts
  at FY2005, and a spread across 13 fiscal years (FY2005–FY2025) and 39 districts.
* A6 aggregation reproduces NCDPI's published subtotals exactly (e.g. Wake 2024-25:
  Admin 670 / Teachers 10,820 / Professionals 3,160 / Others 5,313 / Total 19,963).
* A6 and A7 both have **0 missing district-years** for all 115 NC districts.
* Every A6 year reconciles internally: position totals equal the sum of detail rows.
* The statewide aggregate row (LEA `999`) is removed so it can't double-count.

## Outputs

```
data/ncdpi_osp_30districts_fy2005_2025.csv    # 630 rows — the study extract
data/ncdpi_osp_30districts_fy2005_2025.xlsx   # + data_dictionary and coverage sheets
data/ncdpi_district_year_full.csv             # all 115 districts + charters, 5,093 rows (backup/superset)
data/ncdpi_district_year_full.xlsx            # + summary sheet
data/validation_summary_full.json             # coverage/integrity counts (finance)
data/validation_live_sample.json              # live page-vs-dataset spot checks
data/disag_2025_26_30districts_tidy.csv       # 54,990 rows — all PSU disaggregations
data/disag_2025_26_30districts_headline.csv   # 30 rows — ALL/ALL/ALL/ALL + subgroup GLP/CCR
data/osp_outcomes_merged_30districts.csv      # 30 rows — FY2025 finance + 2025-26 outcomes + ROI
data/osp_outcomes_merged_30districts.xlsx     # + data_dictionary and validation sheets
data/validation_outcomes.json                 # outcomes coverage/masking/integrity log
config/districts.csv                          # the 30 districts + group + selected flag
raw/a6_by_year/a6_<year>.csv                  # untouched source files (21)
raw/a7_expenditure_all.csv                    # untouched source file
Disag_2025-26/                                # raw outcomes source (local only, git-ignored)
```

The merged file is the analysis-ready endpoint: one row per district with OSP group,
FY2025 finance and personnel, 2025–26 GLP/CCR/achievement-level outcomes for all 30
districts and the curated subgroups, plus six disparity gaps
(`glp_gap_eds`, `glp_gap_swd`, `glp_gap_race` and their `ccr_` counterparts, computed as
advantaged minus disadvantaged in percentage points) and 19 cost-per-proficient-student
columns (`cpp_ALL` and 18 subgroup variants). Five districts lack at least one gap
because a comparison subgroup is suppressed or absent.

Study extract columns:

`district_group, lea_code, district_name, fiscal_year, school_year, adm,
total_expenditures, total_per_pupil, local_per_pupil, state_per_pupil, federal_per_pupil,
grand_total_personnel, total_teachers, total_admin, total_professionals, others,
source_a7, source_a6, retrieved_at`

`source_a7` / `source_a6` carry the exact APEX page and export URL and `retrieved_at`
is a UTC timestamp, so every row is traceable to its origin.

### Panel

| Group | Districts |
|---|---|
| Large | Wake (920), Charlotte-Mecklenburg (600), Guilford (410), Cumberland (260), Winston-Salem Forsyth (340), Union (900), Durham (320), Buncombe (110), Gaston (360), Onslow (670) |
| Medium | Northampton (660), Vance (910), Wilkes (970), Surry (860), Hertford (460), Davie (300), Bladen (090), Haywood (440), Greene (400), Warren (930) |
| Small | Avery (060), Hyde (480), Martin (580), Ashe (050), Camden (150), Clay (220), Gates (370), Swain (870), Alleghany (030), Tyrrell (890) |

To change the panel, edit `config/districts.csv` (set `selected` to `TRUE`/`FALSE`) and
re-run `build_osp_extract.py`.

## Reproducing

```bash
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/python extract_a7_bulk.py                       # 1 download
.venv/bin/python extract_a6_year.py 2005 2006 ... 2025    # 21 downloads
.venv/bin/python build_dataset.py                         # consolidate all LEAs
.venv/bin/python build_osp_extract.py                     # 30-district study extract
.venv/bin/python build_outcomes.py                        # outcomes + merged analysis file
.venv/bin/python validate_live.py 15 osp                  # live spot check (study panel)
.venv/bin/python validate_live.py 40 osp-all              # all 30 districts at FY2025 + FY2005
```

### The Cloudflare constraint

`apps.schools.nc.gov` returns a Cloudflare managed challenge to `curl` and to
Playwright-launched browsers (even headed and stealth-patched ones). What works:

1. `agent.py` launches **Chrome as a normal application** with
   `--remote-debugging-port`, using a dedicated profile at `/tmp/ncdpi-chrome`.
2. Cloudflare clears on its own because no automation is attached at load time.
3. The script then attaches over CDP and drives the page.

The clearance cookie is stored in that profile, so subsequent runs usually pass straight
through. If a challenge appears, open `https://apps.schools.nc.gov/ords/f?p=145:1` once in
that Chrome window until the page renders, then re-run. A GUI session is required (no
headless server).

## Interactive map

A companion interactive map is published at **https://johnlockefoundation.github.io/edu**:
a Leaflet choropleth of the 30 study districts with three modes.

* **Finance & staffing** (default) — fiscal-year slider FY2005–FY2025, 15 metrics,
  district-level trend chart with a dashed group-average overlay, and ranking.
* **Student outcomes** — 2025–26 results for GLP, CCR, not-proficient and achievement
  levels 3–5, with a student-group selector (19 groups) that recolors the map, ranking
  and group average. Selecting a district shows a subgroup breakdown bar chart. The
  timeline and fixed scale are hidden because there is only one outcome period.
* **ROI** — cost per proficient student, with **no subgroup selector**. Two measures are
  offered: all students and students not identified with disabilities (English learners
  remain included). The ranking is ascending (best value first). The map uses a sequential
  red scale rather than the blue finance palette: each district is compared with the
  **median of its own OSP group** (Large/Medium/Small) for that measure. Pale red is at or
  below the median; deeper shades mark +10%, +25%, +50%, +100% and +150% or more per
  proficient student. The detail card shows the group median and the exact percentage
  difference, plus a note on the measure's scope.

All three modes share the group chips, search, and the selected-district detail card, and
all state is URL-serialized (`#mode=roi&m=cpp_nswd&g=Small&d=480`). The site is built entirely
from the files in `docs/data/`; it runs with no external APIs or tile basemap.
To rebuild it locally:

```bash
.venv/bin/python build_osp_extract.py   # (if finance data changed)
.venv/bin/python build_site.py           # geometry + panel.json
.venv/bin/python build_outcomes.py       # docs/data/outcomes.json + CSV download
cd docs && python -m http.server 8765
```

## Notes / limits

* Numbers are the app's published figures; NCDPI occasionally revises prior years, so
  `retrieved_at` matters when comparing snapshots over time.
* A6 `Total Funds` sums the State/Federal/Local funding splits of each position row —
  this is how NCDPI's own summary subtotals are computed.
* `local_per_pupil + state_per_pupil + federal_per_pupil` equals `total_per_pupil` within
  ±$1. Each component is rounded to whole dollars independently, so 203 of 630 rows land
  exactly $1 off the total rather than cancelling out. Use the unrounded values in
  `ncdpi_district_year_full.csv` if you need exact additivity.
* Charter/regional LEAs appear in `full` (`lea_type = charter_or_regional`) but most are
  absent from A7, hence A6-only rows there. The study extract contains districts only.
* Outcomes are a **single cross-section** (2025–26), one year after the last finance year.
  They cannot support a within-district trend, and the site deliberately does not draw a
  21-year line for them. Treating OSP group differences in outcomes as causal would still
  require a research design; the merged file is an analysis input, not a result.
* Outcome percentages are published by NCDPI with masking applied; suppressed cells are
  blank, not zero. Group averages on the site are unweighted means of district values,
  not student-weighted pooled rates. ROI group averages are likewise unweighted means
  of district ratios, not a pooled district-wide ratio.
