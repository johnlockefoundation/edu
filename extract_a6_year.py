"""A6 (Public School Personnel) extractor: one filtered CSV download per school year.

The APEX interactive report on page 110 holds ~123k rows across 22 years but the
region caps at 30,000 rows, so we filter by Year and download each year separately.
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright
from agent import ensure_browser, PORT

OUT = "raw/a6_by_year"
URL = "http://apps.schools.nc.gov/ords/f?p=145:110"


def download_year(page, year, outdir=OUT):
    os.makedirs(outdir, exist_ok=True)
    out = f"{outdir}/a6_{year}.csv"
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        print(f"  {year}: cached")
        return out

    page.goto(URL, wait_until="load", timeout=90000)
    page.wait_for_timeout(2500)

    page.click("button[id$='_actions_button']")
    page.wait_for_timeout(600)
    page.click("xpath=//li[contains(@class,'a-Menu-item')][normalize-space(.)='Filter']")
    page.wait_for_timeout(1200)

    page.select_option("select[id$='_column_name']", "YEAR")
    page.wait_for_timeout(700)

    # pick the operator dropdown that is actually visible for a numeric column
    page.evaluate("""() => {
        const sels = [...document.querySelectorAll("[role=dialog] select[id$='_OPT']")];
        const vis = sels.find(s => s.offsetParent !== null);
        if (vis) { vis.value = '='; vis.dispatchEvent(new Event('change', {bubbles:true})); }
    }""")
    page.fill("input[id$='_expression']", str(year))
    page.wait_for_timeout(300)
    page.click("xpath=//div[@role='dialog']//button[normalize-space(.)='Apply']")

    # wait for the report to refresh and the loading mask to clear
    page.wait_for_timeout(1200)
    for _ in range(40):
        txt = page.inner_text("body")
        if re.search(r"\d+ - \d+ of ([\d,]+|more than [\d,]+)", txt):
            break
        page.wait_for_timeout(500)

    m = re.search(r"\d+ - \d+ of (more than )?([\d,]+)", page.inner_text("body"))
    total = m.group(0) if m else "unknown"

    page.click("button[id$='_actions_button']")
    page.wait_for_timeout(600)
    page.click("xpath=//li[contains(@class,'a-Menu-item')][normalize-space(.)='Download']")
    page.wait_for_timeout(1000)
    with page.expect_download(timeout=180000) as dl:
        page.click("xpath=//div[contains(@class,'a-IRR-dialog--download')]//button[normalize-space(.)='Download']")
    dl.value.save_as(out)
    print(f"  {year}: {total} -> {out} ({os.path.getsize(out)} bytes)")
    return out


if __name__ == "__main__":
    years = [int(y) for y in sys.argv[1:]] or [2006]
    ensure_browser()
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = b.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for y in years:
            download_year(page, y)
        b.close()
