// -- Judicial Regions -- //
const REGION_ORDER = [
  "NCJR",   // National Capital Judicial Region — always shown first
  "NCR",    // (kept in case some stations still use this spelling)
  "Region 1",
  "Region 2",
  "Region 3",
  "Region 4",
  "Region 5",
  "Region 6",
  "Region 7",
  "Region 8",
  "Region 9",
  "Region 10",
  "Region 11",
  "Region 12"
];

// Matches a region to REGION_ORDER ignoring case and extra spaces,
// so "ncjr", " NCJR ", "Ncjr" etc. are all treated as "NCJR".
function regionRank(region) {
  const clean = String(region || "").trim().toUpperCase();
  const i = REGION_ORDER.findIndex(r => r.toUpperCase() === clean);
  return i === -1 ? REGION_ORDER.length : i;
}

// Appellate courts are always shown in this order: SC, CA, CTA, SB (Sandiganbayan),
// then the rest. Stations of the same court keep the order they have in the sheet.
// The court is recognised from its court_type (SC, CA, CTA, SB, OMB, LEB) and also
// from full names such as "Supreme Court" or "Court of Appeals", so it still works
// if the sheet was filled in with the long names.
const APPELLATE_ORDER = ["SC", "CA", "CTA", "SB", "OMB", "LEB"];
const APPELLATE_MATCH = [            // checked in this order (CTA before CA)
  ["SC",  /\bSC\b|SUPREME/],
  ["CTA", /\bCTA\b|TAX APPEALS/],
  ["CA",  /\bCA\b|COURT OF APPEALS/],
  ["SB",  /\bSB\b|SANDIGANBAYAN/],
  ["OMB", /\bOMB\b|OMBUDSMAN/],
  ["LEB", /\bLEB\b|LEGAL EDUCATION/]
];

function appellateRank(station) {
  const texts = [station.court_type, station.court_station]
    .map(t => String(t || "").toUpperCase());
  for (const text of texts) {                       // court_type first, then station name
    for (const [key, re] of APPELLATE_MATCH) {
      if (re.test(text)) return APPELLATE_ORDER.indexOf(key);
    }
  }
  return APPELLATE_ORDER.length;                    // unknown → last
}

function sortAppellate(list) {
  return [...list].sort((a, b) => appellateRank(a) - appellateRank(b));
}

// -- State -- //
let allStations  = [];
let activeFilter = "all";

// -- DOM refs -- //
const memberNameEl  = document.getElementById("memberName");
const batchLabelEl  = document.getElementById("batchLabel");
const btnLogout     = document.getElementById("btnLogout");
const stateLoading  = document.getElementById("stateLoading");
const stateError    = document.getElementById("stateError");
const stateErrorText= document.getElementById("stateErrorText");
const stateEmpty    = document.getElementById("stateEmpty");
const stateNoMatch  = document.getElementById("stateNoMatch");
const stationsOut   = document.getElementById("stationsOut");
const btnRetry      = document.getElementById("btnRetry");
const filterBar     = document.getElementById("filterBar");

// -- Init -- //
document.addEventListener("DOMContentLoaded", () => {
  requireLogin();   // redirects to index.html if no session

  const member = getSessionMember();
  const batch  = getSessionBatch();

  memberNameEl.textContent = member?.name || "Member";
  batchLabelEl.textContent = batch?.batch_name || "No active batch";

  if (!batch) {
    showState("error", "No active batch found. Contact your administrator.");
    return;
  }

  btnLogout.addEventListener("click", () => logout());
  btnRetry.addEventListener("click",  loadStations);

  filterBar.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      filterBar.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderStations();
    });
  });

  loadStations();
});

// -- Fetch stations from backend -- //
async function loadStations() {
  const batch = getSessionBatch();
  showState("loading");

  try {
    const res = await callAPI("getStations", { batch_id: batch.batch_id });

    if (res.status !== "ok") {
      showState("error", res.message || "Could not load stations.");
      return;
    }

    allStations = res.stations || [];

    if (allStations.length === 0) {
      showState("empty");
      return;
    }

    showState("stations");
    renderStations();

  } catch (err) {
    showState("error", "Network error. Please check your connection and try again.");
    console.error("loadStations error:", err);
  }
}

// ── Render stations (respects active filter) ──────────────────
function renderStations() {
  stationsOut.innerHTML = "";

  const filtered = allStations.filter(s => {
    if (activeFilter === "all")         return true;
    if (activeFilter === "Appellate")   return s.court_category === "Appellate";
    if (activeFilter === "Lower Court") return s.court_category === "Lower Court";
    if (activeFilter === "open")        return !s.is_locked;
    if (activeFilter === "locked")      return s.is_locked;
    return true;
  });

  if (filtered.length === 0) {
    showState("nomatch");
    return;
  }

  // Make sure stations-out is visible
  stationsOut.classList.remove("hidden");
  stateNoMatch.classList.add("hidden");

  const appellate   = sortAppellate(filtered.filter(s => s.court_category === "Appellate"));
  const lowerCourts = filtered.filter(s => s.court_category === "Lower Court");

  // ── Appellate group ──
  if (appellate.length > 0) {
    const group = makeGroup("Appellate Courts", appellate.length);
    const grid  = makeGrid();
    appellate.forEach(s => grid.appendChild(makeCard(s)));
    group.appendChild(grid);
    stationsOut.appendChild(group);
  }

  // ── Lower Courts group — sub-grouped by region ──
  if (lowerCourts.length > 0) {
    const group = makeGroup("Lower Courts", lowerCourts.length);

    const byRegion = {};
    lowerCourts.forEach(s => {
      const r = s.region || "Other";
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(s);
    });

    const orderedRegions = Object.keys(byRegion).sort((a, b) =>
      regionRank(a) - regionRank(b) || a.localeCompare(b)
    );

    orderedRegions.forEach(region => {
      const lbl = document.createElement("div");
      lbl.className   = "region-label";
      lbl.textContent = region;
      group.appendChild(lbl);

      const grid = makeGrid();
      byRegion[region].forEach(s => grid.appendChild(makeCard(s)));
      group.appendChild(grid);
    });

    stationsOut.appendChild(group);
  }
}

// ── Build DOM: group wrapper -- //
function makeGroup(label, count) {
  const g   = document.createElement("div");
  g.className = "group";
  const hdr = document.createElement("div");
  hdr.className = "group-header";
  hdr.innerHTML = `
    <span class="group-label">${esc(label)}</span>
    <span class="group-rule"></span>
    <span class="group-count">${count}</span>
  `;
  g.appendChild(hdr);
  return g;
}

// ── Build DOM: station grid -- //
function makeGrid() {
  const g = document.createElement("div");
  g.className = "station-grid";
  return g;
}

// ── Build DOM: station card -- //
function makeCard(station) {
  const card = document.createElement("div");
  card.className = "station-card" + (station.is_locked ? " locked" : "");

  // Status badge
  let badgeHtml = "";
  if (station.is_locked) {
    badgeHtml = `<span class="status-badge locked">Locked</span>`;
  } else if (station.nominate_all) {
    badgeHtml = `<span class="status-badge nominate-all">Nominate All</span>`;
  } else {
    badgeHtml = `<span class="status-badge open">Open</span>`;
  }

  // Region chip
  const regionChip = station.region
    ? `<span class="chip">${esc(station.region)}</span>`
    : "";

  // Threshold
  const threshText = station.vote_threshold > 0
    ? `Threshold: ${station.vote_threshold} votes`
    : "No threshold set";

  card.innerHTML = `
    <div class="card-top">
      <span class="court-type-badge">${esc(station.court_type)}</span>
      ${badgeHtml}
    </div>
    <div class="court-name">${esc(station.court_station)}</div>
    <div class="card-chips">
      <span class="chip">${esc(station.court_category)}</span>
      ${regionChip}
    </div>
    <div class="card-footer">
      <span class="threshold-text">${threshText}</span>
      <span class="card-arrow">→</span>
    </div>
  `;

  if (!station.is_locked) {
    card.addEventListener("click", () => goToNominees(station));
  }

  return card;
}

// ── Navigate to nominees page -- //
function goToNominees(station) {
  // Store full station context for nominees.js to read on load
  sessionStorage.setItem("selected_station", JSON.stringify({
    batch_station_id:            station.batch_station_id,
    station_id:                  station.station_id,
    batch_id:                    station.batch_id,
    court_category:              station.court_category,
    court_type:                  station.court_type,
    court_station:               station.court_station,
    region:                      station.region,
    is_locked:                   station.is_locked,
    nominate_all:                station.nominate_all,
    nominate_all_classification: station.nominate_all_classification,
    vote_threshold:              station.vote_threshold
  }));

  window.location.href = "nominees.html";
}

// ── Show / hide UI states -- //
function showState(state, msg) {
  stateLoading.classList.toggle("hidden", state !== "loading");
  stateError.classList.toggle("hidden",   state !== "error");
  stateEmpty.classList.toggle("hidden",   state !== "empty");
  stateNoMatch.classList.toggle("hidden", state !== "nomatch");
  stationsOut.classList.toggle("hidden",  state !== "stations");

  if (state === "error" && msg) stateErrorText.textContent = msg;
}

// ── Escape HTML -- //
function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}