"""Cross-validate the consolidated dataset against the live per-record pages.

For a stratified sample of district-years, load page 109 (published Table A6) and
page 113 (published Table A7) and compare every requested field.
"""
import json
import os
import sys

import pandas as pd
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from agent import ensure_browser, PORT
from build_dataset import build, school_year


def parse_a6(html):
    s = BeautifulSoup(html, "lxml")
    tab = next((t for t in s.find_all("table") if "Grand Total" in t.get_text()), None)
    if not tab:
        return {}
    out, group = {}, None
    for tr in tab.find_all("tr"):
        c = [" ".join(x.get_text(" ", strip=True).split()) for x in tr.find_all(["td", "th"])]
        if len(c) < 6:
            continue
        if c[0].startswith("Grand Total"):
            out["total_personnel"] = int(c[5].replace(",", ""))
        elif c[0] == "Subtotal":
            out[group] = out.get(group, 0) + int(c[5].replace(",", ""))
        elif c[0] and c[0] not in (".",):
            group = c[0]
    return out


def parse_a7(html):
    s = BeautifulSoup(html, "lxml")
    adm = s.find("input", {"id": "P113_ADM"})
    adm = int(adm.get("value").replace(",", "").strip()) if adm else None

    def f(x):
        try:
            return float(x.replace(",", "").replace("%", "").strip())
        except Exception:
            return None

    for tr in s.find_all("tr"):
        c = [" ".join(x.get_text(" ", strip=True).split()) for x in tr.find_all(["td", "th"])]
        if c and c[0] == "TOTAL":
            nums = [f(x) for x in c[1:] if x.strip() != ""]
            nums = [x for x in nums if x is not None]
            if len(nums) < 8:
                return adm, None
            return adm, {
                "exp_state": nums[0],
                "exp_federal": nums[1],
                "exp_local": nums[2],
                "total_expenditures": nums[3],
                "pp_state": nums[4],
                "pp_federal": nums[5],
                "pp_local": nums[6],
                "pp_total": nums[7],
            }
    return adm, None


FIELD_MAP = {
    "administrators": "Administrators",
    "teachers": "Teachers",
    "professionals": "Professionals",
    "other_personnel": "Others",
    "total_personnel": "total_personnel",
}


def goto_ready(pg, url, selector, tries=4):
    """Load an APEX page, retrying if it lands on a challenge or a slow render."""
    for i in range(tries):
        pg.goto(url, wait_until="load", timeout=90000)
        try:
            pg.wait_for_selector(selector, timeout=20000)
            return
        except Exception:
            print(f"    retry {i + 1} ({pg.title()})")
            pg.wait_for_timeout(3000 + i * 2000)
    raise RuntimeError(f"page never became ready: {url} ({pg.title()})")


def select_and_wait(pg, selector, value):
    """The NCDPI selects auto-submit on change; wait for the resulting navigation."""
    if pg.eval_on_selector(selector, "e => e.value") == value:
        return False
    try:
        with pg.expect_navigation(timeout=60000):
            pg.select_option(selector, value)
        return True
    except Exception:
        pg.wait_for_timeout(1500)
        return False


def main(n=12):
    df, _ = build()
    d = df[df.is_traditional_district]

    if len(sys.argv) > 2 and sys.argv[2] in ("osp", "osp-small", "osp-all"):
        cfg = pd.read_csv("config/districts.csv", dtype={"lea_code": str})
        cfg["lea_code"] = cfg["lea_code"].str.zfill(3)
        picks = []
        if sys.argv[2] == "osp-all":
            # every study district, latest year, plus the earliest year for the first 10
            picks = [(2025, lea) for lea in cfg.lea_code]
            picks += [(2005, lea) for lea in cfg.lea_code[:10]]
        else:
            groups = ["Small"] if sys.argv[2] == "osp-small" else None
            for grp, sub in cfg.groupby("district_group"):
                if groups and grp not in groups:
                    continue
                for i, lea in enumerate(sub.lea_code):
                    for yr in [2005, 2015, 2025]:
                        picks.append((yr, lea))
        picks = picks[:n]
    else:
        years = sorted(d.Year.unique())
        step_y = max(1, len(years) // n)
        chosen_years = years[-n:] if (len(sys.argv) > 2 and sys.argv[2] == "recent") else years[::step_y][:n]
        picks = []
        for i, y in enumerate(chosen_years):
            cand = d[d.Year == y].sort_values("lea_code").reset_index(drop=True)
            if len(cand):
                picks.append((y, cand.loc[(i * 7 + 3) % len(cand), "lea_code"]))

    ensure_browser()
    results = []
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = b.contexts[0]
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        pg.goto("http://apps.schools.nc.gov/ords/f?p=145:109", wait_until="load", timeout=90000)
        pg.wait_for_timeout(1800)

        for year, lea in picks:
            year, lea = str(int(year)), str(lea)
            goto_ready(pg, "http://apps.schools.nc.gov/ords/f?p=145:109", "#P109_SELECTYEAR")
            select_and_wait(pg, "#P109_SELECTYEAR", year)
            pg.wait_for_timeout(700)
            select_and_wait(pg, "#P109_SELECTLEA", lea)
            pg.wait_for_timeout(1400)
            live6 = parse_a6(pg.content())

            goto_ready(pg, "http://apps.schools.nc.gov/ords/f?p=145:113", "#P113_SELECTYEAR")
            select_and_wait(pg, "#P113_SELECTYEAR", year)
            pg.wait_for_timeout(700)
            select_and_wait(pg, "#P113_SELECTLEA", lea)
            pg.wait_for_timeout(1200)
            adm, live7 = parse_a7(pg.content())

            row = d[(d.Year == int(year)) & (d.lea_code == lea)].iloc[0]
            checks, bad = {}, []
            for ours, theirs in FIELD_MAP.items():
                a, lv = int(row[ours]), live6.get(theirs)
                checks[ours] = [a, lv]
                if a != lv:
                    bad.append(f"{ours}: ours={a} live={lv}")
            checks["ADM"] = [int(row.ADM), adm]
            if int(row.ADM) != adm:
                bad.append(f"ADM: ours={int(row.ADM)} live={adm}")
            for f in ["total_expenditures", "pp_total", "pp_local", "pp_state"]:
                a, lv = float(row[f]), (live7 or {}).get(f)
                checks[f] = [a, lv]
                if lv is None or abs(a - lv) > 0.02:
                    bad.append(f"{f}: ours={a} live={lv}")

            status = "OK" if not bad else "FAIL"
            print(f"{school_year(int(year))} LEA {lea} {row.district_name[:32]:32} {status}")
            for x in bad:
                print("    ", x)
            results.append({"year": int(year), "lea": lea, "district": row.district_name,
                            "status": status, "checks": checks})
        b.close()

        good = sum(r["status"] == "OK" for r in results)
        print(f"\n{good}/{len(results)} sampled district-years matched live values exactly")

        # cumulative log: keep prior passes, merge in this one (dedupe by year+lea)
        path = "data/validation_live_sample.json"
        prior = json.load(open(path)) if os.path.exists(path) else []
        seen = {(r["year"], r["lea"]) for r in results}
        combined = [r for r in prior if (r["year"], r["lea"]) not in seen] + results
        combined.sort(key=lambda r: (r["year"], r["lea"]))
        json.dump(combined, open(path, "w"), indent=2)
        print(f"cumulative validations logged: {len(combined)} "
              f"({sum(x['status'] == 'OK' for x in combined)} OK)")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 12)
