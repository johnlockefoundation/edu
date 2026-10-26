"""Emit the OSP study extract: 30 districts x 21 fiscal years (2005-2025).

Field names follow Bob's specification, including the rounding rule for per-pupil
dollar amounts (cents .50 and above round up, below .50 drop the cents -> half-up).

Edit config/districts.csv to change the district set (set selected=TRUE/FALSE).
"""
import json
import os

import numpy as np
import pandas as pd

FULL = "data/ncdpi_district_year_full.csv"
CONFIG = "config/districts.csv"
OUT_CSV = "data/ncdpi_osp_30districts_fy2005_2025.csv"
OUT_XLSX = "data/ncdpi_osp_30districts_fy2005_2025.xlsx"

# Bob's labels -> columns in the consolidated dataset
FIELD_MAP = {
    "ADM": "adm",
    "Total Expenditures": "total_expenditures",
    "Total Per Pupil Expenditures": "total_per_pupil",
    "Local Per Pupil Expenditures": "local_per_pupil",
    "State Per Pupil Expenditures": "state_per_pupil",
    "Grand Total Personnel": "grand_total_personnel",
    "Total Teachers": "total_teachers",
    "Total Admin": "total_admin",
    "Total Professionals": "total_professionals",
    "Others": "others",
}


def half_up(s: pd.Series) -> pd.Series:
    """Round half away from zero to whole dollars (Bob's rounding rule)."""
    return np.floor(s.astype(float).abs() + 0.5) * np.sign(s.astype(float))


def main():
    df = pd.read_csv(FULL, dtype={"lea_code": str})
    cfg = pd.read_csv(CONFIG, dtype={"lea_code": str})
    cfg["lea_code"] = cfg["lea_code"].str.zfill(3)

    sel = cfg[cfg.selected.astype(str).str.upper().isin(["TRUE", "1", "YES"])]
    out = df.merge(sel[["lea_code", "district_name", "district_group"]],
                   on="lea_code", how="inner", suffixes=("", "_cfg"))
    out = out.drop(columns=["district_name"])

    out = out.rename(columns={
        "district_name_cfg": "district_name",
        "Year": "fiscal_year",
        "fiscal_year": "school_year",
        "ADM": "adm",
        "total_expenditures": "total_expenditures",
        "pp_total": "total_per_pupil",
        "pp_local": "local_per_pupil",
        "pp_state": "state_per_pupil",
        "pp_federal": "federal_per_pupil",
        "total_personnel": "grand_total_personnel",
        "teachers": "total_teachers",
        "administrators": "total_admin",
        "professionals": "total_professionals",
        "other_personnel": "others",
    })

    for c in ["total_per_pupil", "local_per_pupil", "state_per_pupil", "federal_per_pupil"]:
        out[c] = half_up(out[c])

    for c in ["adm", "total_expenditures", "total_per_pupil", "local_per_pupil",
              "state_per_pupil", "federal_per_pupil", "grand_total_personnel",
              "total_teachers", "total_admin", "total_professionals", "others"]:
        out[c] = out[c].astype("Int64")

    group_order = {"Large": 0, "Medium": 1, "Small": 2}
    out["_g"] = out["district_group"].map(group_order)
    out = out.sort_values(["_g", "district_name", "fiscal_year"]).drop(columns=["_g"])

    cols = ["district_group", "lea_code", "district_name", "fiscal_year", "school_year",
            "adm", "total_expenditures", "total_per_pupil", "local_per_pupil",
            "state_per_pupil", "federal_per_pupil", "grand_total_personnel",
            "total_teachers", "total_admin", "total_professionals", "others",
            "source_a7", "source_a6", "retrieved_at"]
    out = out[cols].reset_index(drop=True)

    out.to_csv(OUT_CSV, index=False)

    dictionary = pd.DataFrame([
        ("district_group", "Large / Medium / Small grouping by OSP recipient count (per project brief)"),
        ("lea_code", "NCDPI Local Education Agency code"),
        ("district_name", "District name"),
        ("fiscal_year", "NC fiscal year code used by NCDPI (2005-2025); equals the school year ending year"),
        ("school_year", "School year label, e.g. 2004-05 (FY2005)"),
        ("adm", "Final ADM (Table A7 header, blue title above table)"),
        ("total_expenditures", "Table A7 - Source Total, TOTAL row (dollars)"),
        ("total_per_pupil", "Table A7 - Per Pupil Total, TOTAL row (dollars, rounded half-up)"),
        ("local_per_pupil", "Table A7 - Per Pupil Local, TOTAL row (dollars, rounded half-up)"),
        ("state_per_pupil", "Table A7 - Per Pupil State, TOTAL row (dollars, rounded half-up)"),
        ("federal_per_pupil", "Table A7 - Per Pupil Federal, TOTAL row (dollars, rounded half-up)"),
        ("grand_total_personnel", "Table A6 - Total Funds, Grand Total"),
        ("total_teachers", "Table A6 - Teachers, Subtotal, Total Funds"),
        ("total_admin", "Table A6 - Administrators, Subtotal, Total Funds"),
        ("total_professionals", "Table A6 - Professionals, Subtotal, Total Funds"),
        ("others", "Table A6 - Others, Subtotal, Total Funds"),
        ("source_a7", "APEX source page/export for Table A7"),
        ("source_a6", "APEX source page/export for Table A6"),
        ("retrieved_at", "UTC timestamp of extraction"),
    ], columns=["column", "definition"])

    with pd.ExcelWriter(OUT_XLSX, engine="openpyxl") as xw:
        out.to_excel(xw, sheet_name="OSP_data", index=False)
        dictionary.to_excel(xw, sheet_name="data_dictionary", index=False)
        (out.groupby(["district_group", "district_name"])
            .agg(rows=("fiscal_year", "size"),
                 first_year=("fiscal_year", "min"),
                 last_year=("fiscal_year", "max"),
                 adm_2024_25=("adm", "last"))
            .reset_index()
            .to_excel(xw, sheet_name="coverage", index=False))

    print(f"districts: {out.lea_code.nunique()}  rows: {len(out)}")
    print(out.groupby("district_group").agg(districts=("lea_code", "nunique"), rows=("fiscal_year", "size")).to_string())
    print("years:", out.fiscal_year.min(), "-", out.fiscal_year.max(), "| distinct years:", out.fiscal_year.nunique())
    print("missing ADM:", int(out.adm.isna().sum()),
          "| missing expenditures:", int(out.total_expenditures.isna().sum()),
          "| missing personnel:", int(out.grand_total_personnel.isna().sum()))
    print("->", OUT_CSV)
    print("->", OUT_XLSX)


if __name__ == "__main__":
    main()
