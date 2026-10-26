"""Build the static site bundle: district geometry + panel data.

Reads the OSP study extract and the Census TIGER/Line unified school district
boundaries, matches them by name tokens, simplifies the polygons, and writes
everything the map needs into docs/data/.

Run after build_osp_extract.py.
"""
import json
import os
import re
import shutil

import pandas as pd
import shapefile
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

PANEL = "data/ncdpi_osp_30districts_fy2005_2025.csv"
SHP = "build/geo/unsd/tl_2024_37_unsd"
DOCS = "docs"
DATA = os.path.join(DOCS, "data")

STOP = {"county", "schools", "school", "public", "city", "of", "the", "cs", "district"}

NUMERIC = [
    "adm", "total_expenditures", "total_per_pupil", "local_per_pupil",
    "state_per_pupil", "federal_per_pupil", "grand_total_personnel",
    "total_teachers", "total_admin", "total_professionals", "others",
]


def tokens(name: str) -> set:
    return {t for t in re.split(r"[^a-z]+", name.lower()) if t and t not in STOP}


def build_geometry():
    reader = shapefile.Reader(SHP)
    fields = [f[0] for f in reader.fields[1:]]
    shapes = reader.shapes()
    records = [dict(zip(fields, rec)) for rec in reader.records()]
    return shapes, records


def simplify_geom(geom, tol):
    g = geom.simplify(tol, preserve_topology=True)
    return g


def round_coords(obj, nd=4):
    """Round nested coordinate arrays to keep the GeoJSON small."""
    if isinstance(obj, (int, float)):
        return round(obj, nd)
    if isinstance(obj, (list, tuple)):
        return [round_coords(v, nd) for v in obj]
    return obj


def polygonal(geom):
    if geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return geom
    if geom.geom_type == "MultiPolygon":
        parts = [p for p in geom.geoms if p.area > 1e-6]
        if not parts:
            return None
        return unary_union(parts) if len(parts) > 1 else parts[0]
    return None


def main():
    os.makedirs(DATA, exist_ok=True)
    df = pd.read_csv(PANEL, dtype={"lea_code": str})
    groups = df.groupby("lea_code").district_group.first()

    shapes, records = build_geometry()

    by_token = {}
    for rec, shp in zip(records, shapes):
        by_token[rec["GEOID"]] = (tokens(rec["NAME"]), rec, shp)

    # match each study district to exactly one TIGER polygon
    used, matched = {}, {}
    for _, row in df.drop_duplicates("lea_code").iterrows():
        want = tokens(row.district_name)
        best, score = None, 0.0
        for geoid, (have, rec, shp) in by_token.items():
            inter = len(want & have)
            if not inter:
                continue
            s = inter / len(want | have)
            if s > score:
                best, score = geoid, s
        if best is None:
            raise SystemExit(f"no boundary match for {row.district_name}")
        if best in used:
            raise SystemExit(f"duplicate match: {row.district_name} and {used[best]} -> {best}")
        used[best] = row.district_name
        matched[row.lea_code] = (best, score, by_token[best][1])

    print("boundary matches (worst first):")
    for lea, (geoid, score, rec) in sorted(matched.items(), key=lambda kv: kv[1][1])[:5]:
        print(f"  LEA {lea} -> {rec['NAME']:38} {score:.2f}")

    # study districts layer
    features = []
    for lea, (geoid, score, rec) in matched.items():
        shp = by_token[geoid][2]
        geom = polygonal(simplify_geom(shape(shp.__geo_interface__), 0.0025))
        if geom is None:
            continue
        gj = mapping(geom)
        features.append({
            "type": "Feature",
            "properties": {
                "lea": lea,
                "name": df.loc[df.lea_code == lea, "district_name"].iloc[0],
                "group": groups[lea],
            },
            "geometry": {"type": gj["type"],
                         "coordinates": round_coords(gj["coordinates"])},
        })

    with open(os.path.join(DATA, "districts.geojson"), "w") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh,
                  separators=(",", ":"))

    # context layer: every NC unified district, light grey on the map
    ctx = []
    for geoid, (toks, rec, shp) in by_token.items():
        geom = polygonal(simplify_geom(shape(shp.__geo_interface__), 0.004))
        if geom is None:
            continue
        gj = mapping(geom)
        ctx.append({
            "type": "Feature",
            "properties": {"name": rec["NAME"]},
            "geometry": {"type": gj["type"],
                         "coordinates": round_coords(gj["coordinates"])},
        })
    with open(os.path.join(DATA, "context.geojson"), "w") as fh:
        json.dump({"type": "FeatureCollection", "features": ctx}, fh,
                  separators=(",", ":"))

    # panel data: district table + one compact row per district-year
    districts = (df.drop_duplicates("lea_code")[["lea_code", "district_name", "district_group"]]
                 .rename(columns={"lea_code": "lea", "district_name": "name",
                                  "district_group": "group"})
                 .sort_values("lea")
                 .to_dict("records"))
    rows = []
    for r in df.sort_values(["lea_code", "fiscal_year"])[["lea_code", "fiscal_year"] + NUMERIC].itertuples(index=False):
        rows.append([r.lea_code, int(r.fiscal_year)] + [int(getattr(r, k)) for k in NUMERIC])
    with open(os.path.join(DATA, "panel.json"), "w") as fh:
        json.dump({
            "fields": NUMERIC,
            "districts": districts,
            "rows": rows,
        }, fh, separators=(",", ":"))

    shutil.copyfile(PANEL, os.path.join(DATA, "ncdpi_osp_30districts_fy2005_2025.csv"))

    for f in ("districts.geojson", "context.geojson", "panel.json"):
        p = os.path.join(DATA, f)
        print(f"  {f:20} {os.path.getsize(p)/1024:7.1f} KB")

    print(f"\nmatched {len(matched)}/30 districts, {len(features)} features, {len(rows)} rows")


if __name__ == "__main__":
    main()
