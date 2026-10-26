"""Table A7 (Current Expenditures by Source of Funds) bulk extractor.

Page 114 holds an interactive report with every LEA x every year (15,827 rows),
under the region's 30,000-row cap, so a single CSV download captures the whole
table - no per-district iteration needed.

The CSV carries total/state/local/federal dollars and per-pupil values; ADM is
recovered in build_dataset.py as round(SourceTotal / PerPupilTotal).
"""
import os

from playwright.sync_api import sync_playwright

from agent import ensure_browser, PORT

OUT = "raw/a7_expenditure_all.csv"
URL = "http://apps.schools.nc.gov/ords/f?p=145:114"


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ensure_browser()
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = b.contexts[0]
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        pg.goto(URL, wait_until="load", timeout=90000)
        pg.wait_for_timeout(3000)

        pg.click("button[id$='_actions_button']")
        pg.wait_for_timeout(700)
        pg.click("xpath=//li[contains(@class,'a-Menu-item')][normalize-space(.)='Download']")
        pg.wait_for_timeout(1000)
        with pg.expect_download(timeout=180000) as dl:
            pg.click("xpath=//div[contains(@class,'a-IRR-dialog--download')]//button[normalize-space(.)='Download']")
        dl.value.save_as(OUT)
        print(f"saved {OUT} ({os.path.getsize(OUT)} bytes)")
        b.close()


if __name__ == "__main__":
    main()
