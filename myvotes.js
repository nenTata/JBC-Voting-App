// ==============
// myvotes.js 
// ==============


// ── State ────────────────────────────────────────────────────
let member     = null;
let batch      = null;
let allStations= [];   // batch stations with full details
let allVotes   = [];   // member's latest votes for this batch
let allApplicants = []; // to look up names & classification

// ── DOM refs ─────────────────────────────────────────────────
const headerBatch    = document.getElementById("headerBatch");
const memberNameEl   = document.getElementById("memberName");
const btnBack        = document.getElementById("btnBack");
const btnLogout      = document.getElementById("btnLogout");
const chipTotalNum   = document.getElementById("chipTotalNum");
const chipNomineesNum= document.getElementById("chipNomineesNum");
const chipPendingNum = document.getElementById("chipPendingNum");
const stateLoading   = document.getElementById("stateLoading");
const stateError     = document.getElementById("stateError");
const stateErrorText = document.getElementById("stateErrorText");
const stateEmpty     = document.getElementById("stateEmpty");
const votesOut       = document.getElementById("votesOut");
const btnRetry       = document.getElementById("btnRetry");
const toast          = document.getElementById("toast");
const toastText      = document.getElementById("toastText");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  requireLogin();

  member = getSessionMember();
  batch  = getSessionBatch();

  memberNameEl.textContent  = member?.name    || "Member";
  headerBatch.textContent   = batch?.batch_name || "—";

  btnBack.addEventListener("click",   () => { window.location.href = "stations.html"; });
  btnLogout.addEventListener("click", () => logout());
  btnRetry.addEventListener("click",  () => loadPage());

  loadPage();
});

// ── Load all data ─────────────────────────────────────────────
async function loadPage() {
  if (!batch) {
    showState("error", "No active batch. Contact your administrator.");
    return;
  }
  showState("loading");

  try {
    const [stationsRes, votesRes, applicantsAllRes] = await Promise.all([
      callAPI("getStations",   { batch_id: batch.batch_id }),
      callAPI("getVotes",      { batch_id: batch.batch_id, member_id: member.member_id }),
      // We fetch votes for all stations; applicant details come from votes data
      // but we also need applicant names — so we get all votes first and derive
      // applicant details from the votes themselves (which have applicant_id)
      // We'll do a second pass to enrich with names from each station's applicants
      Promise.resolve({ status: "ok" })
    ]);

    if (stationsRes.status !== "ok") {
      showState("error", stationsRes.message || "Failed to load stations.");
      return;
    }
    if (votesRes.status !== "ok") {
      showState("error", votesRes.message || "Failed to load votes.");
      return;
    }

    allStations = stationsRes.stations || [];
    allVotes    = votesRes.votes       || [];

    // Fetch applicant lists for all stations in parallel so we have names
    const applicantResults = await Promise.all(
      allStations.map(s =>
        callAPI("getApplicants", { batch_id: batch.batch_id, station_id: s.station_id })
      )
    );
    allApplicants = applicantResults.flatMap(r => r.status === "ok" ? r.applicants : []);

    renderPage();

  } catch (err) {
    showState("error", "Network error. Check your connection and try again.");
    console.error("myvotes loadPage error:", err);
  }
}

// ── Render ────────────────────────────────────────────────────
function renderPage() {
  votesOut.innerHTML = "";

  if (allStations.length === 0) {
    showState("empty");
    return;
  }

  // Build per-station vote map
  const votesByStation = {};
  allVotes.forEach(v => {
    if (!votesByStation[v.station_id]) votesByStation[v.station_id] = [];
    votesByStation[v.station_id].push(v);
  });

  // Sort each station's votes by nominee_rank
  Object.values(votesByStation).forEach(arr =>
    arr.sort((a, b) => Number(a.nominee_rank) - Number(b.nominee_rank))
  );

  // Summary counts
  const stationsVoted  = allStations.filter(s => votesByStation[s.station_id]?.length > 0).length;
  const totalNominees  = allVotes.length;
  const stationsPending= allStations.length - stationsVoted;

  chipTotalNum.textContent   = stationsVoted;
  chipNomineesNum.textContent= totalNominees;
  chipPendingNum.textContent = stationsPending;

  if (allVotes.length === 0 && stationsPending === allStations.length) {
    showState("empty");
    return;
  }

  showState("votes");

  // ── Stations with votes ──
  allStations
    .filter(s => votesByStation[s.station_id]?.length > 0)
    .forEach(s => {
      const card = buildVoteCard(s, votesByStation[s.station_id] || []);
      votesOut.appendChild(card);
    });

  // ── Stations without votes (pending) ──
  allStations
    .filter(s => !votesByStation[s.station_id]?.length)
    .forEach(s => {
      const pending = buildPendingCard(s);
      votesOut.appendChild(pending);
    });
}

// ── Build vote card (station with nominations) ────────────────
function buildVoteCard(station, votes) {
  const card = document.createElement("div");
  card.className = "vote-card";

  const isLocked = station.is_locked;
  const badgeHtml = isLocked
    ? `<span class="badge locked">Locked</span>`
    : `<span class="badge open">Open</span>`;

  const editBtn = !isLocked
    ? `<button class="btn-edit" data-sid="${esc(station.station_id)}">Edit</button>`
    : "";

  const regionPart = station.region ? ` &bull; ${esc(station.region)}` : "";

  card.innerHTML = `
    <div class="vc-header">
      <div class="vc-title-wrap">
        <div class="vc-station-name">${esc(station.court_station)}</div>
        <div class="vc-station-sub">${esc(station.court_type)} &bull; ${esc(station.court_category)}${regionPart}</div>
      </div>
      <div class="vc-header-right">
        ${badgeHtml}
        ${editBtn}
      </div>
    </div>
    <div class="vc-body" id="vc-body-${esc(station.station_id)}"></div>
  `;

  // Render nominee rows
  const body = card.querySelector(`#vc-body-${CSS.escape(station.station_id)}`);
  if (votes.length === 0) {
    body.innerHTML = `<p class="vc-no-votes">No nominations recorded for this station.</p>`;
  } else {
    votes.forEach(v => {
      const applicant = allApplicants.find(a => a.applicant_id === v.applicant_id);
      const name      = applicant?.full_name    || v.applicant_id;
      const cls       = applicant?.classification || "";
      const clsCss    = clsClass(cls);

      const row = document.createElement("div");
      row.className = "nominee-row";
      row.innerHTML = `
        <div class="nominee-rank">${esc(String(v.nominee_rank))}</div>
        <div class="nominee-name">${esc(name)}</div>
        ${cls ? `<span class="nominee-cls ${clsCss}">${esc(cls)}</span>` : ""}
      `;
      body.appendChild(row);
    });
  }

  // Edit button → navigate to nominees.html for this station
  const editBtnEl = card.querySelector(".btn-edit");
  if (editBtnEl) {
    editBtnEl.addEventListener("click", () => goToStation(station));
  }

  return card;
}

// ── Build pending card (station with no votes yet) ────────────
function buildPendingCard(station) {
  const card = document.createElement("div");
  card.className = "pending-card";

  const regionPart = station.region ? ` — ${station.region}` : "";
  const isLocked   = station.is_locked;

  card.innerHTML = `
    <div>
      <div class="pending-station">${esc(station.court_station)}</div>
      <div class="pending-label">${esc(station.court_type)}${regionPart} &bull; No nominations yet</div>
    </div>
    ${!isLocked
      ? `<button class="btn-edit" data-sid="${esc(station.station_id)}">Vote now</button>`
      : `<span class="badge locked">Locked</span>`
    }
  `;

  const btn = card.querySelector(".btn-edit");
  if (btn) btn.addEventListener("click", () => goToStation(station));

  return card;
}

// ── Navigate to nominees.html for a station ───────────────────
function goToStation(station) {
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

// ── UI states ─────────────────────────────────────────────────
function showState(state, msg) {
  stateLoading.classList.toggle("hidden", state !== "loading");
  stateError.classList.toggle("hidden",   state !== "error");
  stateEmpty.classList.toggle("hidden",   state !== "empty");
  votesOut.classList.toggle("hidden",     state !== "votes");
  if (state === "error" && msg) stateErrorText.textContent = msg;
}

// ── Classification CSS class helper ──────────────────────────
function clsClass(cls) {
  const map = {
    "1st Preference": "pref1",
    "2nd Preference": "pref2",
    "Least Preferred":"least",
    "For Reporting":  "report"
  };
  return map[cls] || "pref2";
}

// ── HTML escape ───────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}