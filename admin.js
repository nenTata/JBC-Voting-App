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
let allApplicants   = [];   // this batch's assignments (person + station)
let applicantPool   = [];   // every person in the pool
let applicantView   = "batch";  // "batch" (assignments) or "pool" (everyone)
let poolSelected    = new Set();
const POOL_RENDER_LIMIT = 200;
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

  // Restore the tab (and Stations sub-tab) the admin was on before refresh
  const savedTab = sessionStorage.getItem("jbc_admin_tab");
  const savedSub = sessionStorage.getItem("jbc_admin_subtab");

  if (savedSub && document.getElementById("subtab-" + savedSub)) {
    switchSubtab(savedSub);
  }
  switchTab(savedTab && document.getElementById("tab-" + savedTab) ? savedTab : "batches");
});

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tab) {
  sessionStorage.setItem("jbc_admin_tab", tab);
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
  if (res.status === "ok") {
    showToast("Batch activated.");
    await loadBatches();
    // Find the newly activated batch and update session + header
    const newActive = allBatches.find(b => String(b.batch_id) === String(batch_id));
    if (newActive) {
      activeBatch = newActive;
      setSession(adminMember, {
        batch_id:   newActive.batch_id,
        batch_name: newActive.batch_name,
        date_start: newActive.date_start,
        date_end:   newActive.date_end
      });
      headerBatch.textContent = newActive.batch_name;
    }
  } else showToast(res.message || "Failed.", true);
}

async function deactivateBatch(batch_id) {
  const res = await callAPI("deactivateBatch", { batch_id });
  if (res.status === "ok") {
    showToast("Batch deactivated.");
    // If the deactivated batch was the active one, clear session batch
    if (String(activeBatch?.batch_id) === String(batch_id)) {
      activeBatch = null;
      sessionStorage.removeItem("jbc_batch");
      headerBatch.textContent = "No active batch";
    }
    loadBatches();
  } else showToast(res.message || "Failed.", true);
}

async function deleteBatch(batch_id) {
  const res = await callAPI("deleteBatch", { batch_id });
  if (res.status === "ok") {
    showToast("Batch deleted.");
    // If deleted batch was somehow active in session, clear it
    if (String(activeBatch?.batch_id) === String(batch_id)) {
      activeBatch = null;
      sessionStorage.removeItem("jbc_batch");
      headerBatch.textContent = "No active batch";
    }
    loadBatches();
  } else showToast(res.message || "Failed.", true);
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
  sessionStorage.setItem("jbc_admin_subtab", subtab);
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
const CLASSIFICATIONS = ["1st Preference", "2nd Preference", "Least Preferred", "Recently Appointed", "For Reporting"];

// The add/edit form is built here (not in admin.html) so the page always
// matches the applicant-pool logic below.
function buildApplicantForm() {
  const form = document.getElementById("newApplicantForm");
  form.innerHTML = `
    <h3 class="form-title" id="applicantFormTitle">Add Applicant</h3>
    <input type="hidden" id="editApplicantId" />
    <div class="form-row">
      <div class="field-group field-group--full">
        <label class="field-label">Full Name *
          <span class="field-hint">(start typing to reuse someone already in the pool)</span></label>
        <input class="field-input" type="text" id="newApplicantName" list="applicantPoolNames"
               placeholder="Full legal name" autocomplete="off" />
        <datalist id="applicantPoolNames"></datalist>
      </div>
      <div class="field-group">
        <label class="field-label">Pre-Judicature Rating <span class="field-hint">(optional)</span></label>
        <input class="field-input" type="text" id="newApplicantBar" placeholder="e.g. 87.50" />
      </div>
      <div class="field-group">
        <label class="field-label">Cases <span class="field-hint">(optional)</span></label>
        <input class="field-input" type="text" id="newApplicantCases" placeholder="Pending/decided cases info" />
      </div>
      <div class="field-group">
        <label class="field-label">Teaching Experience <span class="field-hint">(optional)</span></label>
        <input class="field-input" type="text" id="newApplicantTeaching" placeholder="e.g. 5 years, UP Law" />
      </div>
      <div class="field-group field-group--full">
        <label class="field-label">Other Credentials <span class="field-hint">(optional)</span></label>
        <input class="field-input" type="text" id="newApplicantOther" placeholder="Other notable credentials" />
      </div>
    </div>

    <div style="font-weight:700;font-size:14px;margin:4px 0 4px">Stations applied to (this batch)</div>
    <p class="field-hint" style="margin:0 0 10px">
      Application No. and Classification can be different for each station.
    </p>
    <div id="applicantAssignments"></div>
    <button class="btn-secondary btn-sm" id="btnAddAssignment" type="button" style="margin-bottom:16px">
      + Add another station
    </button>

    <div class="form-actions">
      <button class="btn-danger" id="btnDeleteApplicantPool" type="button" style="display:none;margin-right:auto">
        Delete applicant
      </button>
      <button class="btn-secondary" id="btnCancelApplicant" type="button">Cancel</button>
      <button class="btn-primary" id="btnSaveApplicant" type="button">Save Applicant</button>
    </div>
  `;
}

function initApplicants() {
  buildApplicantForm();
  buildApplicantToolbar();

  document.getElementById("btnNewApplicant").addEventListener("click", () => showApplicantForm());
  document.getElementById("btnCancelApplicant").addEventListener("click", hideApplicantForm);
  document.getElementById("btnSaveApplicant").addEventListener("click", saveApplicant);
  document.getElementById("btnAddAssignment").addEventListener("click", () => addAssignmentRow());
  document.getElementById("newApplicantName").addEventListener("change", onApplicantNameChosen);
  document.getElementById("applicantStationFilter").addEventListener("change", renderApplicants);
  document.getElementById("btnDeleteApplicantPool").addEventListener("click", () => {
    const id   = document.getElementById("editApplicantId").value;
    const name = document.getElementById("newApplicantName").value.trim();
    confirmAction(
      "Delete Applicant",
      `Permanently delete "${name}" from the applicant pool? This removes them from every station and batch.`,
      () => deleteApplicant(id)
    );
  });
}

function hideApplicantForm() {
  document.getElementById("newApplicantForm").classList.add("hidden");
  document.getElementById("editApplicantId").value = "";
  document.getElementById("btnDeleteApplicantPool").style.display = "none";
}

async function loadApplicants() {
  if (!activeBatch) return;

  // Two requests at the same time (was: one request per station)
  const [stRes, apRes] = await Promise.all([
    callAPI("getStations", { batch_id: activeBatch.batch_id }),
    callAPI("getApplicantAdminData", { batch_id: activeBatch.batch_id })
  ]);

  if (stRes.status === "ok") {
    batchStations = stRes.stations || [];
    populateStationSelect("applicantStationFilter", batchStations, true);
    populateStationSelect("bulkStation", batchStations);
  }

  const notice = document.getElementById("applicantNotice");
  if (apRes.status === "ok") {
    allApplicants = apRes.applicants || [];
    applicantPool = apRes.pool || [];
    document.getElementById("applicantPoolNames").innerHTML =
      applicantPool.map(p => `<option value="${esc(p.full_name)}"></option>`).join("");

    if (apRes.needs_migration) {
      notice.textContent =
        "⚠ The Applicants sheet is still in the old format (it has batch_id / station_id columns), " +
        "so applicants can't be assigned yet. In Apps Script, run migrateApplicantsToPool once, then reload this page.";
      notice.style.display = "";
    } else {
      notice.style.display = "none";
    }
  } else {
    showToast(apRes.message || "Failed to load applicants.", true);
  }
  renderApplicants();
}

function stationLabel(station_id) {
  const s = batchStations.find(x => String(x.station_id) === String(station_id));
  return s ? `${s.court_station} (${s.court_type})` : station_id;
}

// ── Toolbar: view switch, search, bulk-assign bar ────────────
function buildApplicantToolbar() {
  const list = document.getElementById("applicantList");
  const bar  = document.createElement("div");
  bar.id = "applicantToolbar";
  bar.innerHTML = `
    <div id="applicantNotice"
         style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:8px;background:#fff4d6;color:#7a5200;font-size:13px;line-height:1.4"></div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <button class="btn-primary btn-sm" type="button" data-view="batch">In this batch</button>
      <button class="btn-secondary btn-sm" type="button" data-view="pool">Applicant pool</button>
      <input class="field-input" id="applicantSearch" type="search" placeholder="Search name…"
             style="flex:1;min-width:150px;max-width:260px" />
    </div>

    <div id="poolBulkBar"
         style="display:none;margin-bottom:14px;padding:12px 14px;border:1.5px solid var(--grey-100);border-radius:8px">
      <div style="font-size:13px;margin-bottom:8px">
        Tick applicants below, choose a court, then click <b>Assign selected</b>.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select class="field-input" id="bulkStation" style="flex:1;min-width:180px;max-width:300px"></select>
        <select class="field-input" id="bulkCls" style="min-width:150px">
          <option value="">Classification…</option>
          ${CLASSIFICATIONS.map(c => `<option>${esc(c)}</option>`).join("")}
        </select>
        <button class="btn-primary btn-sm" type="button" id="btnBulkAssign">
          Assign selected (<span id="bulkCount">0</span>)
        </button>
      </div>
      <label style="display:flex;gap:6px;align-items:center;font-size:13px;margin-top:10px;cursor:pointer">
        <input type="checkbox" id="poolUnassignedOnly" />
        Show only applicants not yet assigned in this batch
      </label>
    </div>
  `;
  list.parentNode.insertBefore(bar, list);

  bar.querySelectorAll("[data-view]").forEach(btn =>
    btn.addEventListener("click", () => setApplicantView(btn.dataset.view))
  );
  document.getElementById("applicantSearch").addEventListener("input", renderApplicants);
  document.getElementById("poolUnassignedOnly").addEventListener("change", renderApplicants);
  document.getElementById("btnBulkAssign").addEventListener("click", bulkAssignApplicants);
}

function setApplicantView(view) {
  applicantView = view;
  document.querySelectorAll("#applicantToolbar [data-view]").forEach(btn => {
    btn.className = (btn.dataset.view === view ? "btn-primary" : "btn-secondary") + " btn-sm";
  });
  document.getElementById("poolBulkBar").style.display = view === "pool" ? "" : "none";
  const filterRow = document.getElementById("applicantStationFilter").closest(".filter-row");
  if (filterRow) filterRow.style.display = view === "pool" ? "none" : "";
  renderApplicants();
}

function renderApplicants() {
  const list = document.getElementById("applicantList");
  list.innerHTML = "";
  const q = (document.getElementById("applicantSearch").value || "").trim().toLowerCase();
  if (applicantView === "pool") renderPoolList(list, q);
  else renderBatchList(list, q);
}

// View 1 — who is assigned to which court in this batch
function renderBatchList(list, q) {
  const filterSid = document.getElementById("applicantStationFilter").value;

  const filtered = allApplicants
    .filter(a => !filterSid || String(a.station_id) === String(filterSid))
    .filter(a => !q || String(a.full_name).toLowerCase().includes(q))
    .sort((a, b) =>
      stationLabel(a.station_id).localeCompare(stationLabel(b.station_id)) ||
      String(a.full_name).localeCompare(String(b.full_name))
    );

  if (filtered.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">
      No applicants assigned${q ? " matching your search" : " to a court in this batch yet"}.
      ${applicantPool.length ? "Open the <b>Applicant pool</b> view to assign the applicants already in your sheet." : ""}
    </p>`;
    return;
  }

  filtered.forEach(a => {
    const row = document.createElement("div");
    row.className = "data-row";
    const parts = [
      a.classification ? esc(a.classification) : "",
      a.application_no ? "App. No. " + esc(a.application_no) : "",
      esc(stationLabel(a.station_id))
    ].filter(Boolean).join(" &bull; ");

    row.innerHTML = `
      <div class="data-row-main">
        <div class="data-row-title">${esc(a.full_name)}</div>
        <div class="data-row-sub">${parts}</div>
      </div>
      <div class="data-row-actions">
        <button class="btn-secondary btn-sm" data-action="edit">Edit</button>
        <button class="btn-danger btn-sm" data-action="remove">Remove</button>
      </div>
    `;
    row.querySelector("[data-action='edit']").addEventListener("click", () => showApplicantForm(a));
    row.querySelector("[data-action='remove']").addEventListener("click", () =>
      confirmAction(
        "Remove from Station",
        `Remove "${a.full_name}" from ${stationLabel(a.station_id)}? They stay in the applicant pool.`,
        () => removeApplicantAssignment(a)
      )
    );
    list.appendChild(row);
  });
}

// View 2 — everyone in the pool (all the applicants in the Google Sheet)
function renderPoolList(list, q) {
  const courtsOf = {};
  allApplicants.forEach(a => { courtsOf[a.applicant_id] = (courtsOf[a.applicant_id] || 0) + 1; });
  const unassignedOnly = document.getElementById("poolUnassignedOnly").checked;

  const people = applicantPool
    .filter(p => !q || String(p.full_name).toLowerCase().includes(q))
    .filter(p => !unassignedOnly || !courtsOf[p.applicant_id])
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

  updateBulkCount();

  if (people.length === 0) {
    list.innerHTML = `<p style="color:var(--grey-500);font-style:italic;font-size:14px">
      ${applicantPool.length === 0
        ? "The applicant pool is empty."
        : "No applicants match."}
    </p>`;
    return;
  }

  const shown = people.slice(0, POOL_RENDER_LIMIT);

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:13px";
  head.innerHTML = `
    <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
      <input type="checkbox" id="poolSelectAll" /> Select all shown
    </label>
    <span class="field-hint">
      ${people.length > shown.length
        ? `Showing the first ${shown.length} of ${people.length} — use the search box to narrow down.`
        : `${people.length} applicant${people.length === 1 ? "" : "s"}`}
    </span>
  `;
  list.appendChild(head);

  const allTicked = () => shown.every(p => poolSelected.has(p.applicant_id));
  const selectAll = head.querySelector("#poolSelectAll");
  selectAll.checked = allTicked();
  selectAll.addEventListener("change", () => {
    shown.forEach(p => selectAll.checked ? poolSelected.add(p.applicant_id) : poolSelected.delete(p.applicant_id));
    list.querySelectorAll("input[data-id]").forEach(cb => { cb.checked = selectAll.checked; });
    updateBulkCount();
  });

  shown.forEach(p => {
    const n   = courtsOf[p.applicant_id] || 0;
    const sub = n ? `${n} court${n === 1 ? "" : "s"} in this batch` : "Not assigned in this batch";
    const row = document.createElement("div");
    row.className = "data-row";
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer">
        <input type="checkbox" data-id="${esc(p.applicant_id)}" />
        <div class="data-row-main">
          <div class="data-row-title">${esc(p.full_name)}</div>
          <div class="data-row-sub">${sub}</div>
        </div>
      </label>
      <div class="data-row-actions">
        <button class="btn-secondary btn-sm" data-action="edit">Edit / assign</button>
      </div>
    `;
    const cb = row.querySelector("input[data-id]");
    cb.checked = poolSelected.has(p.applicant_id);
    cb.addEventListener("change", () => {
      cb.checked ? poolSelected.add(p.applicant_id) : poolSelected.delete(p.applicant_id);
      selectAll.checked = allTicked();
      updateBulkCount();
    });
    row.querySelector("[data-action='edit']").addEventListener("click", () => showApplicantForm(p));
    list.appendChild(row);
  });
}

function updateBulkCount() {
  const el = document.getElementById("bulkCount");
  if (el) el.textContent = poolSelected.size;
}

async function bulkAssignApplicants() {
  const station_id     = document.getElementById("bulkStation").value;
  const classification = document.getElementById("bulkCls").value;
  const ids = [...poolSelected];

  if (ids.length === 0) return showToast("Tick at least one applicant.", true);
  if (!station_id)      return showToast("Choose a court first.", true);

  const res = await callAPI("assignApplicantsToStation", {
    batch_id: activeBatch.batch_id, station_id, classification, applicant_ids: ids
  });
  if (res.status === "ok") {
    showToast(`${res.added} assigned to ${stationLabel(station_id)}` +
              (res.skipped ? `, ${res.skipped} already there.` : "."));
    poolSelected.clear();
    loadApplicants();
  } else showToast(res.message || "Failed.", true);
}

// One "station applied to" row inside the form
function addAssignmentRow(a = null) {
  const wrap = document.getElementById("applicantAssignments");
  const row  = document.createElement("div");
  row.className = "assign-row";
  row.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;" +
    "align-items:end;margin-bottom:12px;padding:12px;border:1.5px solid var(--grey-100);border-radius:8px";

  const stationOpts = batchStations
    .map(s => `<option value="${esc(s.station_id)}">${esc(s.court_station)} (${esc(s.court_type)})</option>`)
    .join("");
  const clsOpts = CLASSIFICATIONS.map(c => `<option>${esc(c)}</option>`).join("");

  row.innerHTML = `
    <div class="field-group">
      <label class="field-label">Station *</label>
      <select class="field-input ar-station"><option value="">Select station…</option>${stationOpts}</select>
    </div>
    <div class="field-group">
      <label class="field-label">Application No. <span class="field-hint">(optional)</span></label>
      <input class="field-input ar-appno" type="text" placeholder="e.g. 2025-001" />
    </div>
    <div class="field-group">
      <label class="field-label">Classification <span class="field-hint">(optional)</span></label>
      <select class="field-input ar-cls"><option value="">Select…</option>${clsOpts}</select>
    </div>
    <button class="btn-danger btn-sm ar-remove" type="button">Remove</button>
  `;
  wrap.appendChild(row);

  row.querySelector(".ar-station").value = a ? a.station_id : "";
  row.querySelector(".ar-appno").value   = a ? a.application_no : "";
  row.querySelector(".ar-cls").value     = a ? a.classification : "";
  row.querySelector(".ar-remove").addEventListener("click", () => row.remove());
}

// a = an assignment row from the list (or a pool person) → edit that person
function showApplicantForm(a = null) {
  const form   = document.getElementById("newApplicantForm");
  const person = a ? (applicantPool.find(p => p.applicant_id === a.applicant_id) || a) : null;

  document.getElementById("applicantFormTitle").textContent = a ? "Edit Applicant" : "Add Applicant";
  document.getElementById("editApplicantId").value          = a ? a.applicant_id : "";
  document.getElementById("newApplicantName").value         = person?.full_name             || "";
  document.getElementById("newApplicantBar").value          = person?.pre_judicature_rating || "";
  document.getElementById("newApplicantCases").value        = person?.cases                 || "";
  document.getElementById("newApplicantTeaching").value     = person?.teaching_experience   || "";
  document.getElementById("newApplicantOther").value        = person?.other_credentials     || "";

  const wrap = document.getElementById("applicantAssignments");
  wrap.innerHTML = "";
  const mine = a ? allApplicants.filter(x => x.applicant_id === a.applicant_id) : [];
  if (mine.length) mine.forEach(x => addAssignmentRow(x));
  else addAssignmentRow();

  document.getElementById("btnDeleteApplicantPool").style.display = a ? "" : "none";

  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Typing/picking a name that is already in the pool loads THAT person,
// so new stations are added to them instead of creating a duplicate.
function onApplicantNameChosen() {
  if (document.getElementById("editApplicantId").value) return;
  const typed = document.getElementById("newApplicantName").value.trim().toLowerCase();
  if (!typed) return;
  const match = applicantPool.find(p => String(p.full_name).toLowerCase() === typed);
  if (!match) return;

  const mine = allApplicants.filter(x => x.applicant_id === match.applicant_id);
  showApplicantForm(mine[0] || match);
  showToast("Existing applicant loaded — add or change their stations below.");
}

async function saveApplicant() {
  const editId = document.getElementById("editApplicantId").value;
  const rows = [...document.querySelectorAll("#applicantAssignments .assign-row")].map(r => ({
    station_id:     r.querySelector(".ar-station").value,
    application_no: r.querySelector(".ar-appno").value.trim(),
    classification: r.querySelector(".ar-cls").value
  }));

  const payload = {
    batch_id:              activeBatch.batch_id,
    applicant_id:          editId,
    full_name:             document.getElementById("newApplicantName").value.trim(),
    pre_judicature_rating: document.getElementById("newApplicantBar").value.trim(),
    cases:                 document.getElementById("newApplicantCases").value.trim(),
    teaching_experience:   document.getElementById("newApplicantTeaching").value.trim(),
    other_credentials:     document.getElementById("newApplicantOther").value.trim(),
    assignments:           rows
  };

  if (!payload.full_name) return showToast("Full name is required.", true);
  if (rows.some(r => !r.station_id)) {
    return showToast("Choose a station for every row (or remove the empty row).", true);
  }
  if (!editId && rows.length === 0) return showToast("Add at least one station.", true);

  const res = await callAPI("saveApplicant", payload);
  if (res.status === "ok") {
    showToast(editId ? "Applicant updated." : "Applicant added.");
    hideApplicantForm();
    loadApplicants();
  } else showToast(res.message || "Failed.", true);
}

async function removeApplicantAssignment(a) {
  const res = await callAPI("removeApplicantFromStation", { assignment_id: a.assignment_id });
  if (res.status === "ok") { showToast("Removed from station."); loadApplicants(); }
  else showToast(res.message || "Failed.", true);
}

async function deleteApplicant(applicant_id, force = false) {
  const res = await callAPI("deleteApplicant", { applicant_id, force });
  if (res.status === "ok") {
    showToast("Applicant deleted.");
    hideApplicantForm();
    loadApplicants();
  } else if (res.status === "warning") {
    confirmAction("Delete Applicant", res.message, () => deleteApplicant(applicant_id, true));
  } else showToast(res.message || "Failed.", true);
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
  toast.style.borderLeftColor = isError ? "#9b2222" : "#075620";
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