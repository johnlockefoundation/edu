"""Build the consolidated NCDPI district-year dataset from the bulk extracts.

Sources
-------
Table A6  raw/a6_by_year/a6_<year>.csv   (APEX page 110, filtered by Year, CSV download)
Table A7  raw/a7_expenditure_all.csv     (APEX page 114, full CSV download)

Year code convention in the NCDPI app: the code is the *ending* calendar year.
    2005 -> "2004-05" ... 2025 -> "2024-25"
"""
from __future__ import annotations

import glob
import json
import os
from datetime import datetime, timezone

import pandas as pd

A6_DIR = "raw/a6_by_year"
A7_FILE = "raw/a7_expenditure_all.csv"
OUT_DIR = "data"

YEAR_MIN, YEAR_MAX = 2005, 2025
A6_URL = "https://apps.schools.nc.gov/ords/f?p=145:110"
A7_URL = "https://apps.schools.nc.gov/ords/f?p=145:114"
A6_PAGE_URL = "https://apps.schools.nc.gov/ords/f?p=145:109"
A7_PAGE_URL = "https://apps.schools.nc.gov/ords/f?p=145:113:"

PERSONNEL_MAP = {
    "Administrators": "administrators",
    "Teachers": "teachers",
    "Professionals": "professionals",
    "Others": "other_personnel",
}


def school_year(code: int) -> str:
    """2005 -> '2004-05'; 2025 -> '2024-25'."""
    return f"{code - 1}-{str(code)[2:]:>02}"


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(
        s.astype(str).str.replace(",", "", regex=False).str.strip().replace({"": None, "-": None, "nan": None}),
        errors="coerce",
    )


def load_a6() -> pd.DataFrame:
    frames = []
    for f in sorted(glob.glob(f"{A6_DIR}/a6_*.csv")):
        d = pd.read_csv(f, dtype=str)
        d["__file"] = os.path.basename(f)
        frames.append(d)
    raw = pd.concat(frames, ignore_index=True)
    raw["Year"] = raw["Year"].astype(int)
    raw["LEA"] = raw["LEA"].astype(str).str.strip()
    raw["LEA Name"] = raw["LEA Name"].astype(str).str.strip()
    raw["Position"] = raw["Position"].astype(str).str.strip()
    raw["AssignmentClassification"] = raw["AssignmentClassification"].astype(str).str.strip()
    raw["TotalFund"] = _num(raw["TotalFund"])

    raw = raw[(raw.Year >= YEAR_MIN) & (raw.Year <= YEAR_MAX)]
    raw["field"] = raw["Position"].map(PERSONNEL_MAP)

    wide = (
        raw.pivot_table(index=["Year", "LEA", "LEA Name"], columns="field",
                        values="TotalFund", aggfunc="sum")
        .reset_index()
    )
    wide.columns.name = None
    for col in PERSONNEL_MAP.values():
        if col not in wide:
            wide[col] = pd.NA
    wide["total_personnel"] = wide[list(PERSONNEL_MAP.values())].sum(axis=1, min_count=1)

    # integrity check on the source rows
    detail = raw.groupby(["Year", "LEA"], as_index=False)["TotalFund"].sum().rename(
        columns={"TotalFund": "_detail_total"}
    )
    wide = wide.merge(detail, on=["Year", "LEA"], how="left")
    wide["a6_reconciles"] = (wide["total_personnel"] - wide["_detail_total"]).abs() < 0.5
    wide = wide.drop(columns=["_detail_total"])
    return wide


def load_a7() -> pd.DataFrame:
    d = pd.read_csv(A7_FILE, dtype=str)
    d["Year"] = d["Year"].astype(int)
    d["LEA"] = d["LEA"].astype(str).str.strip()
    d["LEA Name"] = d["LEA Name"].astype(str).str.strip()
    d = d[(d.Type == "TOTAL") & (d.Year >= YEAR_MIN) & (d.Year <= YEAR_MAX)].copy()

    out = pd.DataFrame({
        "Year": d["Year"],
        "LEA": d["LEA"],
        "a7_lea_name": d["LEA Name"],
        "total_expenditures": _num(d["SourceTotal"]),
        "pp_total": _num(d["Per PupilTotal"]),
        "pp_state": _num(d["Per PupilState"]),
        "pp_local": _num(d["Per PupilLocal"]),
        "pp_federal": _num(d["Per PupilFederal"]),
        "exp_state": _num(d["SourceState"]),
        "exp_federal": _num(d["SourceFederal"]),
        "exp_local": _num(d["SourceLocal"]),
    })
    # ADM is an integer; total / total-per-pupil recovers it to within 0.5
    out["ADM"] = (out["total_expenditures"] / out["pp_total"]).round()
    out["adm_residual"] = (out["total_expenditures"] / out["pp_total"] - out["ADM"]).abs()
    return out


def build(district_list: list[str] | None = None) -> tuple[pd.DataFrame, dict]:
    a6 = load_a6()
    a7 = load_a7()

    # 999 is the statewide aggregate row in A7, not a district
    a7 = a7[a7.LEA != "999"].copy()

    # join on the two keys; keep the name from either side
    df = a7.merge(a6, on=["Year", "LEA"], how="outer", suffixes=("", "_a6"))
    df["district_name"] = df["LEA Name"].fillna(df["a7_lea_name"])
    df = df.drop(columns=[c for c in ["LEA Name", "a7_lea_name"] if c in df.columns])

    df["fiscal_year"] = df["Year"].map(school_year)
    df["lea_code"] = df["LEA"]

    def lea_type(row):
        code = row["lea_code"]
        if code == "295":
            return "innovative_school_district"
        if code.isdigit() and len(code) == 3:
            return "district"
        return "charter_or_regional"

    df["lea_type"] = df.apply(lea_type, axis=1)
    df["is_traditional_district"] = df["lea_type"] == "district"

    cols = [
        "lea_code", "district_name", "Year", "fiscal_year",
        "ADM", "total_expenditures", "pp_total", "pp_local", "pp_state", "pp_federal",
        "exp_state", "exp_federal", "exp_local",
        "total_personnel", "teachers", "administrators", "professionals", "other_personnel",
        "adm_residual",
        "a6_reconciles", "lea_type", "is_traditional_district",
    ]
    df = df[cols].sort_values(["lea_code", "Year"]).reset_index(drop=True)

    # provenance
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    df["source_a6"] = f"{A6_PAGE_URL} (Table A6) | export {A6_URL}"
    df["source_a7"] = f"{A7_PAGE_URL} (Table A7) | export {A7_URL}"
    df["retrieved_at"] = stamp

    # validation log
    log = []
    years_expected = list(range(YEAR_MIN, YEAR_MAX + 1))
    scope = df[df.is_traditional_district]
    if district_list is not None:
        scope = scope[scope.lea_code.isin(district_list)]
    for lea, g in scope.groupby("lea_code"):
        have = set(g.Year)
        missing = [y for y in years_expected if y not in have]
        no_a6 = g.loc[g.total_personnel.isna(), "Year"].tolist()
        no_a7 = g.loc[g.total_expenditures.isna(), "Year"].tolist()
        if missing or no_a6 or no_a7:
            log.append({
                "lea_code": lea,
                "district_name": g.district_name.dropna().iloc[0] if g.district_name.notna().any() else None,
                "missing_years": ";".join(map(str, missing)),
                "missing_a6_years": ";".join(map(str, no_a6)),
                "missing_a7_years": ";".join(map(str, no_a7)),
            })

    districts = df[df.is_traditional_district]
    reconcile = df["a6_reconciles"].astype("boolean").fillna(False)
    summary = {
        "retrieved_at": stamp,
        "year_range": f"{school_year(YEAR_MIN)} to {school_year(YEAR_MAX)}",
        "years": len(years_expected),
        "rows_total": int(len(df)),
        "traditional_districts": int(districts.lea_code.nunique()),
        "rows_traditional_districts": int(len(districts)),
        "district_year_pairs_expected": int(districts.lea_code.nunique() * len(years_expected)),
        "rows_missing_a6_all_lea": int(df.total_personnel.isna().sum()),
        "rows_missing_a6_districts": int(districts.total_personnel.isna().sum()),
        "rows_missing_a7_districts": int(districts.total_expenditures.isna().sum()),
        "adm_residual_max": round(float(df.adm_residual.max()), 4),
        "a6_reconcile_failures": int((~reconcile).sum()),
        "districts_with_gaps": len(log),
    }
    df.attrs["validation"] = pd.DataFrame(log)
    df.attrs["summary"] = summary
    return df, summary


def write_outputs(df: pd.DataFrame, summary: dict, tag: str = "full") -> dict:
    os.makedirs(OUT_DIR, exist_ok=True)
    csv_path = f"{OUT_DIR}/ncdpi_district_year_{tag}.csv"
    xlsx_path = f"{OUT_DIR}/ncdpi_district_year_{tag}.xlsx"
    df.to_csv(csv_path, index=False)

    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as xw:
        df.to_excel(xw, sheet_name="district_year", index=False)
        pd.DataFrame([summary]).T.rename(columns={0: "value"}).to_excel(xw, sheet_name="summary")
        vlog = df.attrs.get("validation")
        if vlog is not None and len(vlog):
            vlog.to_excel(xw, sheet_name="gaps", index=False)

    json.dump(summary, open(f"{OUT_DIR}/validation_summary_{tag}.json", "w"), indent=2)
    return {"csv": csv_path, "xlsx": xlsx_path, "summary": summary}


if __name__ == "__main__":
    import sys

    df, summary = build()
    paths = write_outputs(df, summary)
    print(json.dumps(summary, indent=2))
    print(json.dumps(paths, indent=2, default=str))
