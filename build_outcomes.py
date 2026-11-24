#!/usr/bin/env python3
"""Integrate NC DPI 2025-26 disaggregated EOG/EOC outcomes into the OSP study.

The source is a single tab-delimited snapshot of End-of-Grade / End-of-Course
performance at the Public School Unit (PSU) level.  Our 30 study districts
appear as ``<3-digit LEA>LEA`` rows (e.g. ``920LEA`` = Wake County Schools).

Outputs
-------
data/disag_2025_26_30districts_tidy.csv        all disaggregations, 30 districts
data/disag_2025_26_30districts_headline.csv   ALL/ALL/ALL/ALL headline + subgroup values
data/osp_outcomes_merged_30districts.csv      one row per district: FY2025 finance + FY2026 outcomes
data/osp_outcomes_merged_30districts.xlsx     same, with dictionary and validation sheets
data/validation_outcomes.json                 coverage / masking / integrity log
docs/data/outcomes.json                       compact bundle for the interactive map
docs/data/osp_outcomes_merged_30districts.csv copy of the merged CSV for the site download

Run after build_osp_extract.py (it reads the 30-district finance panel).
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "Disag_2025-26"
RAW_FILE = RAW_DIR / "Disag_2025-26_Data.txt"
DESC_FILE = RAW_DIR / "Disag_2025-26_Description.pdf"
CONFIG = ROOT / "config" / "districts.csv"
PANEL = ROOT / "data" / "ncdpi_osp_30districts_fy2005_2025.csv"
DATA = ROOT / "data"
DOCS_DATA = ROOT / "docs" / "data"

OUT_TIDY = DATA / "disag_2025_26_30districts_tidy.csv"
OUT_HEAD = DATA / "disag_2025_26_30districts_headline.csv"
OUT_MERGED = DATA / "osp_outcomes_merged_30districts.csv"
OUT_XLSX = DATA / "osp_outcomes_merged_30districts.xlsx"
OUT_VALID = DATA / "validation_outcomes.json"
SITE_JSON = DOCS_DATA / "outcomes.json"
SITE_CSV = DOCS_DATA / "osp_outcomes_merged_30districts.csv"

SCHOOL_YEAR = "2025-26"
SOURCE = "NC DPI Office of Accountability and Testing, Disaggregated State, Public School Unit and School Level Performance Data, 2025-26"

PCT_COLS = ["pct_notprof", "pct_l3", "pct_l4", "pct_l5", "pct_ccr", "pct_glp"]
NUM_COLS = ["num_tested", "pct_notprof", "pct_l3", "pct_l4", "pct_l5", "pct_ccr", "pct_glp", "avg_score"]

# Curated subgroup list for the headline file and the interactive site.  The
# full 40-subgroup detail is retained in the tidy file and the site JSON.
SITE_SUBGROUPS = [
    "ALL", "EDS", "NOT_EDS", "SWD", "NOT_SWD", "ELS", "NOT_ELS",
    "AMIN", "ASIA", "BLCK", "HISP", "WHTE", "MULT",
    "FEM", "MALE", "AIG", "NOT_AIG", "HMS", "MIL",
]

FIELD_DEFINITIONS = {
    "district_group": "OSP study group (Large / Medium / Small) by OSP recipient count",
    "lea_code": "NC DPI local education agency code, zero-padded to 3 characters",
    "district_name": "Study district name from config/districts.csv",
    "school_year": "School year of the outcome measurement (2025-26)",
    "num_tested": "Number of students with a valid score in the ALL/ALL/ALL/ALL cell",
    "pct_notprof": "Percent not proficient (achievement levels 1-2), ALL students",
    "pct_l3": "Percent at achievement level 3, ALL students",
    "pct_l4": "Percent at achievement level 4, ALL students",
    "pct_l5": "Percent at achievement level 5, ALL students; blank where masked (<5)",
    "pct_ccr": "College-and-Career Ready percent (levels 4+5), ALL students",
    "pct_glp": "Grade-Level Proficient percent (level 3+), ALL students",
    "glp_<sub>": "Grade-Level Proficient percent for subgroup <sub> (ALL subjects/grades/types)",
    "ccr_<sub>": "College-and-Career Ready percent for subgroup <sub> (ALL subjects/grades/types)",
    "glp_gap_eds": "NOT_EDS minus EDS grade-level proficiency (percentage points)",
    "glp_gap_swd": "NOT_SWD minus SWD grade-level proficiency (percentage points)",
    "glp_gap_race": "WHTE minus BLCK grade-level proficiency (percentage points)",
    "ccr_gap_eds": "NOT_EDS minus EDS college-and-career readiness (percentage points)",
    "ccr_gap_swd": "NOT_SWD minus SWD college-and-career readiness (percentage points)",
    "ccr_gap_race": "WHTE minus BLCK college-and-career readiness (percentage points)",
    "fiscal_year_finance": "Latest finance year in the study panel (FY2025 = 2024-25)",
    "school_year_outcomes": "School year of the outcome measurement (2025-26)",
    "source_a7": "NCDPI Statistical Profile Table A7 provenance (expenditures)",
    "source_a6": "NCDPI Statistical Profile Table A6 provenance (personnel)",
    "adm": "Average daily membership (enrollment), FY2025",
    "total_expenditures": "Total current expenditures, FY2025",
    "total_per_pupil": "Total current expenditures per pupil, FY2025 (half-up rounded)",
    "state_per_pupil": "State per-pupil expenditure, FY2025 (half-up rounded)",
    "local_per_pupil": "Local per-pupil expenditure, FY2025 (half-up rounded)",
    "federal_per_pupil": "Federal per-pupil expenditure, FY2025 (half-up rounded)",
    "grand_total_personnel": "Total positions funded from all sources, FY2025",
    "total_teachers": "Teacher positions, FY2025",
    "students_per_teacher": "ADM divided by teacher positions, FY2025",
    "source_finance": "NCDPI Statistical Profile Tables A6/A7 provenance",
    "source_outcomes": "NCDPI 2025-26 disaggregated performance data provenance",
    "raw_file": "Name of the preserved raw source file",
    "retrieved_at": "UTC timestamp of this build",
}


def parse_pct(value: str) -> tuple[object, str]:
    """Return (numeric value or None, mask token or '')."""
    if value in ("", "-"):
        return None, ""
    if value in ("<5", ">95"):
        return None, value
    try:
        return round(float(value), 1), ""
    except ValueError:
        return None, value


def read_study_districts() -> pd.DataFrame:
    cfg = pd.read_csv(CONFIG, dtype={"lea_code": str})
    cfg["lea_code"] = cfg["lea_code"].str.zfill(3)
    cfg = cfg[cfg["selected"].astype(str).str.upper().isin({"TRUE", "1", "YES"})]
    return cfg[["lea_code", "district_name", "district_group"]].copy()


def load_raw_tidy(leas: set[str], retrieved_at: str) -> pd.DataFrame:
    """Stream the large TSV and keep only our 30 PSUs."""
    keep = set(leas)
    chunks = []
    reader = pd.read_csv(
        RAW_FILE,
        sep="\t",
        dtype=str,
        keep_default_na=False,
        chunksize=200_000,
    )
    for chunk in reader:
        chunk = chunk[
            chunk["school_code"].str[:3].isin(keep)
            & chunk["school_code"].str.endswith("LEA")  # PSU / district rows only
        ]
        if len(chunk):
            chunks.append(chunk)
    raw = pd.concat(chunks, ignore_index=True)

    out = pd.DataFrame({
        "lea_code": raw["school_code"].str[:3],
        "source_name": raw["name"],
        "grade_span": raw["grade_span"],
        "subject": raw["subject"],
        "grade": raw["grade"],
        "assessment_type": raw["type"],
        "subgroup": raw["subgroup"],
    })
    out["num_tested"] = pd.to_numeric(raw["num_tested"], errors="coerce").astype("Int64")

    masks = []
    for col in PCT_COLS + ["avg_score"]:
        parsed = raw[col].map(parse_pct)
        out[col] = parsed.map(lambda t: t[0])
        masks.append(parsed.map(lambda t: f"{col}:{t[1]}" if t[1] else ""))
    out["masked"] = pd.concat(masks, axis=1).agg(lambda r: ";".join(v for v in r if v), axis=1)

    out["school_year"] = SCHOOL_YEAR
    out["raw_file"] = RAW_FILE.name
    out["retrieved_at"] = retrieved_at
    return out


def build() -> dict:
    if not RAW_FILE.exists():
        raise SystemExit(f"Missing raw outcomes file: {RAW_FILE}")
    if not PANEL.exists():
        raise SystemExit(f"Missing finance panel: {PANEL}")

    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cfg = read_study_districts()
    leas = set(cfg["lea_code"])
    tidy = load_raw_tidy(leas, retrieved_at)
    tidy = tidy.merge(cfg, on="lea_code", how="left", validate="many_to_one")

    col_order = [
        "district_group", "lea_code", "district_name", "school_year",
        "grade_span", "subject", "grade", "assessment_type", "subgroup",
        "num_tested", "pct_notprof", "pct_l3", "pct_l4", "pct_l5",
        "pct_ccr", "pct_glp", "avg_score", "masked",
        "source_name", "raw_file", "retrieved_at",
    ]
    tidy = tidy[col_order].sort_values(
        ["district_group", "district_name", "subject", "grade", "assessment_type", "subgroup"]
    ).reset_index(drop=True)

    # ----- headline (ALL subjects / ALL grades / ALL types / ALL students) -----
    head = tidy[
        (tidy["subject"] == "ALL") & (tidy["grade"] == "ALL")
        & (tidy["assessment_type"] == "ALL") & (tidy["subgroup"] == "ALL")
    ].copy()
    headline = head[
        ["district_group", "lea_code", "district_name", "school_year", "num_tested"]
        + PCT_COLS + ["masked", "raw_file", "retrieved_at"]
    ].copy()

    # pull subgroup GLP/CCR values into wide columns
    sub = tidy[
        (tidy["subject"] == "ALL") & (tidy["grade"] == "ALL")
        & (tidy["assessment_type"] == "ALL")
    ]
    for sg in SITE_SUBGROUPS:
        for metric in ("pct_glp", "pct_ccr"):
            sel = sub[sub["subgroup"] == sg][["lea_code", metric]].rename(
                columns={metric: f"{'glp' if metric == 'pct_glp' else 'ccr'}_{sg}"}
            )
            headline = headline.merge(sel, on="lea_code", how="left", validate="one_to_one")

    headline = headline.sort_values(["district_group", "district_name"]).reset_index(drop=True)

    # ----- merged analysis file: FY2025 finance + FY2026 outcomes -----
    panel = pd.read_csv(PANEL, dtype={"lea_code": str})
    panel["lea_code"] = panel["lea_code"].str.zfill(3)
    fin = panel[panel["fiscal_year"] == 2025][[
        "lea_code", "adm", "total_expenditures", "total_per_pupil",
        "state_per_pupil", "local_per_pupil", "federal_per_pupil",
        "grand_total_personnel", "total_teachers", "source_a7", "source_a6",
    ]].copy()
    fin["students_per_teacher"] = (fin["adm"] / fin["total_teachers"]).round(1)

    merged_cols = [
        c for c in headline.columns
        if c not in {"school_year", "masked", "raw_file", "retrieved_at"}
    ]
    merged = headline[merged_cols].merge(fin, on="lea_code", how="left", validate="one_to_one")

    for measure in ("glp", "ccr"):
        for label, high, low in (
            ("eds", "NOT_EDS", "EDS"),
            ("swd", "NOT_SWD", "SWD"),
            ("race", "WHTE", "BLCK"),
        ):
            merged[f"{measure}_gap_{label}"] = (
                merged[f"{measure}_{high}"] - merged[f"{measure}_{low}"]
            ).round(1)

    merged.insert(3, "fiscal_year_finance", 2025)
    merged.insert(4, "school_year_outcomes", SCHOOL_YEAR)
    merged["source_finance"] = fin["source_a7"].iloc[0] + " || " + fin["source_a6"].iloc[0]
    merged["source_outcomes"] = SOURCE
    merged["raw_file"] = RAW_FILE.name
    merged["retrieved_at"] = retrieved_at
    merged = merged.sort_values(["district_group", "district_name"]).reset_index(drop=True)

    # ----- validation -----
    mask_counts = {}
    for col in PCT_COLS + ["avg_score"]:
        tokens = tidy["masked"].str.contains(f"{col}:", regex=False)
        vals = tidy.loc[tokens, "masked"].str.extract(f"{col}:([^;]+)")[0]
        if len(vals):
            mask_counts[col] = vals.value_counts().to_dict()

    validation = {
        "retrieved_at": retrieved_at,
        "school_year": SCHOOL_YEAR,
        "raw_file": RAW_FILE.name,
        "raw_file_bytes": RAW_FILE.stat().st_size,
        "source": SOURCE,
        "districts_expected": len(leas),
        "districts_found": int(tidy["lea_code"].nunique()),
        "tidy_rows": int(len(tidy)),
        "headline_rows": int(len(headline)),
        "merged_rows": int(len(merged)),
        "masked_values_by_column": mask_counts,
        "glp_range": [float(tidy.loc[tidy["subgroup"] == "ALL", "pct_glp"].min()),
                      float(tidy.loc[tidy["subgroup"] == "ALL", "pct_glp"].max())],
        "ccr_range": [float(tidy.loc[tidy["subgroup"] == "ALL", "pct_ccr"].min()),
                      float(tidy.loc[tidy["subgroup"] == "ALL", "pct_ccr"].max())],
        "subgroups": int(tidy["subgroup"].nunique()),
        "subjects": sorted(tidy["subject"].unique().tolist()),
        "grades": sorted(tidy["grade"].unique().tolist()),
        "assessment_types": sorted(tidy["assessment_type"].unique().tolist()),
        "headline_missing_districts": sorted(leas - set(headline["lea_code"])),
        "finance_missing_districts": sorted(leas - set(fin["lea_code"])),
        "duplicate_headline_keys": int(
            headline.duplicated(subset=["lea_code", "school_year"]).sum()
        ),
        "avg_score_note": "avg_score is only reported for subject-specific regular assessments; it is blank at ALL subjects/grades and is therefore excluded from the headline metrics.",
        "masking_note": "NCDPI suppresses percentages below 5 or above 95. Masked cells are blank in numeric columns and recorded as column:token in the 'masked' field.",
    }

    # ----- write data outputs -----
    DATA.mkdir(exist_ok=True)
    DOCS_DATA.mkdir(parents=True, exist_ok=True)
    tidy.to_csv(OUT_TIDY, index=False)
    headline.to_csv(OUT_HEAD, index=False)
    merged.to_csv(OUT_MERGED, index=False)
    with OUT_VALID.open("w") as fh:
        json.dump(validation, fh, indent=2)

    # XLSX with dictionary and validation sheets
    def definition(col: str) -> str:
        if col in FIELD_DEFINITIONS:
            return FIELD_DEFINITIONS[col]
        if col.startswith("glp_") and col[4:] in SITE_SUBGROUPS:
            return FIELD_DEFINITIONS["glp_<sub>"].replace("<sub>", col[4:])
        if col.startswith("ccr_") and col[4:] in SITE_SUBGROUPS:
            return FIELD_DEFINITIONS["ccr_<sub>"].replace("<sub>", col[4:])
        return "Derived analysis field"

    with pd.ExcelWriter(OUT_XLSX, engine="openpyxl") as writer:
        merged.to_excel(writer, sheet_name="merged_data", index=False)
        pd.DataFrame([
            {"column": c, "definition": definition(c)} for c in merged.columns
        ]).to_excel(writer, sheet_name="data_dictionary", index=False)
        pd.DataFrame([validation]).T.rename(columns={0: "value"}).to_excel(
            writer, sheet_name="validation"
        )

    # ----- site bundle -----
    site_fields = [
        "num_tested", "pct_notprof", "pct_l3", "pct_l4", "pct_l5", "pct_ccr", "pct_glp",
    ]
    site_sub = tidy[
        (tidy["subject"] == "ALL") & (tidy["grade"] == "ALL")
        & (tidy["assessment_type"] == "ALL")
        & (tidy["subgroup"].isin(SITE_SUBGROUPS))
    ]
    rows = []
    for lea, sg, *vals in site_sub[["lea_code", "subgroup"] + site_fields].itertuples(index=False, name=None):
        rows.append([lea, sg] + [None if pd.isna(v) else float(v) for v in vals])
    rows.sort(key=lambda x: (x[0], SITE_SUBGROUPS.index(x[1])))
    site_json = {
        "school_year": SCHOOL_YEAR,
        "fields": site_fields,
        "subgroups": SITE_SUBGROUPS,
        "rows": rows,
    }
    with SITE_JSON.open("w") as fh:
        json.dump(site_json, fh, separators=(",", ":"))
    shutil.copyfile(OUT_MERGED, SITE_CSV)

    return validation


if __name__ == "__main__":
    result = build()
    print(json.dumps({
        "tidy_rows": result["tidy_rows"],
        "districts": result["districts_found"],
        "validation": str(OUT_VALID),
        "site_bundle": str(SITE_JSON),
    }, indent=2))
