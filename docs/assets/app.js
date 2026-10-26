/* NC School District Finance Explorer
   Data: NCDPI Statistical Profile (Tables A6/A7), 30-district OSP panel. */

(() => {
  "use strict";

  const PALETTE = ["#e4eef4", "#c6dfe9", "#a3cbda", "#7bb3c8", "#5499b3", "#2f7d99", "#0d5f7c"];
  const YEARS = Array.from({ length: 21 }, (_, i) => 2005 + i);
  const nf0 = new Intl.NumberFormat("en-US");
  const usd = (v) => "$" + nf0.format(Math.round(v));
  const int = (v) => nf0.format(Math.round(v));
  const pct = (v) => v.toFixed(1) + "%";
  const dec1 = (v) => v.toFixed(1);

  const METRICS = [
    { id: "tpp", label: "Total per-pupil spending", short: "Total / pupil", fmt: usd,
      hint: "All funds: state, local and federal.", get: (v) => v.total_per_pupil },
    { id: "spp", label: "State per-pupil spending", short: "State / pupil", fmt: usd,
      hint: "State appropriations per pupil.", get: (v) => v.state_per_pupil },
    { id: "lpp", label: "Local per-pupil spending", short: "Local / pupil", fmt: usd,
      hint: "County and local revenue per pupil.", get: (v) => v.local_per_pupil },
    { id: "fpp", label: "Federal per-pupil spending", short: "Federal / pupil", fmt: usd,
      hint: "Federal grants per pupil, including pandemic relief.", get: (v) => v.federal_per_pupil },
    { id: "sshare", label: "State share of spending", short: "State share", fmt: pct,
      hint: "State dollars as a share of total current expenditures.",
      get: (v) => (100 * v.state_per_pupil) / v.total_per_pupil },
    { id: "lshare", label: "Local share of spending", short: "Local share", fmt: pct,
      hint: "Local dollars as a share of total current expenditures.",
      get: (v) => (100 * v.local_per_pupil) / v.total_per_pupil },
    { id: "fshare", label: "Federal share of spending", short: "Federal share", fmt: pct,
      hint: "Federal dollars as a share of total current expenditures.",
      get: (v) => (100 * v.federal_per_pupil) / v.total_per_pupil },
    { id: "adm", label: "Enrollment (ADM)", short: "ADM", fmt: int,
      hint: "Average daily membership, the enrollment base NCDPI uses.", get: (v) => v.adm },
    { id: "exp", label: "Total expenditures", short: "Total spending", fmt: usd,
      hint: "Current expenditures from all funding sources.", get: (v) => v.total_expenditures },
    { id: "per", label: "Total personnel", short: "Personnel", fmt: int,
      hint: "All positions funded from all sources.", get: (v) => v.grand_total_personnel },
    { id: "tea", label: "Teachers", short: "Teachers", fmt: int,
      hint: "Classroom teacher positions.", get: (v) => v.total_teachers },
    { id: "admin", label: "Administrators", short: "Administrators", fmt: int,
      hint: "School and central-office administrators.", get: (v) => v.total_admin },
    { id: "pro", label: "Professionals", short: "Professionals", fmt: int,
      hint: "Instructional and student-support professionals.", get: (v) => v.total_professionals },
    { id: "oth", label: "Other personnel", short: "Other staff", fmt: int,
      hint: "Teacher assistants, clerical and other staff.", get: (v) => v.others },
    { id: "spt", label: "Students per teacher", short: "Students / teacher", fmt: dec1,
      hint: "Enrollment divided by teacher positions.", get: (v) => v.adm / v.total_teachers },
  ];

  const state = { metric: METRICS[0], year: 2025, group: "all", q: "", selected: null, scale: "year" };

  let VALS = {};          // lea -> year -> record
  let DISTRICTS = [];     // [{lea,name,group}]
  let BY_LEA = {};        // lea -> district
  let GEO = null;
  let MAP = null;
  let LAYER = null;
  let LEA_LAYER = new Map();
  let DOMAIN = new Map(); // metric id -> {min,max,breaks}
  let hoverLea = null;

  /* ---------- helpers ---------- */

  const $ = (id) => document.getElementById(id);

  function valueFor(lea, year, metric) {
    const rec = VALS[lea] && VALS[lea][year];
    return rec ? metric.get(rec) : null;
  }

  function schoolYear(y) {
    return `${y - 1}\u2013${String(y).slice(2)}`;
  }

  function scaleFor(metric) {
    const key = metric.id + "|" + state.scale + (state.scale === "year" ? "|" + state.year : "");
    if (DOMAIN.has(key)) return DOMAIN.get(key);

    const vals = [];
    const add = (lea, y) => {
      const v = valueFor(lea, y, metric);
      if (v !== null && Number.isFinite(v)) vals.push(v);
    };
    if (state.scale === "year") {
      DISTRICTS.forEach((d) => add(d.lea, state.year));
    } else {
      DISTRICTS.forEach((d) => YEARS.forEach((y) => add(d.lea, y)));
    }
    vals.sort((a, b) => a - b);
    const min = vals[0], max = vals[vals.length - 1];
    const breaks = [];
    if (state.scale === "fixed") {
      // equal intervals: shows absolute growth across years
      for (let i = 1; i < 7; i++) breaks.push(min + (i * (max - min)) / 7);
    } else {
      for (let i = 1; i < 7; i++) breaks.push(vals[Math.floor((vals.length * i) / 7)]);
    }
    const out = { min, max, breaks };
    DOMAIN.set(key, out);
    return out;
  }

  function colorFor(v, d) {
    if (v === null) return "#f1f4f6";
    let i = 0;
    while (i < d.breaks.length && v >= d.breaks[i]) i++;
    return PALETTE[i];
  }

  function visible(d) {
    if (state.group !== "all" && d.group !== state.group) return false;
    if (state.q && !d.name.toLowerCase().includes(state.q)) return false;
    return true;
  }

  function filtered() {
    return DISTRICTS.filter(visible);
  }

  /* ---------- map ---------- */

  function styleFor(feature) {
    const f = feature.properties;
    const v = valueFor(f.lea, state.year, state.metric);
    const d = scaleFor(state.metric);
    const on = visible(BY_LEA[f.lea]);
    const sel = state.selected === f.lea;
    return {
      fillColor: colorFor(v, d),
      fillOpacity: on ? 1 : 0.12,
      color: sel ? "#0b2b3a" : "#ffffff",
      weight: sel ? 2.4 : 0.9,
      opacity: on ? 1 : 0.35,
    };
  }

  function tooltipFor(layer) {
    const f = layer.feature.properties;
    const rec = VALS[f.lea] && VALS[f.lea][state.year];
    const v = rec ? state.metric.get(rec) : null;
    const shown = v === null ? "\u2014" : state.metric.fmt(v);
    return `<b>${f.name}</b><span>${state.metric.short}, FY${state.year}</span><br>` +
      `<em>${shown}</em> <span>${f.group}</span>`;
  }

  function initMap(geojson, context) {
    MAP = L.map("map", {
      zoomControl: true,
      attributionControl: false,
      minZoom: 6,
      maxZoom: 11,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 120,
    });

    const ctx = L.geoJSON(context, {
      interactive: false,
      style: { fillColor: "#eef1f4", fillOpacity: 1, color: "#dde3e8", weight: 0.7 },
    }).addTo(MAP);

    const bounds = ctx.getBounds();
    MAP.fitBounds(bounds, { padding: [10, 10] });
    MAP.setMaxBounds(bounds.pad(0.4));

    LAYER = L.geoJSON(geojson, {
      style: styleFor,
      onEachFeature: (f, layer) => {
        LEA_LAYER.set(f.properties.lea, layer);
        layer.bindTooltip(tooltipFor, {
          sticky: true, className: "district-tip", direction: "top", offset: [0, -8],
        });
        layer.on("mouseover", () => {
          hoverLea = f.properties.lea;
          layer.setStyle({ weight: 2, color: "#0b2b3a" });
          layer.bringToFront();
          markHover(f.properties.lea);
        });
        layer.on("mouseout", () => {
          hoverLea = null;
          layer.setStyle(styleFor(layer.feature));
          markHover(null);
        });
        layer.on("click", () => select(f.properties.lea, false));
      },
    }).addTo(MAP);
  }

  function markHover(lea) {
    document.querySelectorAll(".rank-item").forEach((el) => {
      el.classList.toggle("is-hover", el.dataset.lea === lea && !el.classList.contains("is-sel"));
    });
  }

  /* ---------- legend ---------- */

  function renderLegend() {
    const d = scaleFor(state.metric);
    const strip = $("legendStrip");
    strip.innerHTML = PALETTE.map((c) => `<i style="background:${c}"></i>`).join("");
    $("legendTitle").textContent = state.metric.label;
    $("legendNote").textContent = state.scale === "year"
      ? `relative to FY${state.year}` : "fixed across all years";
    $("legendMin").textContent = state.metric.fmt(d.min);
    $("legendMax").textContent = state.metric.fmt(d.max);
  }

  /* ---------- ranking ---------- */

  function renderRanking() {
    const list = $("rankList");
    const rows = filtered()
      .map((d) => ({ d, v: valueFor(d.lea, state.year, state.metric) }))
      .filter((r) => r.v !== null)
      .sort((a, b) => b.v - a.v);

    $("rankYear").textContent = `FY${state.year}`;
    if (!rows.length) {
      list.innerHTML = `<li class="rank-empty">No districts match.</li>`;
      return;
    }
    const max = rows[0].v || 1;
    list.innerHTML = rows.map((r, i) => `
      <li>
        <button class="rank-item${r.d.lea === state.selected ? " is-sel" : ""}" data-lea="${r.d.lea}">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${r.d.name}</span>
          <span class="rank-val">${state.metric.fmt(r.v)}</span>
          <span class="rank-bar"><i style="width:${Math.max(2, (r.v / max) * 100)}%"></i></span>
        </button>
      </li>`).join("");
  }

  /* ---------- detail ---------- */

  function select(lea, pan) {
    if (!BY_LEA[lea] || !visible(BY_LEA[lea])) return;
    state.selected = state.selected === lea ? null : lea;
    if (state.selected) {
      openDetail(lea);
      if (pan) ensureVisible(lea);
    } else {
      closeDetail();
    }
    refreshStyles();
    renderRanking();
    syncHash();
  }

  /* keep the selection on screen without yanking the view on every click */
  function ensureVisible(lea) {
    const layer = LEA_LAYER.get(lea);
    if (!layer) return;
    try {
      const b = layer.getBounds();
      if (!b || !b.isValid() || MAP.getBounds().contains(b)) return;
      MAP.flyToBounds(MAP.getBounds().extend(b), { duration: 0.45, maxZoom: MAP.getZoom() });
    } catch (e) { /* cosmetic only */ }
  }

  function openDetail(lea) {
    const d = BY_LEA[lea];
    const rec = VALS[lea][state.year];
    const v = state.metric.get(rec);
    const rows = filtered()
      .map((x) => valueFor(x.lea, state.year, state.metric))
      .filter((x) => x !== null)
      .sort((a, b) => b - a);

    $("detail").hidden = false;
    $("detailName").textContent = d.name;
    $("detailGroup").textContent = d.group;
    $("detailLea").textContent = "LEA " + lea;
    $("detailValue").textContent = state.metric.fmt(v);
    $("detailMetric").textContent = state.metric.label + ", FY" + state.year;
    $("detailRank").textContent = `#${rows.indexOf(v) + 1} of ${rows.length}`;

    const stats = [
      ["Enrollment", int(rec.adm)],
      ["Total spending", usd(rec.total_expenditures)],
      ["Total / pupil", usd(rec.total_per_pupil)],
      ["State / pupil", usd(rec.state_per_pupil)],
      ["Local / pupil", usd(rec.local_per_pupil)],
      ["Federal / pupil", usd(rec.federal_per_pupil)],
      ["Personnel", int(rec.grand_total_personnel)],
      ["Teachers", int(rec.total_teachers)],
      ["Students / teacher", dec1(rec.adm / rec.total_teachers)],
    ];
    $("statGrid").innerHTML = stats
      .map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("");

    renderChart(lea);
  }

  function closeDetail() {
    $("detail").hidden = true;
  }

  function renderChart(lea) {
    const series = YEARS.map((y) => ({
      y,
      v: VALS[lea][y] ? state.metric.get(VALS[lea][y]) : null,
    })).filter((p) => p.v !== null);

    const W = 300, H = 104, top = 8, bottom = 88;
    const vals = series.map((p) => p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const x = (y) => ((y - 2005) / 20) * W;
    const yv = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);

    const line = series.map((p) => `${x(p.y).toFixed(1)},${yv(p.v).toFixed(1)}`).join(" ");
    const area = `M0,${bottom} L${line.split(" ").join(" L")} L${W},${bottom} Z`;
    const cur = series.find((p) => p.y === state.year);
    const first = series[0], last = series[series.length - 1];

    const dot = cur
      ? `<line x1="${x(state.year)}" y1="${top}" x2="${x(state.year)}" y2="${bottom}"
              stroke="#cfd8df" stroke-width="1" stroke-dasharray="2 2"/>
         <circle cx="${x(state.year)}" cy="${yv(cur.v)}" r="3.6"
              fill="#0d6b8a" stroke="#fff" stroke-width="1.6"/>`
      : "";

    $("chart").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="${state.metric.label} for ${BY_LEA[lea].name}, FY2005 to FY2025">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0d6b8a" stop-opacity=".16"/>
            <stop offset="100%" stop-color="#0d6b8a" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#g)"/>
        <polyline points="${line}" fill="none" stroke="#0d6b8a" stroke-width="1.8"
                  stroke-linejoin="round" stroke-linecap="round"/>
        ${dot}
        <text x="0" y="101" font-size="9" fill="#6b7d8b">2005</text>
        <text x="${W}" y="101" font-size="9" fill="#6b7d8b" text-anchor="end">2025</text>
      </svg>`;

    $("trendTitle").textContent =
      `${state.metric.short}: ${state.metric.fmt(first.v)} (FY2005) \u2192 ` +
      `${state.metric.fmt(last.v)} (FY2025)`;
  }

  /* ---------- timeline ---------- */

  function setYear(y) {
    state.year = Math.min(2025, Math.max(2005, Number(y)));
    $("year").value = state.year;
    $("yearLabel").textContent = "FY" + state.year;
    $("syLabel").textContent = schoolYear(state.year);
    renderLegend();
    refreshStyles();
    renderRanking();
    if (state.selected) openDetail(state.selected);
    syncHash();
  }

  let timer = null;
  function togglePlay() {
    const btn = $("play");
    if (timer) {
      clearInterval(timer); timer = null;
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Play through years");
      $("playIcon").setAttribute("d", "M4 2.5v11l9-5.5z");
      return;
    }
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", "Pause");
    $("playIcon").setAttribute("d", "M4 2.5h3.2v11H4zM8.8 2.5H12v11H8.8z");
    if (state.year >= 2025) setYear(2005);
    timer = setInterval(() => {
      if (state.year >= 2025) setYear(2005); else setYear(state.year + 1);
    }, 900);
  }

  /* ---------- state plumbing ---------- */

  function refreshStyles() {
    if (LAYER) LAYER.setStyle(styleFor);
  }

  function syncHash() {
    const parts = [`y=${state.year}`, `m=${state.metric.id}`, `g=${state.group}`, `s=${state.scale}`];
    if (state.selected) parts.push(`d=${state.selected}`);
    try {
      history.replaceState(null, "", "#" + parts.join("&"));
    } catch (e) { /* file:// */ }
  }

  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const m = METRICS.find((x) => x.id === h.get("m"));
    if (m) state.metric = m;
    const y = Number(h.get("y"));
    if (y >= 2005 && y <= 2025) state.year = y;
    const g = h.get("g");
    if (["all", "Large", "Medium", "Small"].includes(g)) state.group = g;
    const sc = h.get("s");
    if (sc === "fixed" || sc === "year") state.scale = sc;
    const d = h.get("d");
    if (d && BY_LEA[d]) state.selected = d;
  }

  /* ---------- wiring ---------- */

  function wire() {
    const sel = $("metric");
    sel.innerHTML = METRICS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
    sel.value = state.metric.id;
    sel.addEventListener("change", () => {
      state.metric = METRICS.find((m) => m.id === sel.value);
      $("metricHint").textContent = state.metric.hint;
      renderLegend();
      refreshStyles();
      renderRanking();
      if (state.selected) openDetail(state.selected);
      syncHash();
    });
    $("metricHint").textContent = state.metric.hint;

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((c) => {
          c.classList.toggle("is-on", c === chip);
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
        state.group = chip.dataset.group;
        if (state.selected && !visible(BY_LEA[state.selected])) {
          state.selected = null;
          closeDetail();
        }
        refreshStyles();
        renderRanking();
        if (state.selected) openDetail(state.selected);
        syncHash();
      });
    });

    $("search").addEventListener("input", (e) => {
      state.q = e.target.value.trim().toLowerCase();
      refreshStyles();
      renderRanking();
    });

    document.querySelectorAll(".legend-scale button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.scale === btn.dataset.scale) return;
        state.scale = btn.dataset.scale;
        document.querySelectorAll(".legend-scale button").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderLegend();
        refreshStyles();
        syncHash();
      });
    });

    $("rankList").addEventListener("click", (e) => {
      const btn = e.target.closest(".rank-item");
      if (btn) select(btn.dataset.lea, true);
    });
    $("rankList").addEventListener("mouseover", (e) => {
      const btn = e.target.closest(".rank-item");
      if (!btn || hoverLea) return;
      const layer = LEA_LAYER.get(btn.dataset.lea);
      if (layer) {
        layer.setStyle({ weight: 2, color: "#0b2b3a" });
        layer.bringToFront();
      }
    });
    $("rankList").addEventListener("mouseout", (e) => {
      const btn = e.target.closest(".rank-item");
      if (!btn) return;
      const layer = LEA_LAYER.get(btn.dataset.lea);
      if (layer && !hoverLea) layer.setStyle(styleFor(layer.feature));
    });

    $("detailClose").addEventListener("click", () => select(state.selected, false));

    $("year").addEventListener("input", (e) => setYear(e.target.value));
    $("play").addEventListener("click", togglePlay);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.selected) select(state.selected, false);
      if (e.key === " " && document.activeElement === document.body) {
        e.preventDefault(); togglePlay();
      }
    });

    window.addEventListener("hashchange", () => {
      const d = new URLSearchParams(location.hash.replace(/^#/, "")).get("d");
      if (d && BY_LEA[d]) select(d, true);
    });
  }

  /* ---------- boot ---------- */

  async function boot() {
    const [panel, geo, context] = await Promise.all([
      fetch("data/panel.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/districts.geojson").then((r) => r.json()),
      fetch("data/context.geojson").then((r) => r.json()),
    ]);

    const idx = {};
    panel.fields.forEach((f, i) => { idx[f] = i + 2; });
    panel.rows.forEach((row) => {
      const lea = row[0], year = row[1];
      const rec = {};
      panel.fields.forEach((f) => { rec[f] = row[idx[f]]; });
      (VALS[lea] = VALS[lea] || {})[year] = rec;
    });

    DISTRICTS = panel.districts;
    DISTRICTS.forEach((d) => { BY_LEA[d.lea] = d; });
    GEO = geo;

    readHash();
    document.querySelectorAll(".legend-scale button").forEach((b) => {
      const on = b.dataset.scale === state.scale;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("year").value = state.year;
    $("yearLabel").textContent = "FY" + state.year;
    $("syLabel").textContent = schoolYear(state.year);

    initMap(geo, context);
    wire();
    renderLegend();
    renderRanking();

    if (state.selected) {
      openDetail(state.selected);
      refreshStyles();
      ensureVisible(state.selected);
    }
  }

  boot().catch((err) => {
    document.getElementById("map").innerHTML =
      `<p style="padding:24px;font:14px system-ui;color:#8a2b2b">
         Could not load map data (${err.message}). Serve this folder over HTTP.</p>`;
  });
})();
