/* NC School District Explorer
   Data: NCDPI Statistical Profile (Tables A6/A7) and 2025-26 disaggregated
   EOG/EOC performance, 30-district OSP panel. */

(() => {
  "use strict";

  const PALETTE = ["#e4eef4", "#c6dfe9", "#a3cbda", "#7bb3c8", "#5499b3", "#2f7d99", "#0d5f7c"];
  // ROI uses a sequential red scale: light = at/below the OSP group median,
  // dark = increasingly more expensive per proficient student.
  const ROI_PALETTE = ["#fdecec", "#fbd4d4", "#f7b3b3", "#f28c8c", "#e86262", "#d43b3b", "#b71c1c"];
  const ROI_STEPS = [0, 10, 25, 50, 100, 150]; // percent above group median
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

  // 2025-26 outcome metrics, all taken from the ALL subjects / ALL grades /
  // ALL assessment types cell for the selected student group.
  const OUTCOME_METRICS = [
    { id: "glp", label: "Grade-level proficient", short: "Proficient", fmt: pct, mode: "outcomes", field: "pct_glp",
      hint: "Achievement level 3 or above (GLP), all subjects and grades, 2025–26.", get: (v) => v.pct_glp },
    { id: "ccr", label: "College & career ready", short: "College/career ready", fmt: pct, mode: "outcomes", field: "pct_ccr",
      hint: "Achievement levels 4 and 5 (CCR), all subjects and grades, 2025–26.", get: (v) => v.pct_ccr },
    { id: "nprof", label: "Not proficient", short: "Not proficient", fmt: pct, mode: "outcomes", field: "pct_notprof",
      hint: "Achievement levels 1 and 2, all subjects and grades, 2025–26.", get: (v) => v.pct_notprof },
    { id: "l3", label: "Achievement level 3", short: "Level 3", fmt: pct, mode: "outcomes", field: "pct_l3",
      hint: "Percent at level 3, all subjects and grades, 2025–26.", get: (v) => v.pct_l3 },
    { id: "l4", label: "Achievement level 4", short: "Level 4", fmt: pct, mode: "outcomes", field: "pct_l4",
      hint: "Percent at level 4, all subjects and grades, 2025–26.", get: (v) => v.pct_l4 },
    { id: "l5", label: "Achievement level 5", short: "Level 5", fmt: pct, mode: "outcomes", field: "pct_l5",
      hint: "Percent at level 5. Suppressed where fewer than 5 or more than 95 percent.", get: (v) => v.pct_l5 },
  ];

  // ROI = FY2025 total per-pupil spending divided by the share of students
  // reaching grade-level proficiency in 2025-26. Lower cost is better.
  const ROI_METRICS = [
    { id: "cpp", label: "Cost per proficient student", short: "Cost / proficient", fmt: usd,
      mode: "roi", lowerIsBetter: true,
      hint: "FY2025 total per-pupil spending divided by (2025–26 GLP / 100). Lower is better." },
  ];

  const SUBGROUP_LABELS = {
    ALL: "All students", EDS: "Economically disadvantaged", NOT_EDS: "Not economically disadvantaged",
    SWD: "Students with disabilities", NOT_SWD: "Not students with disabilities",
    ELS: "English learners", NOT_ELS: "Not English learners",
    AMIN: "American Indian", ASIA: "Asian", BLCK: "Black", HISP: "Hispanic", WHTE: "White",
    MULT: "Two or more races", FEM: "Female", MALE: "Male",
    AIG: "Academically gifted", NOT_AIG: "Not academically gifted",
    HMS: "Homeless", MIL: "Military connected",
  };
  const CHART_SUBGROUPS = ["ALL", "EDS", "NOT_EDS", "SWD", "NOT_SWD", "ELS", "NOT_ELS", "BLCK", "HISP", "WHTE"];

  const state = {
    metric: METRICS[0], year: 2025, group: "all", q: "", selected: null,
    scale: "year", mode: "finance", subgroup: "ALL",
  };

  let VALS = {};          // lea -> year -> record
  let DISTRICTS = [];     // [{lea,name,group}]
  let BY_LEA = {};        // lea -> district
  let GEO = null;
  let MAP = null;
  let LAYER = null;
  let LEA_LAYER = new Map();
  let DOMAIN = new Map(); // metric id (+ subgroup) -> {min,max,breaks}
  let OUTCOMES = {};      // lea -> subgroup -> record
  let FIN_2025 = {};      // lea -> FY2025 finance record
  let SUBGROUPS = [];
  let hoverLea = null;

  /* ---------- helpers ---------- */

  const $ = (id) => document.getElementById(id);

  function activeMetrics() {
    if (state.mode === "outcomes") return OUTCOME_METRICS;
    if (state.mode === "roi") return ROI_METRICS;
    return METRICS;
  }

  function periodLabel() {
    if (state.mode === "outcomes") return "2025\u201326";
    if (state.mode === "roi") return "FY2025 \u2192 2025\u201326";
    return "FY" + state.year;
  }

  function usesOutcomes() {
    return state.mode === "outcomes" || state.mode === "roi";
  }

  function roiFor(lea, rec) {
    const pp = FIN_2025[lea];
    if (!rec || rec.pct_glp === null || !(rec.pct_glp > 0) || !pp) return null;
    return (pp.total_per_pupil * 100) / rec.pct_glp;
  }

  function roiMedian(group) {
    const key = "roi-median|" + state.subgroup + "|" + group;
    if (DOMAIN.has(key)) return DOMAIN.get(key);
    const vals = DISTRICTS
      .filter((d) => d.group === group)
      .map((d) => roiFor(d.lea, OUTCOMES[d.lea] && OUTCOMES[d.lea][state.subgroup]))
      .filter((v) => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);
    const med = vals.length
      ? (vals.length % 2 ? vals[(vals.length - 1) / 2]
        : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2)
      : null;
    DOMAIN.set(key, med);
    return med;
  }

  // Percent above the district's own OSP-group median, for the selected group.
  function roiExcess(lea) {
    const d = BY_LEA[lea];
    if (!d) return null;
    const v = roiFor(lea, OUTCOMES[lea] && OUTCOMES[lea][state.subgroup]);
    const med = roiMedian(d.group);
    if (v === null || med === null || !(med > 0)) return null;
    return (v / med - 1) * 100;
  }

  function roiRelativeText(lea, short = false) {
    const ex = roiExcess(lea);
    if (ex === null) return short ? "—" : "no comparison available";
    if (ex <= 0) return short ? "≤ median" : "at or below the group median";
    return "+" + Math.round(ex) + "% vs median";
  }

  function groupAvg(group, year, metric) {
    const vals = DISTRICTS.filter((d) => d.group === group)
      .map((d) => valueFor(d.lea, year, metric))
      .filter((v) => v !== null && Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function groupSeries(group, metric) {
    return YEARS.map((y) => ({ y, v: groupAvg(group, y, metric) }));
  }

  function valueFor(lea, year, metric) {
    if (metric.mode === "outcomes") {
      const rec = OUTCOMES[lea] && OUTCOMES[lea][state.subgroup];
      return rec ? metric.get(rec) : null;
    }
    if (metric.mode === "roi") {
      return roiFor(lea, OUTCOMES[lea] && OUTCOMES[lea][state.subgroup]);
    }
    const rec = VALS[lea] && VALS[lea][year];
    return rec ? metric.get(rec) : null;
  }

  function recordFor(lea) {
    if (usesOutcomes()) {
      return (OUTCOMES[lea] && OUTCOMES[lea][state.subgroup]) || null;
    }
    return (VALS[lea] && VALS[lea][state.year]) || null;
  }

  function schoolYear(y) {
    return `${y - 1}\u2013${String(y).slice(2)}`;
  }

  function scaleFor(metric) {
    const key = metric.id + "|" + state.scale + (state.scale === "year" ? "|" + state.year : "")
      + (usesOutcomes() ? "|" + state.subgroup : "");
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
    const out = { min, max, breaks, reverse: !!metric.lowerIsBetter, roi: metric.mode === "roi" };
    DOMAIN.set(key, out);
    return out;
  }

  function colorFor(lea, v, d) {
    if (v === null) return "#f1f4f6";
    if (d.roi) {
      const ex = roiExcess(lea);
      if (ex === null) return "#f1f4f6";
      let i = 0;
      while (i < ROI_STEPS.length && ex >= ROI_STEPS[i]) i++;
      return ROI_PALETTE[i];
    }
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
      fillColor: colorFor(f.lea, v, d),
      fillOpacity: on ? 1 : 0.12,
      color: sel ? "#0b2b3a" : "#ffffff",
      weight: sel ? 2.4 : 0.9,
      opacity: on ? 1 : 0.35,
    };
  }

  function tooltipFor(layer) {
    const f = layer.feature.properties;
    const v = valueFor(f.lea, state.year, state.metric);
    const shown = v === null ? "\u2014" : state.metric.fmt(v);
    const sub = usesOutcomes() ? ` &middot; ${SUBGROUP_LABELS[state.subgroup]}` : "";
    const rel = state.mode === "roi" ? ` &middot; ${roiRelativeText(f.lea, true)}` : "";
    return `<b>${f.name}</b><span>${state.metric.short}, ${periodLabel()}${sub}</span><br>` +
      `<em>${shown}</em> <span>${f.group}${rel}</span>`;
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
    const palette = d.roi ? ROI_PALETTE : PALETTE;
    strip.innerHTML = palette.map((c) => `<i style="background:${c}"></i>`).join("");
    $("legendTitle").textContent = state.metric.label;
    $("legendNote").textContent = state.mode === "roi"
      ? `${periodLabel()} \u00b7 ${SUBGROUP_LABELS[state.subgroup]} \u00b7 % above OSP group median`
      : state.mode === "outcomes"
        ? `${periodLabel()} \u00b7 ${SUBGROUP_LABELS[state.subgroup]}`
        : (state.scale === "year" ? `relative to FY${state.year}` : "fixed across all years");
    $("legendMin").textContent = d.roi ? "at/below median" : state.metric.fmt(d.min);
    $("legendMax").textContent = d.roi ? "+150% or more" : state.metric.fmt(d.max);
  }

  /* ---------- ranking ---------- */

  function renderRanking() {
    const list = $("rankList");
    const rev = scaleFor(state.metric).reverse;
    const rows = filtered()
      .map((d) => ({ d, v: valueFor(d.lea, state.year, state.metric) }))
      .filter((r) => r.v !== null && Number.isFinite(r.v))
      .sort((a, b) => rev ? a.v - b.v : b.v - a.v);

    $("rankYear").textContent = periodLabel();
    if (!rows.length) {
      list.innerHTML = `<li class="rank-empty">No districts match.</li>`;
      return;
    }
    const best = rows[0].v || 1;
    list.innerHTML = rows.map((r, i) => {
      const width = rev
        ? Math.max(2, Math.min(100, (best / r.v) * 100))
        : Math.max(2, (r.v / best) * 100);
      return `
      <li>
        <button class="rank-item${r.d.lea === state.selected ? " is-sel" : ""}" data-lea="${r.d.lea}">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${r.d.name}</span>
          <span class="rank-val">${state.metric.fmt(r.v)}</span>
          <span class="rank-bar"><i style="width:${width}%"></i></span>
        </button>
      </li>`;
    }).join("");
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
    const rec = recordFor(lea);
    if (!rec) { closeDetail(); return; }
    const v = valueFor(lea, state.year, state.metric);
    const rows = filtered()
      .map((x) => valueFor(x.lea, state.year, state.metric))
      .filter((x) => x !== null)
      .sort((a, b) => b - a);

    $("detail").hidden = false;
    $("detailName").textContent = d.name;
    $("detailGroup").textContent = d.group;
    $("detailLea").textContent = "LEA " + lea
      + (usesOutcomes() ? ` \u00b7 ${SUBGROUP_LABELS[state.subgroup]}` : "");
    $("detailValue").textContent = v === null ? "\u2014" : state.metric.fmt(v);
    $("detailMetric").textContent = state.metric.label + ", " + periodLabel();
    $("detailRank").textContent = v === null ? "suppressed" : `#${rows.indexOf(v) + 1} of ${rows.length}`;

    const stats = state.mode === "roi" ? roiStats(rec, lea)
      : state.mode === "outcomes" ? outcomeStats(rec)
        : financeStats(rec);
    $("statGrid").innerHTML = stats
      .map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("");

    const gAvg = groupAvg(d.group, state.year, state.metric);
    const gEl = $("groupAvg");
    if (gAvg !== null && v !== null) {
      const cmp = v > gAvg ? "above" : v < gAvg ? "below" : "at";
      const quality = state.mode === "roi"
        ? (cmp === "below" ? " · better value" : cmp === "above" ? " · worse value" : "")
        : "";
      gEl.hidden = false;
      gEl.innerHTML = `<strong>${d.group} average:</strong> ${state.metric.fmt(gAvg)}`
        + ` &nbsp;&middot;&nbsp; this district is ${state.metric.fmt(v)}`
        + ` (${cmp} avg${quality})`;
    } else {
      gEl.hidden = true;
    }

    if (usesOutcomes()) renderSubgroupChart(lea);
    else renderChart(lea);
  }

  function financeStats(rec) {
    return [
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
  }

  function outcomeStats(rec) {
    const show = (v) => v === null ? "suppressed" : pct(v);
    return [
      ["Students tested", int(rec.num_tested)],
      ["All students", show(rec.pct_glp)],
      ["College/career ready", show(rec.pct_ccr)],
      ["Not proficient", show(rec.pct_notprof)],
      ["Level 3", show(rec.pct_l3)],
      ["Level 4", show(rec.pct_l4)],
      ["Level 5", show(rec.pct_l5)],
    ];
  }

  function roiStats(rec, lea) {
    const show = (v) => v === null ? "suppressed" : pct(v);
    const fin = FIN_2025[lea] || {};
    const cost = roiFor(lea, rec);
    const med = roiMedian(BY_LEA[lea].group);
    return [
      ["Spend / pupil, FY25", fin.total_per_pupil ? usd(fin.total_per_pupil) : "\u2014"],
      ["Proficient (GLP)", show(rec.pct_glp)],
      ["Cost / proficient", cost === null ? "\u2014" : usd(cost)],
      ["Group median", med === null ? "\u2014" : usd(med)],
      ["vs median", roiRelativeText(lea, true)],
      ["Students tested", int(rec.num_tested)],
      ["College/career ready", show(rec.pct_ccr)],
      ["Not proficient", show(rec.pct_notprof)],
    ];
  }

  function closeDetail() {
    $("detail").hidden = true;
  }

  function renderSubgroupChart(lea) {
    const roi = state.mode === "roi";
    const field = state.metric.field;
    const rows = CHART_SUBGROUPS.map((sg) => {
      const rec = OUTCOMES[lea] && OUTCOMES[lea][sg];
      if (!rec) return null;
      const v = roi ? roiFor(lea, rec) : (field ? rec[field] : null);
      return v === null || !Number.isFinite(v) ? null : { sg, v };
    }).filter(Boolean);

    $("trendTitle").textContent = `Subgroup breakdown \u00b7 ${periodLabel()}`;
    if (!rows.length) {
      $("chart").innerHTML = `<p class="chart-note">No reported values for this measure.</p>`;
      return;
    }
    const max = Math.max(...rows.map((r) => r.v)) || 1;
    const fmt = roi ? usd : state.metric.fmt;
    $("chart").innerHTML = `<div class="sub-bars" role="img" aria-label="${state.metric.label} by student group, ${periodLabel()}">`
      + rows.map((r) => `
        <div class="sub-row${r.sg === state.subgroup ? " is-cur" : ""}">
          <span class="sub-label" title="${SUBGROUP_LABELS[r.sg] || r.sg}">${SUBGROUP_LABELS[r.sg] || r.sg}</span>
          <span class="sub-track"><i style="width:${Math.max(2, Math.min(100, (r.v / max) * 100))}%"></i></span>
          <span class="sub-val">${fmt(r.v)}</span>
        </div>`).join("")
      + `</div><p class="chart-note">`
      + (roi
        ? "Bars show cost per proficient student for each group; longer bars cost more. "
        : `Bars show ${state.metric.short.toLowerCase()} for each student group. `)
      + `The highlighted row is the group selected on the map.</p>`;
  }

  function renderChart(lea) {
    const series = YEARS.map((y) => ({
      y,
      v: VALS[lea][y] ? state.metric.get(VALS[lea][y]) : null,
    })).filter((p) => p.v !== null);

    const gSeries = groupSeries(BY_LEA[lea].group, state.metric)
      .filter((p) => p.v !== null);

    const W = 300, H = 120, top = 10, bottom = 92;
    const allVals = [...series.map((p) => p.v), ...gSeries.map((p) => p.v)];
    let lo = Math.min(...allVals), hi = Math.max(...allVals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.1;
    lo -= pad; hi += pad;
    const x = (y) => ((y - 2005) / 20) * W;
    const yv = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);

    const line = series.map((p) => `${x(p.y).toFixed(1)},${yv(p.v).toFixed(1)}`).join(" ");
    const gLine = gSeries.map((p) => `${x(p.y).toFixed(1)},${yv(p.v).toFixed(1)}`).join(" ");
    const area = `M0,${bottom} L${line.split(" ").join(" L")} L${W},${bottom} Z`;
    const cur = series.find((p) => p.y === state.year);
    const first = series[0], last = series[series.length - 1];
    const gFirst = gSeries[0], gLast = gSeries[gSeries.length - 1];

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
        <polyline points="${gLine}" fill="none" stroke="#9aa9b5" stroke-width="1.4"
                  stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="4 3"/>
        <polyline points="${line}" fill="none" stroke="#0d6b8a" stroke-width="1.8"
                  stroke-linejoin="round" stroke-linecap="round"/>
        ${dot}
        <text x="0" y="${H - 2}" font-size="9" fill="#6b7d8b">2005</text>
        <text x="${W}" y="${H - 2}" font-size="9" fill="#6b7d8b" text-anchor="end">2025</text>
      </svg>
      <p class="chart-note">
        <span style="color:#0d6b8a">\u2501</span> ${BY_LEA[lea].name}
        &nbsp;&middot;&nbsp;
        <span style="color:#9aa9b5">\u2509</span> ${BY_LEA[lea].group} avg
        &nbsp;&middot;&nbsp;
        ${state.metric.fmt(first.v)} \u2192 ${state.metric.fmt(last.v)}
      </p>`;

    $("trendTitle").textContent =
      `${state.metric.short}: ${state.metric.fmt(first.v)} \u2192 ${state.metric.fmt(last.v)}` +
      ` (group avg ${state.metric.fmt(gFirst.v)} \u2192 ${state.metric.fmt(gLast.v)})`;
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
    if (state.mode !== "finance") return;
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

  /* ---------- data mode ---------- */

  function applyMode() {
    const out = usesOutcomes();
    document.querySelectorAll(".mode-btn").forEach((b) => {
      const on = b.dataset.mode === state.mode;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".chip[data-group]").forEach((c) => {
      const on = c.dataset.group === state.group;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("subgroupField").hidden = !out;
    $("timeline").hidden = out;
    document.querySelector(".legend-scale").hidden = out;
    $("yearLabel").textContent = state.mode === "roi" ? "ROI"
      : state.mode === "outcomes" ? "Outcomes" : "FY" + state.year;
    $("syLabel").textContent = state.mode === "roi" ? "FY2025 \u2192 2025\u201326"
      : state.mode === "outcomes" ? "2025\u201326" : schoolYear(state.year);

    const sel = $("metric");
    sel.innerHTML = activeMetrics().map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
    sel.value = state.metric.id;
    $("metricHint").textContent = state.metric.hint;
    $("year").value = state.year;
    if (SUBGROUPS.length) $("subgroup").value = state.subgroup;

    if (!out) {
      document.querySelectorAll(".legend-scale button").forEach((b) => {
        const on = b.dataset.scale === state.scale;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    if (timer) togglePlay();
    state.mode = mode;
    state.metric = mode === "outcomes" ? OUTCOME_METRICS[0]
      : mode === "roi" ? ROI_METRICS[0] : METRICS[0];
    state.subgroup = "ALL";
    state.scale = "year";
    DOMAIN.clear();
    applyMode();
    renderLegend();
    refreshStyles();
    renderRanking();
    if (state.selected) openDetail(state.selected);
    syncHash();
  }

  /* ---------- state plumbing ---------- */

  function refreshStyles() {
    if (LAYER) LAYER.setStyle(styleFor);
  }

  function syncHash() {
    const parts = [
      `mode=${state.mode}`, `y=${state.year}`, `m=${state.metric.id}`,
      `g=${state.group}`, `s=${state.scale}`,
    ];
    if (usesOutcomes()) parts.push(`sg=${state.subgroup}`);
    if (state.selected) parts.push(`d=${state.selected}`);
    try {
      history.replaceState(null, "", "#" + parts.join("&"));
    } catch (e) { /* file:// */ }
  }

  function readHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const mode = h.get("mode");
    if (["finance", "outcomes", "roi"].includes(mode)) state.mode = mode;
    const m = activeMetrics().find((x) => x.id === h.get("m"));
    if (m) state.metric = m;
    else state.metric = state.mode === "outcomes" ? OUTCOME_METRICS[0]
      : state.mode === "roi" ? ROI_METRICS[0] : METRICS[0];
    const y = Number(h.get("y"));
    if (y >= 2005 && y <= 2025) state.year = y;
    const g = h.get("g");
    if (["all", "Large", "Medium", "Small"].includes(g)) state.group = g;
    const sc = h.get("s");
    if (sc === "fixed" || sc === "year") state.scale = sc;
    if (usesOutcomes()) {
      state.scale = "year";
      const sg = h.get("sg");
      if (sg && SUBGROUPS.includes(sg)) state.subgroup = sg;
    }
    const d = h.get("d");
    if (d && BY_LEA[d]) state.selected = d;
  }

  /* ---------- wiring ---------- */

  function wire() {
    const sel = $("metric");
    sel.innerHTML = activeMetrics().map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
    sel.value = state.metric.id;
    sel.addEventListener("change", () => {
      state.metric = activeMetrics().find((m) => m.id === sel.value);
      $("metricHint").textContent = state.metric.hint;
      renderLegend();
      refreshStyles();
      renderRanking();
      if (state.selected) openDetail(state.selected);
      syncHash();
    });
    $("metricHint").textContent = state.metric.hint;

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    const sgSel = $("subgroup");
    sgSel.innerHTML = SUBGROUPS.map((s) => `<option value="${s}">${SUBGROUP_LABELS[s] || s}</option>`).join("");
    sgSel.value = state.subgroup;
    sgSel.addEventListener("change", () => {
      state.subgroup = sgSel.value;
      DOMAIN.clear();
      renderLegend();
      refreshStyles();
      renderRanking();
      if (state.selected) openDetail(state.selected);
      syncHash();
    });

    document.querySelectorAll(".chip[data-group]").forEach((chip) => {
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
      readHash();
      applyMode();
      DOMAIN.clear();
      renderLegend();
      refreshStyles();
      renderRanking();
      if (state.selected) { openDetail(state.selected); ensureVisible(state.selected); }
      else closeDetail();
    });
  }

  /* ---------- boot ---------- */

  async function boot() {
    const [panel, geo, context, outcomes] = await Promise.all([
      fetch("data/panel.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/districts.geojson").then((r) => r.json()),
      fetch("data/context.geojson").then((r) => r.json()),
      fetch("data/outcomes.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);

    SUBGROUPS = outcomes.subgroups;
    const of = {};
    outcomes.fields.forEach((f, i) => { of[f] = i + 2; });
    outcomes.rows.forEach((row) => {
      const lea = row[0], sg = row[1];
      const rec = {};
      outcomes.fields.forEach((f) => { rec[f] = row[of[f]] === null ? null : row[of[f]]; });
      (OUTCOMES[lea] = OUTCOMES[lea] || {})[sg] = rec;
    });

    const idx = {};
    panel.fields.forEach((f, i) => { idx[f] = i + 2; });
    panel.rows.forEach((row) => {
      const lea = row[0], year = row[1];
      const rec = {};
      panel.fields.forEach((f) => { rec[f] = row[idx[f]]; });
      (VALS[lea] = VALS[lea] || {})[year] = rec;
      if (year === 2025) FIN_2025[lea] = rec;
    });

    DISTRICTS = panel.districts;
    DISTRICTS.forEach((d) => { BY_LEA[d.lea] = d; });
    GEO = geo;

    readHash();
    $("year").value = state.year;
    applyMode();

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
