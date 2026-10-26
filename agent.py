"""Reusable CDP agent: attach to the already-Cloudflare-cleared Chrome."""
import json, os, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

PORT = 9333
PROFILE = "/tmp/ncdpi-chrome"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def ensure_browser():
    try:
        json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=3))
        return
    except Exception:
        pass
    subprocess.Popen([CHROME, f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
                      "--no-first-run", "--no-default-browser-check", "--window-size=1400,1000",
                      "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(30):
        time.sleep(1)
        try:
            json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2))
            return
        except Exception:
            continue
    raise RuntimeError("CDP not up")


def page_text(pg):
    try:
        return pg.inner_text("body")
    except Exception:
        return ""


def main():
    ensure_browser()
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        for target in ["http://apps.schools.nc.gov/ords/f?p=145:1",
                       "http://apps.schools.nc.gov/ords/f?p=145:101",
                       "http://apps.schools.nc.gov/ords/f?p=145:109"]:
            pg.goto(target, wait_until="load", timeout=90000)
            pg.wait_for_timeout(4000)
            name = target.rsplit(":", 1)[-1]
            print(f"\n===== {target} -> {pg.url} | TITLE {pg.title()}")
            txt = page_text(pg)
            print(txt[:2500])
            open(f"recon/p{name}.html", "w").write(pg.content())
            for s in pg.query_selector_all("select"):
                print("  SELECT id=", s.get_attribute("id"), "n=", len(s.query_selector_all("option")),
                      [(o.get_attribute("value"), o.inner_text().strip()[:30]) for o in s.query_selector_all("option")[:8]])
        browser.close()


if __name__ == "__main__":
    main()
