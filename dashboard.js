// ============================================================
// JBC VOTING SYSTEM — dashboard.js  (Phase 8: Live Dashboard)
// ============================================================
// Designed for a large monitor or projector during deliberation.
// Auto-refreshes every 8 seconds.
// No login required — public read-only view.
// Grouped: Appellate first, then Lower Courts by region.
// ============================================================

const REFRESH_INTERVAL_MS = 8000;

const REGION_ORDER = [
  "NCR","CAR",
  "Region 1","Region 2","Region 3","Region 4","Region 5",
  "Region 6","Region 7","Region 8","Region 9","Region 10",
  "Region 11","Region 12","BARMM"
];

// ── State ─────────────────────────────────────────────────────
let refreshTimer  = null;
let lastData      = null;
let activeBatch   = null;

// ── DOM refs ──────────────────────────────────────────────────
const headerBatch  = document.getElementById("headerBatch");
const refreshDot   = document.getElementById("refreshDot");
const refreshLabel = document.getElementById("refreshLabel");
const lastUpdated  = document.getElementById("lastUpdated");
const stateLoading = document.getElementById("stateLoading");
const stateError   = document.getElementById("stateError");
const stateErrorText=document.getElementById("stateErrorText");
const summaryBar   = document.getElementById("summaryBar");
const dashboardOut = document.getElementById("dashboardOut");
const sumTotal     = document.getElementById("sumTotal");
const sumLocked    = document.getElementById("sumLocked");
const sumOpen      = document.getElementById("sumOpen");
const sumNomAll    = document.getElementById("sumNomAll");

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Dashboard is a public read-only page — no login check
  // But it needs the active batch from session OR from the backend
  activeBatch = getSessionBatch();
  headerBatch.textContent = activeBatch?.batch_name || "Active Batch";

  loadDashboard();
  refreshTimer = setInterval(loadDashboard, REFRESH_INTERVAL_MS);
});

// ── Fetch and render ──────────────────────────────────────────
async function loadDashboard() {
  // Need a batch_id — try session first, then try to get active batch
  let batch_id = activeBatch?.batch_id;

  if (!batch_id) {
    try {
      const loginRes = await callAPI("getBatches", {});
      if (loginRes.status === "ok") {
        const active = (loginRes.batches || []).find(b => String(b.is_active).toUpperCase() === "TRUE");
        if (active) {
          activeBatch = active;
          batch_id    = active.batch_id;
          headerBatch.textContent = active.batch_name || "Active Batch";
        }
      }
    } catch { /* silent fail */ }
  }

  if (!batch_id) {
    showState("error", "No active batch found.");
    setRefreshStatus(false);
    return;
  }

  try {
    const res = await callAPI("getDashboardData", { batch_id });

    if (res.status !== "ok") {
      showState("error", res.message || "Failed to load dashboard data.");
      setRefreshStatus(false);
      return;
    }

    lastData = res;
    renderDashboard(res);
    setRefreshStatus(true);
    lastUpdated.textContent = "Updated " + new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  } catch (err) {
    setRefreshStatus(false);
    console.error("Dashboard refresh error:", err);
    // Don't clear the dashboard on network hiccup — keep showing last data
    if (!lastData) showState("error", "Network error. Retrying…");
  }
}

// ── Render full dashboard ─────────────────────────────────────
function renderDashboard(res) {
  const stations        = res.dashboard       || [];
  const nominationLimit = res.nomination_limit || 0;

  // Summary
  sumTotal.textContent  = stations.length;
  sumLocked.textContent = stations.filter(s => s.is_locked).length;
  sumOpen.textContent   = stations.filter(s => !s.is_locked && !s.nominate_all).length;
  sumNomAll.textContent = stations.filter(s => s.nominate_all).length;

  showState("dashboard");

  dashboardOut.innerHTML = "";

  const appellate   = stations.filter(s => s.court_category === "Appellate");
  const lowerCourts = stations.filter(s => s.court_category !== "Appellate");

  // ── Appellate ──
  if (appellate.length > 0) {
    const group = makeGroup("Appellate Courts", appellate.length);
    const grid  = makeGrid();
    appellate.forEach(s => grid.appendChild(makeStationCard(s, nominationLimit)));
    group.appendChild(grid);
    dashboardOut.appendChild(group);
  }

  // ── Lower Courts by region ──
  if (lowerCourts.length > 0) {
    const group = makeGroup("Lower Courts", lowerCourts.length);

    const byRegion = {};
    lowerCourts.forEach(s => {
      const r = s.region || "Other";
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(s);
    });

    const orderedRegions = [
      ...REGION_ORDER.filter(r => byRegion[r]),
      ...Object.keys(byRegion).filter(r => !REGION_ORDER.includes(r)).sort()
    ];

    orderedRegions.forEach(region => {
      const lbl = document.createElement("div");
      lbl.className = "region-label";
      lbl.textContent = region;
      group.appendChild(lbl);

      const grid = makeGrid();
      byRegion[region].forEach(s => grid.appendChild(makeStationCard(s, nominationLimit)));
      group.appendChild(grid);
    });

    dashboardOut.appendChild(group);
  }
}

// ── Build group wrapper ───────────────────────────────────────
function makeGroup(label, count) {
  const g = document.createElement("div");
  g.className = "group";
  g.innerHTML = `
    <div class="group-header">
      <span class="group-label">${esc(label)}</span>
      <span class="group-rule"></span>
      <span class="group-count">${count}</span>
    </div>
  `;
  return g;
}

function makeGrid() {
  const g = document.createElement("div");
  g.className = "station-grid";
  return g;
}

// ── Build station card ────────────────────────────────────────
function makeStationCard(station, nominationLimit) {
  const card = document.createElement("div");
  const cls  = station.is_locked    ? "locked"
             : station.nominate_all ? "nominate-all"
             : "";
  card.className = `station-card ${cls}`;

  // Status badges
  let badges = "";
  if (station.is_locked) badges += `<span class="badge locked">Locked</span>`;
  else if (station.nominate_all) badges += `<span class="badge nominate-all">Nominate All</span>`;
  else badges += `<span class="badge open">Open</span>`;
  if (station.vote_threshold > 0) badges += `<span class="badge threshold">T: ${station.vote_threshold}</span>`;

  // Member dots
  const allMemberDots = buildMemberDots(station);

  // Body content
  const bodyHtml = station.nominate_all
    ? buildNomAllBody(station)
    : buildTallyBody(station, nominationLimit);

  // Pending members
  const pendingHtml = station.members_pending?.length > 0
    ? `<div class="sc-pending">Pending: ${station.members_pending.map(n => esc(n)).join(", ")}</div>`
    : "";

  card.innerHTML = `
    <div class="sc-header">
      <span class="sc-title">${esc(station.court_station)}</span>
      <div class="sc-badges">${badges}</div>
    </div>
    <div class="sc-members">
      <span class="sc-member-label">Members:</span>
      ${allMemberDots}
    </div>
    ${bodyHtml}
    ${pendingHtml}
  `;

  return card;
}

// ── Member voted dots ─────────────────────────────────────────
function buildMemberDots(station) {
  // We know there are 7 members total
  const votedIds = station.members_voted || [];
  const pending  = station.members_pending || [];
  const total    = votedIds.length + pending.length;
  const dots     = [];

  for (let i = 0; i < votedIds.length; i++) {
    dots.push(`<span class="member-dot voted" title="Voted"></span>`);
  }
  for (let i = 0; i < pending.length; i++) {
    dots.push(`<span class="member-dot pending" title="${esc(pending[i])}"></span>`);
  }

  return dots.join("") + `<span style="font-size:11px;color:var(--grey-500);margin-left:4px">${votedIds.length}/${total || 7}</span>`;
}

// ── Tally body (regular voting) ───────────────────────────────
function buildTallyBody(station, nominationLimit) {
  const applicants  = station.applicants || [];
  const threshold   = station.vote_threshold || 0;
  const maxVotes    = Math.max(...applicants.map(a => a.vote_count), 1);

  if (applicants.length === 0) {
    return `<div class="sc-body"><span style="font-size:12px;color:var(--grey-500);font-style:italic">No applicants.</span></div>`;
  }

  let rows = "";
  let thresholdShown = false;

  // Sort by vote count desc (already sorted from backend, but ensure)
  const sorted = [...applicants].sort((a, b) => b.vote_count - a.vote_count);

  sorted.forEach((a, idx) => {
    // Insert threshold line between met and not-met
    if (threshold > 0 && !thresholdShown && a.vote_count < threshold) {
      rows += `<div class="threshold-line">threshold: ${threshold} votes</div>`;
      thresholdShown = true;
    }

    const met       = threshold > 0 && a.vote_count >= threshold;
    const barWidth  = maxVotes > 0 ? Math.round((a.vote_count / maxVotes) * 100) : 0;
    const limitWarn = nominationLimit > 0 && a.limit_exceeded
      ? `<span class="limit-flag">⚠</span>` : "";
    const checkmark = met ? `<span class="tally-check">✓</span>` : `<span class="tally-check"></span>`;

    rows += `
      <div class="tally-row ${met ? "threshold-met" : ""}">
        <span class="tally-name">${esc(a.full_name)}</span>
        <div class="tally-bar-wrap">
          <div class="tally-bar-bg">
            <div class="tally-bar-fill ${met ? "met" : ""}" style="width:${barWidth}%"></div>
          </div>
        </div>
        <span class="tally-count">${a.vote_count}</span>
        ${checkmark}
        ${limitWarn}
      </div>
    `;
  });

  // If all applicants met threshold, show line at bottom
  if (threshold > 0 && !thresholdShown) {
    rows += `<div class="threshold-line">all above threshold: ${threshold}</div>`;
  }

  return `<div class="sc-body">${rows}</div>`;
}

// ── Nominate All body ─────────────────────────────────────────
function buildNomAllBody(station) {
  const cls = station.nominate_all_classification || "ALL";
  const applicants = (station.applicants || []).filter(a =>
    cls === "ALL" || a.classification === cls
  );

  if (applicants.length === 0) {
    return `<div class="sc-nom-all-body"><span style="font-size:12px;color:var(--grey-500);font-style:italic">No applicants in this classification.</span></div>`;
  }

  const clsMap = {
    "1st Preference":"pref1","2nd Preference":"pref2",
    "Least Preferred":"least","For Reporting":"report"
  };

  const items = applicants.map(a => {
    const clsCss = clsMap[a.classification] || "pref2";
    return `
      <div class="nom-all-item">
        <span class="nom-all-name">${esc(a.full_name)}</span>
        <span class="nom-all-cls ${clsCss}">${esc(a.classification)}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="sc-nom-all-body">
      <div class="nom-all-list">${items}</div>
    </div>
  `;
}

// ── UI states ─────────────────────────────────────────────────
function showState(state, msg) {
  stateLoading.classList.toggle("hidden", state !== "loading");
  stateError.classList.toggle("hidden",   state !== "error");
  summaryBar.classList.toggle("hidden",   state !== "dashboard");
  dashboardOut.classList.toggle("hidden", state !== "dashboard");
  if (state === "error" && msg) stateErrorText.textContent = msg;
}

function setRefreshStatus(ok) {
  refreshDot.classList.toggle("error", !ok);
  refreshLabel.textContent = ok ? "Live" : "Offline";
}

// ── HTML escape ───────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}