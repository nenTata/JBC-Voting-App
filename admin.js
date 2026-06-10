// ============================================================
// JBC VOTING SYSTEM — admin.js  (Phase 7: Admin Panel)
// ============================================================
// Depends on: api.js
// Tabs: Batches, Stations, Applicants, Members,
//       Nominate All, Lock Control, Settings, Report
// ============================================================

// ── State ────────────────────────────────────────────────────
let adminMember     = null;
let activeBatch     = null;
let allBatches      = [];
let allStations     = [];
let batchStations   = [];
let allApplicants   = [];
let allMembers      = [];
let _confirmCb      = null;


// Station sub-tab + pagination + staging
let currentSubtab      = "masterlist";
let stationPage        = 0;
const STATIONS_PER_PAGE = 50;
let stagedAssignments  = [];
let stagedBatchId      = "";
let stagedBatchName    = "";

// ── DOM refs ─────────────────────────────────────────────────
const headerBatch      = document.getElementById("headerBatch");
const adminNameEl      = document.getElementById("adminName");
const btnLogout        = document.getElementById("btnLogout");
const toast            = document.getElementById("toast");
const toastText        = document.getElementById("toastText");
const confirmOverlay   = document.getElementById("confirmOverlay");
const confirmTitle     = document.getElementById("confirmTitle");
const confirmMsg       = document.getElementById("confirmMsg");
const btnConfirmCancel = document.getElementById("btnConfirmCancel");
const btnConfirmOk     = document.getElementById("btnConfirmOk");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  requireAdmin();

  adminMember = getSessionMember();
  activeBatch = getSessionBatch();

  adminNameEl.textContent = adminMember?.name      || "Admin";
  headerBatch.textContent = activeBatch?.batch_name || "No active batch";

  btnLogout.addEventListener("click", () => logout());

  // Sidebar nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Mobile hamburger drawer
  const btnHamburger      = document.getElementById("btnHamburger");
  const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");
  const drawerAdminName   = document.getElementById("drawerAdminName");

  drawerAdminName.textContent = adminMember?.name || "Admin";

  function openDrawer() {
    mobileMenuOverlay.classList.add("open");
    btnHamburger.classList.add("open");
    document.body.style.overflow = "hidden"; // prevent background scroll
  }
  function closeDrawer() {
    mobileMenuOverlay.classList.remove("open");
    btnHamburger.classList.remove("open");
    document.body.style.overflow = "";
  }

  btnHamburger.addEventListener("click", () => {
    mobileMenuOverlay.classList.contains("open") ? closeDrawer() : openDrawer();
  });

  // Close when tapping the backdrop (outside the drawer)
  mobileMenuOverlay.addEventListener("click", (e) => {
    if (e.target === mobileMenuOverlay) closeDrawer();
  });

  // Drawer nav items
  document.querySelectorAll(".mobile-nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
      closeDrawer();
    });
  });

  // Drawer logout
  document.getElementById("btnDrawerLogout").addEventListener("click", () => logout());
  btnConfirmCancel.addEventListener("click", (e) => {
    e.stopPropagation();
    closeConfirm();
  });

  btnConfirmOk.addEventListener("click", (e) => {
    e.stopPropagation();
    const cb = _confirmCb;
    closeConfirm();
    if (cb) cb();
  });

  initBatches();
  initStations();
  initApplicants();
  initMembers();
  initNominateAll();
  initLocks();
  initSettings();
  initReport();

  switchTab("batches");
});

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tab) {
  // Show/hide content sections
  document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
  document.getElementById("tab-" + tab)?.classList.remove("hidden");

  // Sidebar: update active
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add("active");

  // Mobile drawer: keep active item highlighted
  document.querySelectorAll(".mobile-nav-item").forEach(b => b.classList.remove("active"));
  document.querySelector(`.mobile-nav-item[data-tab="${tab}"]`)?.classList.add("active");

  const loaders = {
    batches:        loadBatches,
    stations:       loadStations,
    applicants:     loadApplicants,
    members:        loadMembers,
    "nominate-all": loadNominateAll,
    locks:          loadLocks,
    settings:       loadSettings
  };
  if (loaders[tab]) loaders[tab]();
}

// ============================================================
// BATCHES
// ============================================================
function initBatches() {
  document.getElementById("btnNewBatch").addEventListener("click", () => {
    showBatchForm();
  });
  document.getElementById("btnCancelBatch").addEventListener("click", () => {
    document.getElementById("newBatchForm").classList.add("hidden");
    document.getElementById("editBatchId").value = "";
  });
  document.getElementById("btnSaveBatch").addEventListener("click", saveBatch);
}

async function loadBatches() {
  const res = await callAPI("getBatches", {});
  if (res.status !== "ok") return showToast("Failed to load batches.", true);
  allBatches = res.batches || [];
  renderBatches();
}

function showBatchForm(batch = null) {
  const form = document.getElementById("newBatchForm");
  document.getElementById("batchFormTitle").textContent = batch ? "Edit Batch" : "Create Batch";
  document.getElementById("btnSaveBatch").textContent   = batch ? "Save Changes" : "Create Batch";
  document.getElementById("editBatchId").value          = batch?.batch_id   || "";
  document.getElementById("newBatchName").value         = batch?.batch_name || "";
  document.getElementById("newBatchStart").value        = toDateInput(batch?.date_start);
  document.getElementById("newBatchEnd").value          = toDateInput(batch?.date_end);
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderBatches() {
  const list = document.getElementById("batchList");
  list.innerHTML = "";
  if (allBatches.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No batches yet.</p>`;
    return;
  }
  allBatches.forEach(b => {
    const isActive = String(b.is_active).toUpperCase() === "TRUE";
    const row = document.createElement("div");
    row.className = "data-row batch-card";
    row.innerHTML = `
      <div class="batch-card-top">
        <div class="data-row-main">
          <div class="data-row-title">${esc(b.batch_name)}</div>
          <div class="data-row-sub">${esc(b.date_start || "—")} to ${esc(b.date_end || "—")}</div>
        </div>
        <span class="badge ${isActive ? "active" : "inactive"} batch-card-badge-desktop">${isActive ? "Active" : "Inactive"}</span>
      </div>
      <div class="batch-card-bottom">
        <span class="badge ${isActive ? "active" : "inactive"} batch-card-badge-mobile">${isActive ? "Active" : "Inactive"}</span>
        <div class="data-row-actions">
          <button class="btn-secondary btn-sm" data-action="viewStations">View Stations</button>
          <button class="btn-secondary btn-sm" data-action="edit">Edit</button>
          ${isActive
            ? `<button class="btn-warn btn-sm" data-action="deactivate">Deactivate</button>`
            : `<button class="btn-primary btn-sm" data-action="activate">Activate</button>
               <button class="btn-danger btn-sm" data-action="delete">Delete</button>`
          }
        </div>
      </div>
    `;

    row.querySelector("[data-action='viewStations']").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBatchStations(b.batch_id, row);
    });
    row.querySelector("[data-action='edit']").addEventListener("click", (e) => {
      e.stopPropagation();
      showBatchForm(b);
    });
    row.querySelector("[data-action='activate']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const batchId   = b.batch_id;
      const batchName = b.batch_name;
      confirmAction(
        "Activate Batch",
        `Activate "${batchName}"? This will deactivate the current active batch.`,
        () => activateBatch(batchId)
      );
    });
    row.querySelector("[data-action='deactivate']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const batchId   = b.batch_id;
      const batchName = b.batch_name;
      confirmAction(
        "Deactivate Batch",
        `Deactivate "${batchName}"? Members will not be able to vote until a batch is active again.`,
        () => deactivateBatch(batchId)
      );
    });
    row.querySelector("[data-action='delete']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const batchId   = b.batch_id;
      const batchName = b.batch_name;
      confirmAction(
        "Delete Batch",
        `Delete "${batchName}"? This cannot be undone.`,
        () => deleteBatch(batchId)
      );
    });

    list.appendChild(row);
  });
}

async function toggleBatchStations(batch_id, parentRow) {
  const existing = parentRow.nextElementSibling;
  if (existing?.classList.contains("batch-stations-expand")) {
    existing.remove();
    return;
  }

  const res      = await callAPI("getStations", { batch_id });
  const stations = res.status === "ok" ? res.stations : [];
  const panel    = document.createElement("div");
  panel.className = "batch-stations-expand";

  if (stations.length === 0) {
    panel.innerHTML = `
      <p style="color:var(--grey-500);font-style:italic;font-size:13px;margin:0 0 10px">
        No stations assigned to this batch yet.
      </p>
      <button class="btn-secondary btn-sm" id="goToStations">Go to Station Management →</button>
    `;
    panel.querySelector("#goToStations").addEventListener("click", () => switchTab("stations"));
  } else {
    panel.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--grey-500);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
        ${stations.length} station(s) assigned
      </div>
      ${stations.map(s => `
        <div class="batch-expand-row">
          <span style="font-weight:600;color:var(--navy);font-size:13px">${esc(s.court_station)}</span>
          <span style="color:var(--grey-500);font-size:12px">${esc(s.court_type)}${s.region ? " — " + esc(s.region) : ""}</span>
        </div>
      `).join("")}
    `;
  }
  parentRow.insertAdjacentElement("afterend", panel);
}

async function saveBatch() {
  const editId = document.getElementById("editBatchId").value;
  const name   = document.getElementById("newBatchName").value.trim();
  const start  = document.getElementById("newBatchStart").value;
  const end    = document.getElementById("newBatchEnd").value;
  if (!name) return showToast("Batch name is required.", true);

  let res;
  if (editId) {
    res = await callAPI("editBatch", { batch_id: editId, batch_name: name, date_start: start, date_end: end });
  } else {
    res = await callAPI("createBatch", { batch_name: name, date_start: start, date_end: end });
  }

  if (res.status === "ok") {
    showToast(editId ? "Batch updated." : "Batch created.");
    document.getElementById("newBatchForm").classList.add("hidden");
    document.getElementById("editBatchId").value  = "";
    document.getElementById("newBatchName").value = "";
    loadBatches();
  } else showToast(res.message || "Failed.", true);
}

async function activateBatch(batch_id) {
  const res = await callAPI("activateBatch", { batch_id });
  if (res.status === "ok") { showToast("Batch activated."); loadBatches(); }
  else showToast(res.message || "Failed.", true);
}

async function deactivateBatch(batch_id) {
  console.log("deactivateBatch called, batch_id:", batch_id);
  const res = await callAPI("deactivateBatch", { batch_id });
  console.log("deactivateBatch response:", res);
  if (res.status === "ok") { showToast("Batch deactivated."); loadBatches(); }
  else showToast(res.message || "Failed.", true);
}

async function deleteBatch(batch_id) {
  const res = await callAPI("deleteBatch", { batch_id });
  if (res.status === "ok") { showToast("Batch deleted."); loadBatches(); }
  else showToast(res.message || "Failed.", true);
}

// ============================================================
// STATIONS
// ============================================================
function initStations() {
  // Add station form
  document.getElementById("btnNewStation").addEventListener("click", () => {
    document.getElementById("newStationForm").classList.toggle("hidden");
  });
  document.getElementById("btnCancelStation").addEventListener("click", () => {
    document.getElementById("newStationForm").classList.add("hidden");
  });
  document.getElementById("btnSaveStation").addEventListener("click", saveStation);

  // Court type dynamic dropdown
  updateCourtTypeOptions("newStationType", "Appellate");
  document.getElementById("newStationCategory").addEventListener("change", function () {
    updateCourtTypeOptions("newStationType", this.value);
  });
  document.getElementById("editStationCategory").addEventListener("change", function () {
    updateCourtTypeOptions("editStationType", this.value);
  });

  // Station sub-tabs
  document.querySelectorAll(".subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchSubtab(btn.dataset.subtab));
  });

  // Pagination
  document.getElementById("stationPrev").addEventListener("click", () => {
    if (stationPage > 0) { stationPage--; renderMasterStations(); }
  });
  document.getElementById("stationNext").addEventListener("click", () => {
    stationPage++; renderMasterStations();
  });

  // Assign to batch
  document.getElementById("assignBatchSelect").addEventListener("change", onAssignBatchChange);
  document.getElementById("btnConfirmAssign").addEventListener("click", confirmAssignments);

  // Batch summary
  document.getElementById("summaryBatchSelect").addEventListener("change", loadBatchSummary);

  // Edit station modal
  document.getElementById("btnCancelEditStation").addEventListener("click", closeEditStationModal);
  document.getElementById("btnSaveEditStation").addEventListener("click", saveEditStation);
}

function switchSubtab(subtab) {
  currentSubtab = subtab;
  document.querySelectorAll(".subtab-btn").forEach(b => b.classList.toggle("active", b.dataset.subtab === subtab));
  document.querySelectorAll(".subtab-section").forEach(s => s.classList.toggle("hidden", s.id !== "subtab-" + subtab));
}

async function loadStations() {
  const [masterRes, batchesRes] = await Promise.all([
    callAPI("getAllStations", {}),
    callAPI("getBatches", {})
  ]);
  if (masterRes.status === "ok") allStations = masterRes.stations || [];
  if (batchesRes.status === "ok") allBatches  = batchesRes.batches  || [];

  stationPage = 0;
  renderMasterStations();
  populateBatchDropdown("assignBatchSelect");
  populateBatchDropdown("summaryBatchSelect");
  renderStagedAssignments();

  if (stagedBatchId) {
    document.getElementById("assignBatchSelect").value = stagedBatchId;
    onAssignBatchChange();
  }
}

// ── Master Station List ───────────────────────────────────────
function renderMasterStations() {
  const list  = document.getElementById("masterStationList");
  const start = stationPage * STATIONS_PER_PAGE;
  const page  = allStations.slice(start, start + STATIONS_PER_PAGE);
  const total = allStations.length;
  list.innerHTML = "";

  if (total === 0) {
    document.getElementById("stationPageInfo").textContent = "";
    document.getElementById("stationPrev").disabled = true;
    document.getElementById("stationNext").disabled = true;
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No stations in master list yet. Click "+ Add Station" to begin.</p>`;
    return;
  }

  document.getElementById("stationPageInfo").textContent =
    `Showing ${start + 1}–${Math.min(start + page.length, total)} of ${total} stations`;
  document.getElementById("stationPrev").disabled = stationPage === 0;
  document.getElementById("stationNext").disabled = start + STATIONS_PER_PAGE >= total;

  page.forEach(s => {
    const row = document.createElement("div");
    row.className = "data-row";
    const regionPart = s.region ? ` — ${esc(s.region)}` : "";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(s.court_station)}</div>
        <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}${regionPart}</div>
      </div>
      <div class="data-row-actions">
        <button class="btn-secondary btn-sm" data-action="edit">Edit</button>
        <button class="btn-danger btn-sm" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector("[data-action='edit']").addEventListener("click", () => openEditStationModal(s));
    row.querySelector("[data-action='delete']").addEventListener("click", () => handleDeleteStation(s));
    list.appendChild(row);
  });
}

// ── Edit Station Modal ────────────────────────────────────────
function openEditStationModal(s) {
  document.getElementById("editStationId").value       = s.station_id;
  document.getElementById("editStationCategory").value = s.court_category;
  updateCourtTypeOptions("editStationType", s.court_category);
  document.getElementById("editStationType").value     = s.court_type;
  document.getElementById("editStationName").value     = s.court_station;
  document.getElementById("editStationRegion").value   = s.region || "";
  document.getElementById("editStationModal").classList.remove("hidden");
}

function closeEditStationModal() {
  document.getElementById("editStationModal").classList.add("hidden");
}

async function saveEditStation() {
  const payload = {
    station_id:     document.getElementById("editStationId").value,
    court_category: document.getElementById("editStationCategory").value,
    court_type:     document.getElementById("editStationType").value,
    court_station:  document.getElementById("editStationName").value.trim(),
    region:         document.getElementById("editStationRegion").value
  };
  if (!payload.court_station) return showToast("Station name is required.", true);
  const res = await callAPI("editStation", payload);
  if (res.status === "ok") {
    showToast("Station updated.");
    closeEditStationModal();
    loadStations();
  } else showToast(res.message || "Failed.", true);
}

// ── Delete Station ────────────────────────────────────────────
async function handleDeleteStation(s) {
  const res = await callAPI("deleteStation", { station_id: s.station_id });
  if (res.status === "ok") {
    showToast("Station deleted.");
    loadStations();
  } else if (res.status === "warning") {
    confirmAction("Delete Station", res.message, async () => {
      const forced = await callAPI("deleteStation", { station_id: s.station_id, force: true });
      if (forced.status === "ok") { showToast("Station deleted."); loadStations(); }
      else showToast(forced.message || "Failed.", true);
    });
  } else {
    showToast(res.message || "Failed.", true);
  }
}

// ── Court Type Dropdown ───────────────────────────────────────
function updateCourtTypeOptions(selectId, category) {
  const sel      = document.getElementById(selectId);
  const current  = sel.value;
  const appellate = ["SC", "CA", "CTA", "SB", "OMB", "LEB"];
  const lower     = ["RTC", "FC", "MeTC", "MTCC", "MTC", "MCTC", "SDC", "SCC", "JAL"];
  const options   = category === "Appellate" ? appellate : lower;
  sel.innerHTML   = options.map(t => `<option value="${t}"${t === current ? " selected" : ""}>${t}</option>`).join("");
}

// ── Batch Dropdown ────────────────────────────────────────────
function populateBatchDropdown(selectId) {
  const sel     = document.getElementById(selectId);
  const current = sel.value;
  sel.innerHTML = `<option value="">Select batch…</option>`;
  allBatches.forEach(b => {
    const isAct = String(b.is_active).toUpperCase() === "TRUE";
    const opt   = document.createElement("option");
    opt.value       = b.batch_id;
    opt.textContent = b.batch_name + (isAct ? " (Active)" : "");
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

async function saveStation() {
  const category = document.getElementById("newStationCategory").value;
  const type     = document.getElementById("newStationType").value;
  const name     = document.getElementById("newStationName").value.trim();
  const region   = document.getElementById("newStationRegion").value;
  if (!category || !type || !name) return showToast("Category, type, and station name are required.", true);
  const res = await callAPI("addStation", { court_category: category, court_type: type, court_station: name, region });
  if (res.status === "ok") {
    showToast("Station added to master list.");
    document.getElementById("newStationForm").classList.add("hidden");
    document.getElementById("newStationName").value = "";
    loadStations();
  } else showToast(res.message || "Failed.", true);
}

// ── Assign to Batch ───────────────────────────────────────────
async function onAssignBatchChange() {
  const sel       = document.getElementById("assignBatchSelect");
  stagedBatchId   = sel.value;
  stagedBatchName = sel.options[sel.selectedIndex]?.text || "";

  if (!stagedBatchId) {
    document.getElementById("assignStationList").innerHTML = "";
    renderStagedAssignments();
    return;
  }

  const res      = await callAPI("getStations", { batch_id: stagedBatchId });
  const assigned = res.status === "ok" ? res.stations.map(s => s.station_id) : [];
  renderAssignStationList(assigned);
  renderStagedAssignments();
}

function renderAssignStationList(assignedIds = []) {
  const list = document.getElementById("assignStationList");
  list.innerHTML = "";

  if (allStations.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No stations in master list yet.</p>`;
    return;
  }

  allStations.forEach(s => {
    const isAssigned = assignedIds.includes(s.station_id);
    const isStaged   = stagedAssignments.some(x => x.station_id === s.station_id);
    const dimmed     = isAssigned || isStaged;
    const regionPart = s.region ? ` — ${esc(s.region)}` : "";

    const row = document.createElement("div");
    row.className = "data-row" + (dimmed ? " station-dimmed" : "");
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(s.court_station)}</div>
        <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}${regionPart}</div>
      </div>
      <div class="data-row-actions">
        ${isAssigned
          ? `<span class="badge assigned">✓ Already Added</span>`
          : isStaged
            ? `<span class="badge staged">✓ Staged</span>`
            : `<button class="btn-primary btn-sm" data-action="stage">+ Add</button>`
        }
      </div>
    `;
    if (!dimmed) {
      row.querySelector("[data-action='stage']").addEventListener("click", () => {
        stagedAssignments.push(s);
        onAssignBatchChange();
      });
    }
    list.appendChild(row);
  });
}

function renderStagedAssignments() {
  const panel = document.getElementById("stagedPanel");
  const list  = document.getElementById("stagedList");

  if (!stagedBatchId || stagedAssignments.length === 0) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  document.getElementById("stagedBatchName").textContent = stagedBatchName;
  document.getElementById("stagedCount").textContent     = `${stagedAssignments.length} station(s) staged`;
  list.innerHTML = "";

  stagedAssignments.forEach(s => {
    const row = document.createElement("div");
    row.className = "data-row";
    row.style.padding = "10px 12px";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title" style="font-size:13px">${esc(s.court_station)}</div>
        <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}</div>
      </div>
      <div class="data-row-actions">
        <button class="btn-danger btn-sm">✕</button>
      </div>
    `;
    row.querySelector("button").addEventListener("click", () => {
      stagedAssignments = stagedAssignments.filter(x => x.station_id !== s.station_id);
      renderStagedAssignments();
      onAssignBatchChange();
    });
    list.appendChild(row);
  });
}

async function confirmAssignments() {
  if (!stagedBatchId || stagedAssignments.length === 0) {
    return showToast("No stations staged for assignment.", true);
  }
  const results = await Promise.all(
    stagedAssignments.map(s =>
      callAPI("assignStationToBatch", { batch_id: stagedBatchId, station_id: s.station_id })
    )
  );
  const failed = results.filter(r => r.status !== "ok");
  if (failed.length === 0) {
    showToast(`${stagedAssignments.length} station(s) assigned to batch.`);
    stagedAssignments = [];
    onAssignBatchChange();
  } else {
    showToast(`${failed.length} assignment(s) failed.`, true);
  }
}

// ── Batch Station Summary ─────────────────────────────────────
async function loadBatchSummary() {
  const batch_id = document.getElementById("summaryBatchSelect").value;
  const list     = document.getElementById("batchSummaryList");
  list.innerHTML = "";
  if (!batch_id) return;

  const res = await callAPI("getStations", { batch_id });
  if (res.status !== "ok") return showToast("Failed to load stations.", true);
  const stations = res.stations || [];

  if (stations.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No stations assigned to this batch.</p>`;
    return;
  }

  stations.forEach(s => {
    const row = document.createElement("div");
    row.className = "data-row";
    const regionPart = s.region ? ` — ${esc(s.region)}` : "";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(s.court_station)}</div>
        <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}${regionPart}</div>
      </div>
      <div class="data-row-actions">
        <span class="badge ${s.is_locked ? "locked" : "open"}">${s.is_locked ? "Locked" : "Open"}</span>
        <button class="btn-danger btn-sm">Remove</button>
      </div>
    `;
    row.querySelector("button").addEventListener("click", () =>
      confirmAction("Remove Station", `Remove "${s.court_station}" from this batch?`, async () => {
        const r = await callAPI("removeStationFromBatch", { batch_station_id: s.batch_station_id });
        if (r.status === "ok") { showToast("Station removed."); loadBatchSummary(); }
        else showToast(r.message || "Failed.", true);
      })
    );
    list.appendChild(row);
  });
}

// ============================================================
// APPLICANTS
// ============================================================
function initApplicants() {
  document.getElementById("btnNewApplicant").addEventListener("click", () => showApplicantForm());
  document.getElementById("btnCancelApplicant").addEventListener("click", () => {
    document.getElementById("newApplicantForm").classList.add("hidden");
    document.getElementById("editApplicantId").value = "";
  });
  document.getElementById("btnSaveApplicant").addEventListener("click", saveApplicant);
  document.getElementById("applicantStationFilter").addEventListener("change", renderApplicants);
}

async function loadApplicants() {
  if (!activeBatch) return;
  const stRes = await callAPI("getStations", { batch_id: activeBatch.batch_id });
  if (stRes.status === "ok") {
    batchStations = stRes.stations || [];
    populateStationSelect("applicantStationFilter", batchStations, true);
    populateStationSelect("newApplicantStation", batchStations);
  }
  const apResults = await Promise.all(
    batchStations.map(s =>
      callAPI("getApplicants", { batch_id: activeBatch.batch_id, station_id: s.station_id })
    )
  );
  allApplicants = apResults.flatMap(r => r.status === "ok" ? r.applicants : []);
  renderApplicants();
}

function renderApplicants() {
  const list      = document.getElementById("applicantList");
  const filterSid = document.getElementById("applicantStationFilter").value;
  list.innerHTML  = "";

  const filtered = filterSid
    ? allApplicants.filter(a => String(a.station_id) === String(filterSid))
    : allApplicants;

  if (filtered.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No applicants found.</p>`;
    return;
  }

  filtered.forEach(a => {
    const station = batchStations.find(s => s.station_id === a.station_id);
    const row = document.createElement("div");
    row.className = "data-row";
    const clsPart = a.classification ? esc(a.classification) + " &bull; " : "";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(a.full_name)}</div>
        <div class="data-row-sub">${clsPart}${esc(station?.court_station || a.station_id)}</div>
      </div>
      <div class="data-row-actions">
        <button class="btn-secondary btn-sm" data-action="edit">Edit</button>
        <button class="btn-danger btn-sm" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector("[data-action='edit']").addEventListener("click", () => showApplicantForm(a));
    row.querySelector("[data-action='delete']").addEventListener("click", () =>
      confirmAction("Delete Applicant", `Delete "${a.full_name}"?`, () => deleteApplicant(a.applicant_id))
    );
    list.appendChild(row);
  });
}

function showApplicantForm(applicant = null) {
  const form = document.getElementById("newApplicantForm");
  document.getElementById("applicantFormTitle").textContent  = applicant ? "Edit Applicant" : "Add Applicant";
  document.getElementById("editApplicantId").value           = applicant?.applicant_id        || "";
  document.getElementById("newApplicantName").value          = applicant?.full_name            || "";
  document.getElementById("newApplicantAppNo").value         = applicant?.application_no       || "";
  document.getElementById("newApplicantCls").value           = applicant?.classification       || "";
  document.getElementById("newApplicantBar").value           = applicant?.pre_judicature_rating || "";
  document.getElementById("newApplicantCases").value         = applicant?.cases                || "";
  document.getElementById("newApplicantTeaching").value      = applicant?.teaching_experience   || "";
  document.getElementById("newApplicantOther").value         = applicant?.other_credentials     || "";

  if (applicant) {
    const sel = document.getElementById("newApplicantStation");
    if (sel.options.length <= 1) populateStationSelect("newApplicantStation", batchStations);
    sel.value = applicant.station_id;
    if (!sel.value) setTimeout(() => { sel.value = applicant.station_id; }, 150);
  }

  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveApplicant() {
  const editId  = document.getElementById("editApplicantId").value;
  const payload = {
    station_id:            document.getElementById("newApplicantStation").value,
    full_name:             document.getElementById("newApplicantName").value.trim(),
    application_no:        document.getElementById("newApplicantAppNo").value.trim(),
    classification:        document.getElementById("newApplicantCls").value,
    pre_judicature_rating: document.getElementById("newApplicantBar").value.trim(),
    cases:                 document.getElementById("newApplicantCases").value.trim(),
    teaching_experience:   document.getElementById("newApplicantTeaching").value.trim(),
    other_credentials:     document.getElementById("newApplicantOther").value.trim()
  };

  if (!payload.station_id || !payload.full_name) {
    return showToast("Station and full name are required.", true);
  }

  const res = editId
    ? await callAPI("editApplicant", { applicant_id: editId, ...payload })
    : await callAPI("addApplicant",  { batch_id: activeBatch.batch_id, ...payload });

  if (res.status === "ok") {
    showToast(editId ? "Applicant updated." : "Applicant added.");
    document.getElementById("newApplicantForm").classList.add("hidden");
    document.getElementById("editApplicantId").value = "";
    loadApplicants();
  } else showToast(res.message || "Failed.", true);
}

async function deleteApplicant(applicant_id) {
  const res = await callAPI("deleteApplicant", { applicant_id });
  if (res.status === "ok") { showToast("Applicant deleted."); loadApplicants(); }
  else showToast(res.message || "Failed.", true);
}

// ============================================================
// MEMBERS
// ============================================================
function initMembers() {
  document.getElementById("btnNewMember").addEventListener("click", () => showMemberForm());
  document.getElementById("btnCancelMember").addEventListener("click", () => {
    document.getElementById("newMemberForm").classList.add("hidden");
    document.getElementById("editMemberId").value = "";
  });
  document.getElementById("btnSaveMember").addEventListener("click", saveMember);
}

async function loadMembers() {
  const res = await callAPI("getMembers", {});
  if (res.status !== "ok") return showToast("Failed to load members.", true);
  allMembers = res.members || [];
  renderMembers();
}

function renderMembers() {
  const list = document.getElementById("memberList");
  list.innerHTML = "";
  allMembers.forEach(m => {
    const row = document.createElement("div");
    row.className = "data-row";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(m.name)}</div>
        <div class="data-row-sub">${esc(m.email)}</div>
      </div>
      <div class="data-row-actions">
        <span class="badge ${m.role === "admin" ? "admin" : "member"}">${esc(m.role)}</span>
        <button class="btn-secondary btn-sm" data-action="edit">Edit</button>
        <button class="btn-danger btn-sm" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector("[data-action='edit']").addEventListener("click", () => showMemberForm(m));
    row.querySelector("[data-action='delete']").addEventListener("click", () =>
      confirmAction("Delete Member", `Delete "${m.name}"?`, () => deleteMember(m.member_id))
    );
    list.appendChild(row);
  });
}

function showMemberForm(member = null) {
  const form = document.getElementById("newMemberForm");
  document.getElementById("memberFormTitle").textContent = member ? "Edit Member" : "Add Member";
  document.getElementById("editMemberId").value          = member?.member_id || "";
  document.getElementById("newMemberName").value         = member?.name      || "";
  document.getElementById("newMemberEmail").value        = member?.email     || "";
  document.getElementById("newMemberPassword").value     = "";
  document.getElementById("newMemberRole").value         = member?.role      || "member";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveMember() {
  const editId  = document.getElementById("editMemberId").value;
  const payload = {
    name:     document.getElementById("newMemberName").value.trim(),
    email:    document.getElementById("newMemberEmail").value.trim(),
    password: document.getElementById("newMemberPassword").value.trim(),
    role:     document.getElementById("newMemberRole").value
  };
  if (!payload.name || !payload.email || (!editId && !payload.password) || !payload.role) {
    return showToast("Name, email, password, and role are required.", true);
  }
  const res = editId
    ? await callAPI("editMember", { member_id: editId, ...payload })
    : await callAPI("addMember",  payload);
  if (res.status === "ok") {
    showToast(editId ? "Member updated." : "Member added.");
    document.getElementById("newMemberForm").classList.add("hidden");
    document.getElementById("editMemberId").value = "";
    loadMembers();
  } else showToast(res.message || "Failed.", true);
}

async function deleteMember(member_id) {
  const res = await callAPI("deleteMember", { member_id });
  if (res.status === "ok") { showToast("Member deleted."); loadMembers(); }
  else showToast(res.message || "Failed.", true);
}

// ============================================================
// NOMINATE ALL
// ============================================================
function initNominateAll() {
  document.getElementById("btnRefreshNA").addEventListener("click", loadNominateAll);
}

async function loadNominateAll() {
  if (!activeBatch) return;
  const stRes = await callAPI("getStations", { batch_id: activeBatch.batch_id });
  if (stRes.status !== "ok") return;
  const stations = stRes.stations || [];
  const list = document.getElementById("nominateAllList");
  list.innerHTML = "";

  if (stations.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No stations in active batch.</p>`;
    return;
  }

  for (const s of stations) {
    const sugRes      = await callAPI("getNominateAllSuggestions", {
      batch_id: activeBatch.batch_id, station_id: s.station_id
    });
    const suggestions = sugRes.status === "ok" ? sugRes.suggestions : [];

    const row = document.createElement("div");
    row.className = "data-row";
    row.style.cssText = "flex-direction:column;align-items:flex-start;gap:10px";

    const statusBadge = s.nominate_all
      ? `<span class="badge nom-all">Nominate All Active — ${esc(s.nominate_all_classification)}</span>`
      : `<span class="badge inactive">Regular Voting</span>`;

    const sugHtml = suggestions.length > 0
      ? suggestions.map(sg => `
          <span style="font-size:12px;color:var(--grey-700)">
            Suggested by member — ${esc(sg.classification)} — 👍 ${sg.agree_count} / 👎 ${sg.disagree_count}
          </span>`).join("")
      : `<span style="font-size:12px;color:var(--grey-500);font-style:italic">No suggestions yet.</span>`;

    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:12px;flex-wrap:wrap">
        <div>
          <div class="data-row-title">${esc(s.court_station)}</div>
          <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${statusBadge}
          ${!s.nominate_all
            ? `<button class="btn-primary btn-sm" data-sid="${esc(s.station_id)}" data-cls="1st Preference" data-action="activate">Activate 1st Pref</button>
               <button class="btn-primary btn-sm" data-sid="${esc(s.station_id)}" data-cls="ALL" data-action="activate">Activate All</button>`
            : `<button class="btn-secondary btn-sm" data-sid="${esc(s.station_id)}" data-action="deactivate">Deactivate</button>`
          }
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;padding-left:4px">${sugHtml}</div>
    `;

    row.querySelectorAll("[data-action='activate']").forEach(btn => {
      btn.addEventListener("click", async () => {
        const res = await callAPI("activateNominateAll", {
          batch_id: activeBatch.batch_id,
          station_id: btn.dataset.sid,
          classification: btn.dataset.cls
        });
        if (res.status === "ok") { showToast("Nominate All activated."); loadNominateAll(); }
        else showToast(res.message || "Failed.", true);
      });
    });
    row.querySelector("[data-action='deactivate']")?.addEventListener("click", async () => {
      const res = await callAPI("deactivateNominateAll", {
        batch_id: activeBatch.batch_id, station_id: s.station_id
      });
      if (res.status === "ok") { showToast("Nominate All deactivated."); loadNominateAll(); }
      else showToast(res.message || "Failed.", true);
    });

    list.appendChild(row);
  }
}

// ============================================================
// LOCK CONTROL
// ============================================================
function initLocks() {
  document.getElementById("btnLockAll").addEventListener("click", () =>
    confirmAction("Lock All Stations", "Lock all stations? Members will not be able to change votes.", async () => {
      const res = await callAPI("lockAllStations", { batch_id: activeBatch?.batch_id });
      if (res.status === "ok") { showToast("All stations locked."); loadLocks(); }
      else showToast(res.message || "Failed.", true);
    })
  );
  document.getElementById("btnUnlockAll").addEventListener("click", () =>
    confirmAction("Unlock All Stations", "Unlock all stations? Members will be able to change votes again.", async () => {
      const res = await callAPI("unlockAllStations", { batch_id: activeBatch?.batch_id });
      if (res.status === "ok") { showToast("All stations unlocked."); loadLocks(); }
      else showToast(res.message || "Failed.", true);
    })
  );
}

async function loadLocks() {
  if (!activeBatch) return;
  const res = await callAPI("getStations", { batch_id: activeBatch.batch_id });
  if (res.status !== "ok") return showToast("Failed to load stations.", true);
  const stations = res.stations || [];
  const list = document.getElementById("lockList");
  list.innerHTML = "";

  if (stations.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">No stations in active batch.</p>`;
    return;
  }

  stations.forEach(s => {
    const row = document.createElement("div");
    row.className = "data-row";
    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(s.court_station)}</div>
        <div class="data-row-sub">${esc(s.court_type)} &bull; ${esc(s.court_category)}${s.region ? " &bull; " + esc(s.region) : ""}</div>
      </div>
      <div class="data-row-actions">
        <span class="badge ${s.is_locked ? "locked" : "open"}">${s.is_locked ? "Locked" : "Open"}</span>
        <button class="btn-${s.is_locked ? "secondary" : "danger"} btn-sm"
          data-bsid="${esc(s.batch_station_id)}" data-locked="${s.is_locked}">
          ${s.is_locked ? "Unlock" : "Lock"}
        </button>
      </div>
    `;
    row.querySelector("button").addEventListener("click", async e => {
      const bsid   = e.target.dataset.bsid;
      const locked = e.target.dataset.locked === "true";
      const res    = await callAPI(locked ? "unlockStation" : "lockStation", { batch_station_id: bsid });
      if (res.status === "ok") { showToast(locked ? "Station unlocked." : "Station locked."); loadLocks(); }
      else showToast(res.message || "Failed.", true);
    });
    list.appendChild(row);
  });
}

// ============================================================
// SETTINGS
// ============================================================
function initSettings() {
  document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
}

async function loadSettings() {
  const res = await callAPI("getSettings", {});
  if (res.status !== "ok") return;
  document.getElementById("nominationLimitInput").value = res.settings?.nomination_limit ?? "";
}

async function saveSettings() {
  const val = document.getElementById("nominationLimitInput").value;
  const res = await callAPI("updateSettings", { setting_key: "nomination_limit", setting_value: val });
  if (res.status === "ok") {
    const status = document.getElementById("settingsSaveStatus");
    status.classList.remove("hidden");
    setTimeout(() => status.classList.add("hidden"), 2500);
    showToast("Settings saved.");
  } else showToast(res.message || "Failed.", true);
}

// ============================================================
// REPORT
// ============================================================
function initReport() {
  document.getElementById("btnGenerateReportTxt").addEventListener("click", generateReportTxt);
  document.getElementById("btnGenerateReportDocx").addEventListener("click", generateReportDocx);
}

// ── Shared: fetch report data from backend ────────────────────
async function fetchReportData(btn, label) {
  if (!activeBatch) { showToast("No active batch.", true); return null; }
  btn.textContent = "Generating…";
  btn.disabled    = true;
  try {
    const res = await callAPI("generateReport", { batch_id: activeBatch.batch_id });
    if (res.status !== "ok") { showToast(res.message || "Failed.", true); return null; }
    return res;
  } catch (e) {
    showToast("Failed to fetch report.", true);
    return null;
  } finally {
    btn.textContent = label;
    btn.disabled    = false;
  }
}

// ── .txt download (unchanged behaviour) ──────────────────────
async function generateReportTxt() {
  const btn = document.getElementById("btnGenerateReportTxt");
  const res = await fetchReportData(btn, "Download .txt");
  if (!res) return;

  document.getElementById("reportText").textContent = res.report_text;
  document.getElementById("reportPreview").classList.remove("hidden");

  const blob = new Blob([res.report_text], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `JBC_Report_${activeBatch.batch_name || activeBatch.batch_id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Text report downloaded.");
}

// ── .docx download ────────────────────────────────────────────
async function generateReportDocx() {
  const btn = document.getElementById("btnGenerateReportDocx");

  // Guard: make sure both libraries loaded
  if (typeof docx === "undefined" || typeof saveAs === "undefined") {
    showToast("Required libraries not loaded. Check internet connection.", true);
    return;
  }

  const res = await fetchReportData(btn, "Download .docx");
  if (!res) return;

  // Also show preview
  document.getElementById("reportText").textContent = res.report_text;
  document.getElementById("reportPreview").classList.remove("hidden");

  btn.textContent = "Building .docx…";
  btn.disabled    = true;

  try {
    const blob     = await buildDocx(res.report_text, activeBatch.batch_name);
    const filename = `JBC_Report_${(activeBatch.batch_name || activeBatch.batch_id).replace(/[^a-zA-Z0-9_\- ]/g, "")}.docx`;
    saveAs(blob, filename);
    showToast("Word report downloaded.");
  } catch (e) {
    console.error("DOCX build error:", e);
    showToast("Failed to build .docx — see console for details.", true);
  } finally {
    btn.textContent = "Download .docx";
    btn.disabled    = false;
  }
}

// ── Build the .docx from report_text ─────────────────────────
async function buildDocx(reportText, batchName) {
  // docx.js v7 UMD exposes everything on the global `docx` object
  const {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, BorderStyle
  } = window.docx;

  const lines    = reportText.split("\n");
  const children = [];

  const FONT        = "Arial";
  const COLOR_GREEN = "075620";
  const COLOR_DARK  = "1A1A1A";
  const COLOR_GREY  = "555555";

  // Horizontal rule via paragraph bottom border
  function hRule(color) {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: color || "CCCCCC", space: 1 } },
      spacing: { before: 0, after: 120 }
    });
  }

  // ── Document header ──────────────────────────────────────────
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: "Republic of the Philippines", font: FONT, size: 20, color: COLOR_GREY, italics: true })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: "JUDICIAL AND BAR COUNCIL", font: FONT, size: 28, bold: true, color: COLOR_GREEN })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: "NOMINATION REPORT", font: FONT, size: 24, bold: true, color: COLOR_DARK, allCaps: true })]
  }));
  if (batchName) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: batchName, font: FONT, size: 22, color: COLOR_GREY, italics: true })]
    }));
  }
  const dateLine = lines.find(l => l.startsWith("Generated:"));
  if (dateLine) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: dateLine, font: FONT, size: 18, color: COLOR_GREY })]
    }));
  }
  children.push(hRule(COLOR_GREEN));

  // ── Parse body ───────────────────────────────────────────────
  let inBody = false;
  for (const raw of lines) {
    // Skip meta lines already rendered in header
    if (
      raw.startsWith("JBC NOMINATION REPORT") ||
      raw.startsWith("Batch ID:")             ||
      raw.startsWith("Generated:")
    ) { inBody = true; continue; }
    if (raw.trim() === "")           continue; // blank line spacer
    if (/^[=]{3,}$/.test(raw.trim())) continue; // === divider

    if (!inBody) continue;

    // Section headings: LOWER COURTS / APPELLATE COURTS
    if (raw === "LOWER COURTS" || raw === "APPELLATE COURTS") {
      children.push(new Paragraph({ spacing: { before: 280, after: 0 } }));
      children.push(new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: raw, font: FONT, size: 26, bold: true, color: COLOR_GREEN, allCaps: true })]
      }));
      children.push(hRule(COLOR_GREEN));
      continue;
    }

    // Station heading — lower court: "A. RTC, Branch 1 Manila"
    //                  appellate:    "CA Court of Appeals"
    if (!raw.startsWith(" ") && raw.trim().length > 0) {
      children.push(new Paragraph({ spacing: { before: 200, after: 0 } }));
      children.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: raw.trim(), font: FONT, size: 22, bold: true, color: COLOR_DARK })]
      }));
      continue;
    }

    // Nominee: "   1. Juan dela Cruz"
    if (/^\s+\d+\.\s/.test(raw)) {
      children.push(new Paragraph({
        indent: { left: 480 },
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: raw.trim(), font: FONT, size: 20, color: COLOR_DARK })]
      }));
      continue;
    }

    // No nominees note: "   (No nominees)"
    if (/^\s+\(No nominees\)/.test(raw)) {
      children.push(new Paragraph({
        indent: { left: 480 },
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: "(No nominees)", font: FONT, size: 20, color: COLOR_GREY, italics: true })]
      }));
      continue;
    }
  }

  // ── Footer ───────────────────────────────────────────────────
  children.push(new Paragraph({ spacing: { before: 400, after: 0 } }));
  children.push(hRule("CCCCCC"));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 0 },
    children: [new TextRun({ text: "— End of Report —", font: FONT, size: 18, color: COLOR_GREY, italics: true })]
  }));

  // ── Assemble ─────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });

  // Packer.toBlob returns a Promise<Blob> in docx v7
  return Packer.toBlob(doc);
}

// ============================================================
// HELPERS
// ============================================================
function populateStationSelect(selectId, stations, addAll = false) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = addAll
    ? `<option value="">All stations</option>`
    : `<option value="">Select station…</option>`;
  stations.forEach(s => {
    const opt = document.createElement("option");
    opt.value       = s.station_id;
    opt.textContent = `${s.court_station} (${s.court_type})`;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function confirmAction(title, msg, callback) {
  confirmTitle.textContent = title;
  confirmMsg.textContent   = msg;
  _confirmCb               = callback;
  confirmOverlay.classList.remove("hidden");
}

function closeConfirm() {
  confirmOverlay.classList.add("hidden");
  _confirmCb = null;
}

let toastTimer = null;
function showToast(msg, isError = false) {
  toastText.textContent = msg;
  toast.style.borderLeftColor = isError ? "#9b2222" : "var(--gold)";
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toDateInput(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(val);
  if (isNaN(d)) return "";
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}