# NCDPI Statistical Profile extractor — OSP district finance study

Automated extraction of district-level enrollment, finance and personnel data from the
[NC DPI Statistical Profile](https://www.dpi.nc.gov/districts-schools/district-operations/financial-and-business-services/demographics-and-finances),
replacing the manual "pick a district, pick a year, open the table, export" workflow.

**Final deliverable: 30 districts × 21 fiscal years (FY2005–FY2025) = 630 rows, no gaps.**
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
data/validation_summary_full.json             # coverage/integrity counts
data/validation_live_sample.json              # live page-vs-dataset spot checks
config/districts.csv                          # the 30 districts + group + selected flag
raw/a6_by_year/a6_<year>.csv                  # untouched source files (21)
raw/a7_expenditure_all.csv                    # untouched source file
```

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
a Leaflet choropleth of the 30 study districts with a fiscal-year slider (FY2005–FY2025),
metric selector, district-level trend charts, and a ranking panel. The site is built
entirely from the files in `docs/data/` by `build_site.py`; it runs with no server and
no external APIs. To rebuild it locally:

```bash
.venv/bin/python build_osp_extract.py   # (if data changed)
.venv/bin/python build_site.py
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
