// ============================================================
// JBC VOTING SYSTEM — nominees.js  (Phase 5) — FIXED
// ============================================================
// Fixes:
//   1. Card selection visual — rank number shows correctly
//   2. Credential modal — converts all values to string before
//      checking truthiness (fixes number 0 and float grades)
//   3. Nominate All suggestion — graceful error message
// ============================================================

// ── State ────────────────────────────────────────────────────
let station              = null;
let member               = null;
let batch                = null;
let applicants           = [];
let selected             = [];      // applicant_ids in selection order
let originalSelected     = [];      // applicant_ids that were already saved on the server (as of last load/save)
let nominationCounts     = {};      // applicant_id → count
let nominationLimit      = 0;
let pendingLimitApplicant= null;

// ── DOM refs ─────────────────────────────────────────────────
const btnBack           = document.getElementById("btnBack");
const btnLogout         = document.getElementById("btnLogout");
const headerStation     = document.getElementById("headerStation");
const headerBatch       = document.getElementById("headerBatch");
const memberNameEl      = document.getElementById("memberName");
const stationMeta       = document.getElementById("stationMeta");
const stationBadges     = document.getElementById("stationBadges");
const nominateAllBanner = document.getElementById("nominateAllBanner");
const nabDesc           = document.getElementById("nabDesc");
const suggestBar        = document.getElementById("suggestBar");
const stateLoading      = document.getElementById("stateLoading");
const stateError        = document.getElementById("stateError");
const stateErrorText    = document.getElementById("stateErrorText");
const stateEmpty        = document.getElementById("stateEmpty");
const nomineesWrap      = document.getElementById("nomineesWrap");
const selCount          = document.getElementById("selCount");
const btnSubmit         = document.getElementById("btnSubmit");
const applicantList     = document.getElementById("applicantList");
const btnRetry          = document.getElementById("btnRetry");
const modalOverlay      = document.getElementById("modalOverlay");
const modalName         = document.getElementById("modalName");
const modalBody         = document.getElementById("modalBody");
const modalClose        = document.getElementById("modalClose");
const btnModalClose     = document.getElementById("btnModalClose");
const limitOverlay      = document.getElementById("limitOverlay");
const limitApplicantName= document.getElementById("limitApplicantName");
const limitWarningText  = document.getElementById("limitWarningText");
const limitClose        = document.getElementById("limitClose");
const btnLimitCancel    = document.getElementById("btnLimitCancel");
const btnLimitProceed   = document.getElementById("btnLimitProceed");
const toast             = document.getElementById("toast");
const toastText         = document.getElementById("toastText");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  requireLogin();

  member  = getSessionMember();
  batch   = getSessionBatch();
  station = getSelectedStation();

  if (!station) { window.location.href = "stations.html"; return; }

  memberNameEl.textContent  = member?.name || "Member";
  headerStation.textContent = station.court_station || "Station";
  headerBatch.textContent   = batch?.batch_name || "—";

  renderStationBar();

  btnBack.addEventListener("click",   () => { window.location.href = "stations.html"; });
  btnLogout.addEventListener("click", () => logout());
  btnRetry.addEventListener("click",  loadPage);

  modalClose.addEventListener("click",    closeCredModal);
  btnModalClose.addEventListener("click", closeCredModal);
  modalOverlay.addEventListener("click",  e => { if (e.target === modalOverlay) closeCredModal(); });

  limitClose.addEventListener("click",     closeLimitModal);
  btnLimitCancel.addEventListener("click", closeLimitModal);
  btnLimitProceed.addEventListener("click", () => {
    closeLimitModal();
    if (pendingLimitApplicant) { addToSelection(pendingLimitApplicant); pendingLimitApplicant = null; }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeCredModal(); closeLimitModal(); }
  });

  document.querySelectorAll(".btn-suggest").forEach(btn => {
    btn.addEventListener("click", () => handleSuggestNominateAll(btn.dataset.cls));
  });

  btnSubmit.addEventListener("click", handleSubmit);

  loadPage();
});

// ── Load page data ────────────────────────────────────────────
async function loadPage() {
  showState("loading");
  try {
    const [settingsRes, applicantsRes, votesRes] = await Promise.all([
      callAPI("getSettings",   {}),
      callAPI("getApplicants", { batch_id: batch.batch_id, station_id: station.station_id }),
      callAPI("getVotes",      { batch_id: batch.batch_id, member_id: member.member_id, station_id: station.station_id })
    ]);

    if (settingsRes.status === "ok") {
      nominationLimit = Number(settingsRes.settings?.nomination_limit) || 0;
    }

    if (applicantsRes.status !== "ok") {
      showState("error", applicantsRes.message || "Failed to load applicants.");
      return;
    }

    applicants = applicantsRes.applicants || [];
    if (applicants.length === 0) { showState("empty"); return; }

    if (nominationLimit > 0) await loadNominationCounts();

    // Restore existing votes
    if (votesRes.status === "ok" && votesRes.votes?.length > 0) {
      const sorted = [...votesRes.votes].sort((a, b) => Number(a.nominee_rank) - Number(b.nominee_rank));
      selected = sorted.map(v => v.applicant_id);
    }
    // Snapshot what's actually saved server-side, so we can later diff
    // against it to know which applicants were deselected.
    originalSelected = [...selected];

    showState("nominees");
    renderNomineesWrap();
    renderBannerAndSuggest();

  } catch (err) {
    showState("error", "Network error. Check your connection and try again.");
    console.error("loadPage error:", err);
  }
}

// ── Nomination counts ─────────────────────────────────────────
async function loadNominationCounts() {
  const results = await Promise.all(
    applicants.map(a => callAPI("getNominationCount", {
      batch_id: batch.batch_id, applicant_id: a.applicant_id
    }))
  );
  results.forEach((res, i) => {
    if (res.status === "ok") nominationCounts[applicants[i].applicant_id] = res.count;
  });
}

// ── Station bar ───────────────────────────────────────────────
function renderStationBar() {
  stationMeta.innerHTML = `
    <div class="stn-name">${esc(station.court_station)}</div>
    <div class="stn-sub">
      ${esc(station.court_type)} &bull; ${esc(station.court_category)}
      ${station.region ? " &bull; " + esc(station.region) : ""}
    </div>`;

  const badges = [];
  if (station.is_locked)        badges.push(`<span class="badge locked">Locked</span>`);
  else if (station.nominate_all) badges.push(`<span class="badge nominate-all">Nominate All Active</span>`);
  else                           badges.push(`<span class="badge open">Open for Voting</span>`);
  if (station.vote_threshold > 0) badges.push(`<span class="badge threshold">Threshold: ${station.vote_threshold}</span>`);
  stationBadges.innerHTML = badges.join("");
}

// ── Nominate All banner / Suggest bar ────────────────────────
function renderBannerAndSuggest() {
  if (station.nominate_all) {
    nominateAllBanner.classList.remove("hidden");
    const cls = station.nominate_all_classification || "ALL";
    nabDesc.textContent = cls === "ALL"
      ? "All applicants for this station are automatically nominated."
      : `All applicants classified as "${cls}" are automatically nominated.`;
    suggestBar.classList.add("hidden");
  } else if (!station.is_locked) {
    suggestBar.classList.remove("hidden");
    nominateAllBanner.classList.add("hidden");
  }
}

// ── Render applicant list ─────────────────────────────────────
function renderNomineesWrap() {
  applicantList.innerHTML = "";
  applicants.forEach(a => applicantList.appendChild(buildApplicantCard(a)));
  updateSelectionBar();
}

// ── Build one applicant card ──────────────────────────────────
function buildApplicantCard(a) {
  const isSelected     = selected.includes(a.applicant_id);
  const rank           = isSelected ? selected.indexOf(a.applicant_id) + 1 : null;
  const isLimitFlagged = nominationLimit > 0 && (nominationCounts[a.applicant_id] || 0) >= nominationLimit;

  const card = document.createElement("div");
  card.className = [
    "applicant-card",
    isSelected     ? "selected"    : "",
    isLimitFlagged ? "limit-flag"  : ""
  ].filter(Boolean).join(" ");
  card.dataset.id = a.applicant_id;

  const clsMap = {
    "1st Preference": "pref1",
    "2nd Preference": "pref2",
    "Least Preferred":"least",
    "For Reporting":  "report"
  };
  const clsCss  = clsMap[a.classification] || "pref2";
  const limitChip = isLimitFlagged ? `<span class="limit-chip">⚠ Limit reached</span>` : "";

  // ── FIX: indicator element is a single div that shows either
  //    a checkmark (unselected) or a rank number (selected).
  //    Controlled entirely by CSS class on the card.
  card.innerHTML = `
    <div class="card-indicator">
      <span class="check-icon">✓</span>
      <span class="rank-num">${rank || ""}</span>
    </div>
    <div class="card-body">
      <div class="card-name">${esc(a.full_name)}</div>
      <div class="card-sub">
        <span class="app-no">App. No. ${esc(a.application_no)}</span>
        <span class="cls-badge ${clsCss}">${esc(a.classification)}</span>
        ${limitChip}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn-view" title="View credentials">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>View</span>
      </button>
    </div>
  `;

  card.addEventListener("click", e => {
    if (e.target.closest(".btn-view")) return;
    handleCardToggle(a);
  });

  card.querySelector(".btn-view").addEventListener("click", e => {
    e.stopPropagation();
    openCredModal(a);
  });

  return card;
}

// ── Card toggle ───────────────────────────────────────────────
function handleCardToggle(a) {
  if (station.is_locked) return;

  const idx = selected.indexOf(a.applicant_id);
  if (idx !== -1) {
    selected.splice(idx, 1);
    refreshCards();
    updateSelectionBar();
    return;
  }

  const isLimitFlagged = nominationLimit > 0 && (nominationCounts[a.applicant_id] || 0) >= nominationLimit;
  if (isLimitFlagged) {
    pendingLimitApplicant = a;
    openLimitModal(a);
  } else {
    addToSelection(a);
  }
}

function addToSelection(a) {
  selected.push(a.applicant_id);
  refreshCards();
  updateSelectionBar();
}

// ── FIX: refresh all cards — update class AND rank text ───────
function refreshCards() {
  document.querySelectorAll(".applicant-card").forEach(card => {
    const id             = card.dataset.id;
    const idx            = selected.indexOf(id);
    const isSelected     = idx !== -1;
    const isLimitFlagged = nominationLimit > 0 && (nominationCounts[id] || 0) >= nominationLimit;

    card.classList.toggle("selected",   isSelected);
    card.classList.toggle("limit-flag", isLimitFlagged);

    // Update rank number text inside .rank-num span
    const rankEl = card.querySelector(".rank-num");
    if (rankEl) rankEl.textContent = isSelected ? String(idx + 1) : "";
  });
}

// ── Selection bar ─────────────────────────────────────────────
function updateSelectionBar() {
  const n = selected.length;
  selCount.innerHTML = n === 0
    ? "No nominees selected"
    : `<strong>${n}</strong> nominee${n !== 1 ? "s" : ""} selected`;
  // Enable Save whenever the current selection differs from what's saved —
  // including clearing down to zero — not just when something is checked.
  const hasChanges = JSON.stringify([...selected].sort()) !== JSON.stringify([...originalSelected].sort());
  btnSubmit.disabled = station.is_locked || (n === 0 && !hasChanges);
}

// ── Submit votes ──────────────────────────────────────────────
async function handleSubmit() {
  const hasChanges = JSON.stringify([...selected].sort()) !== JSON.stringify([...originalSelected].sort());
  if ((selected.length === 0 && !hasChanges) || station.is_locked) return;

  btnSubmit.textContent = "Saving…";
  btnSubmit.classList.add("saving");
  btnSubmit.disabled = true;

  // Figure out who got unchecked since the last save/load, so their
  // old vote rows get invalidated on the backend — otherwise the
  // server just accumulates votes and never clears deselected ones.
  const deselected = originalSelected.filter(id => !selected.includes(id));

  try {
    const removeResults = await Promise.all(
      deselected.map(applicant_id =>
        callAPI("removeVote", {
          batch_id:   batch.batch_id,
          member_id:  member.member_id,
          station_id: station.station_id,
          applicant_id
        })
      )
    );

    const submitResults = await Promise.all(
      selected.map((applicant_id, idx) =>
        callAPI("submitVote", {
          batch_id:     batch.batch_id,
          member_id:    member.member_id,
          station_id:   station.station_id,
          applicant_id,
          nominee_rank: idx + 1
        })
      )
    );

    const allOk = [...removeResults, ...submitResults].every(r => r.status === "ok");
    if (allOk) {
      showToast("Nominations saved successfully.");
      originalSelected = [...selected]; // sync snapshot to what's now saved
      if (nominationLimit > 0) await loadNominationCounts();
      refreshCards();
    } else {
      const failed = [...removeResults, ...submitResults].find(r => r.status !== "ok");
      showToast("Some nominations could not be saved: " + (failed?.message || "Unknown error"), true);
    }
  } catch (err) {
    showToast("Network error. Please try again.", true);
    console.error("submitVote error:", err);
  } finally {
    btnSubmit.textContent = "Save Nominations";
    btnSubmit.classList.remove("saving");
    updateSelectionBar();
  }
}

// ── Credentials modal — FIXED ─────────────────────────────────
// FIX: convert all credential values to string before checking.
// Google Sheets sometimes returns numbers as JS numbers, not strings.
// "if (a.bar_exam_grade)" fails when value is 0 or a float like 87.5
// because non-empty strings are truthy but number 0 is falsy.
// Solution: String(val).trim() !== "" is always safe.
function hasValue(val) {
  return String(val ?? "").trim() !== "";
}

function openCredModal(a) {
  modalName.textContent = a.full_name;

  const clsMap = {
    "1st Preference": "pref1",
    "2nd Preference": "pref2",
    "Least Preferred":"least",
    "For Reporting":  "report"
  };
  const clsCss = clsMap[a.classification] || "pref2";

  const hasCredentials = hasValue(a.pre_judicature_rating)
    || hasValue(a.cases)
    || hasValue(a.teaching_experience)
    || hasValue(a.other_credentials);

  let html = `
    <p class="modal-appno">Application No. ${esc(a.application_no)}</p>
    <div class="modal-cls-row">
      <span class="cls-badge ${clsCss}">${esc(a.classification)}</span>
    </div>
  `;

  if (!hasCredentials) {
    html += `<p class="no-creds-msg">No additional credentials on file for this applicant.</p>`;
  } else {
    html += `<div class="cred-section">`;

    // ── FIX: use hasValue() instead of bare truthiness check ──
    if (hasValue(a.pre_judicature_rating)) {
      html += `
        <div class="cred-row">
          <span class="cred-label">Pre-Judicature Rating</span>
          <span class="cred-value">${esc(String(a.pre_judicature_rating))}</span>
        </div>`;
    }
    if (hasValue(a.cases)) {
      html += `
        <div class="cred-row">
          <span class="cred-label">Cases</span>
          <span class="cred-value">${esc(String(a.cases))}</span>
        </div>`;
    }
    if (hasValue(a.teaching_experience)) {
      html += `
        <div class="cred-row">
          <span class="cred-label">Teaching Experience</span>
          <span class="cred-value">${esc(String(a.teaching_experience))}</span>
        </div>`;
    }
    if (hasValue(a.other_credentials)) {
      html += `
        <div class="cred-row">
          <span class="cred-label">Other Credentials</span>
          <span class="cred-value">${esc(String(a.other_credentials))}</span>
        </div>`;
    }

    html += `</div>`;
  }

  modalBody.innerHTML = html;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => modalClose.focus(), 50);
}

function closeCredModal() {
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// ── Limit warning modal ───────────────────────────────────────
function openLimitModal(a) {
  limitApplicantName.textContent = a.full_name;
  limitWarningText.textContent =
    `This applicant has been nominated ${nominationCounts[a.applicant_id] || 0} time(s) across all stations, reaching the limit of ${nominationLimit}.`;
  limitOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => btnLimitCancel.focus(), 50);
}

function closeLimitModal() {
  limitOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  pendingLimitApplicant = null;
}

// ── Suggest Nominate All ──────────────────────────────────────
async function handleSuggestNominateAll(classification) {
  try {
    const res = await callAPI("suggestNominateAll", {
      batch_id:               batch.batch_id,
      station_id:             station.station_id,
      suggested_by_member_id: member.member_id,
      classification
    });
    if (res.status === "ok") {
      showToast("Nominate All suggestion submitted.");
      suggestBar.classList.add("hidden");
    } else {
      // Show the raw server error so admin can diagnose sheet name issues
      showToast("Could not submit: " + (res.message || "Error"), true);
    }
  } catch (err) {
    showToast("Network error. Please try again.", true);
  }
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, isError = false) {
  toastText.textContent = msg;
  toast.style.borderLeftColor = isError ? "#9b2222" : "var(--jbc-green)";
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ── UI states ─────────────────────────────────────────────────
function showState(state, msg) {
  stateLoading.classList.toggle("hidden", state !== "loading");
  stateError.classList.toggle("hidden",   state !== "error");
  stateEmpty.classList.toggle("hidden",   state !== "empty");
  nomineesWrap.classList.toggle("hidden", state !== "nominees");
  if (state === "error" && msg) stateErrorText.textContent = msg;
}

// ── Helpers ───────────────────────────────────────────────────
function getSelectedStation() {
  try { return JSON.parse(sessionStorage.getItem("selected_station")); }
  catch { return null; }
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}