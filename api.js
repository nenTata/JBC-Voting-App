// ============================================================
// JBC VOTING SYSTEM — api.js
// Shared helper — MUST be loaded first on every HTML page
// ============================================================
// Exposes:
//   callAPI(action, data)   — sends POST to Apps Script
//   getSessionMember()      — returns logged-in member object
//   getSessionBatch()       — returns active batch object
//   setSession(member,batch)— saves both to sessionStorage
//   requireLogin()          — redirects to index.html if not logged in
//   requireAdmin()          — redirects non-admins away
//   logout()                — clears session + saved data, redirects
//
// OFFLINE / SPEED BEHAVIOUR
//   • Member-facing READ calls are saved on the device. If the
//     network is slow (> 30s) or offline, the saved copy is shown.
//   • getApplicants / getSettings rarely change during deliberation,
//     so they load instantly from the saved copy (refreshed in the
//     background). Any write (add/edit/delete) clears them.
//   • WRITE calls (submitVote, lock, etc.) always need internet.
//
// LOADING INDICATOR
//   • Every callAPI() automatically shows a top progress bar and a
//     "Loading… / Saving…" pill if it takes longer than 350ms.
//   • Turns amber with "slow connection" after 6 seconds.
//   • Live Dashboard auto-refresh is silent (see SILENT_ACTIONS).
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyxPnZRtC-lFbSGuEk7R1cRO1ux-G-nxUiYsxpJ0zqHzh1LkVJpwflbasceoKj_pUfZ/exec';

// ── Offline cache settings ───────────────────────────────────
const CACHE_PREFIX         = "jbc_cache:";
const NETWORK_TIMEOUT_MS   = 30000;           // give up on slow reads after 30s (Apps Script can be slow)
const FAST_READ_MAX_AGE_MS = 10 * 60 * 1000;  // 10 min

// Reads that may fall back to a saved copy (member-facing only —
// admin data such as members is intentionally NOT stored).
const CACHEABLE_READS = [
  "getBatches", "getStations", "getApplicants",
  "getVotes", "getSettings", "getNominationCount", "getNominationCounts"
];

// Reads that rarely change → served instantly from the saved copy.
const FAST_READS = ["getApplicants", "getSettings"];

// ── Saved-copy helpers ───────────────────────────────────────
function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function writeCache(key, res) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), res })); }
  catch { /* storage full — ignore */ }
}

function isWriteAction(action) {
  return !/^get/.test(action) && action !== "login" && action !== "generateReport";
}

// After a successful write, drop stale saved copies.
function invalidateCache(action) {
  const dropFast = /Applicant|Setting|Station|Batch/i.test(action);
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => {
      const isFast = FAST_READS.some(a => k.startsWith(CACHE_PREFIX + a + ":"));
      if (!isFast || dropFast) localStorage.removeItem(k);
    });
}

function clearAllCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

// ── Offline badge ────────────────────────────────────────────
function showOfflineBadge(on) {
  if (!document.body) return;
  let el = document.getElementById("jbc-offline-badge");
  if (!on) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement("div");
  el.id = "jbc-offline-badge";
  el.textContent = "⚠ Offline — showing saved data";
  el.style.cssText =
    "position:fixed;top:68px;left:50%;transform:translateX(-50%);" +
    "background:#92600a;color:#fff;font:600 13px sans-serif;" +
    "padding:6px 14px;border-radius:99px;z-index:9999;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none";
  document.body.appendChild(el);
}
window.addEventListener("online", () => showOfflineBadge(false));

// ── Raw network call (with optional timeout) ─────────────────
// Uses text/plain to bypass Apps Script CORS preflight.
async function fetchAPI(action, data, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(API_URL, {
      method:   "POST",
      redirect: "follow",
      headers:  { "Content-Type": "text/plain;charset=utf-8" },
      body:     JSON.stringify({ action, data }),
      signal:   controller ? controller.signal : undefined
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("API response parse error:", text);
      throw new Error("Server returned an invalid response.");
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Global loading indicator ─────────────────────────────────
// Shows automatically for EVERY callAPI() on EVERY page (login,
// stations, nominees, admin actions, etc.) — no per-page code.
//   • A green progress bar slides across the top of the screen.
//   • A pill at the bottom says "Loading…" (or "Saving…" for writes).
//   • After 6s it turns amber: "Still working… slow connection".
// It only appears if a call takes longer than 350ms, so fast
// responses never flicker. It never blocks taps or clicks.
const SILENT_ACTIONS     = ["getDashboardData"]; // auto-refresh polling — no indicator
const BUSY_SHOW_DELAY_MS = 350;
const BUSY_SLOW_MS       = 6000;

let busyCount = 0, busyShowTimer = null, busySlowTimer = null, busyHideTimer = null;

function ensureBusyUI() {
  if (document.getElementById("jbc-busy") || !document.body) return;

  const style = document.createElement("style");
  style.textContent = `
    #jbc-busy{position:fixed;inset:0;pointer-events:none;z-index:10000;opacity:0;transition:opacity .2s}
    #jbc-busy.on{opacity:1}
    .jbc-busy-bar{position:absolute;top:0;left:0;right:0;height:4px;background:rgba(41,148,38,.18);overflow:hidden}
    .jbc-busy-bar::after{content:"";position:absolute;top:0;bottom:0;width:40%;
      background:linear-gradient(90deg,#299426,#3db82e);border-radius:4px;
      animation:jbc-slide 1.1s ease-in-out infinite}
    @keyframes jbc-slide{0%{left:-40%}100%{left:100%}}
    .jbc-busy-pill{position:absolute;left:50%;transform:translateX(-50%);
      bottom:calc(20px + env(safe-area-inset-bottom,0px));
      display:flex;align-items:center;gap:10px;background:#075620;color:#fff;
      font:600 14px/1.25 system-ui,sans-serif;padding:10px 18px;border-radius:99px;
      box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:calc(100% - 32px);text-align:left}
    .jbc-busy-spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.35);
      border-top-color:#fff;border-radius:50%;animation:jbc-spin .7s linear infinite;flex-shrink:0}
    @keyframes jbc-spin{to{transform:rotate(360deg)}}
    #jbc-busy.slow .jbc-busy-pill{background:#92600a}
  `;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "jbc-busy";
  el.innerHTML =
    '<div class="jbc-busy-bar"></div>' +
    '<div class="jbc-busy-pill" role="status" aria-live="polite">' +
    '<span class="jbc-busy-spin"></span><span id="jbc-busy-text">Loading…</span></div>';
  document.body.appendChild(el);
}

function busyStart(label) {
  clearTimeout(busyHideTimer);
  busyCount++;
  if (busyCount > 1) return;

  busyShowTimer = setTimeout(() => {
    ensureBusyUI();
    const el = document.getElementById("jbc-busy");
    if (!el) return;
    document.getElementById("jbc-busy-text").textContent = label;
    el.classList.remove("slow");
    el.classList.add("on");
  }, BUSY_SHOW_DELAY_MS);

  busySlowTimer = setTimeout(() => {
    const el = document.getElementById("jbc-busy");
    if (!el) return;
    el.classList.add("slow");
    document.getElementById("jbc-busy-text").textContent =
      "Still working… slow connection, please wait";
  }, BUSY_SLOW_MS);
}

function busyEnd() {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount > 0) return;

  clearTimeout(busyShowTimer);
  clearTimeout(busySlowTimer);
  // Small delay so back-to-back calls don't make the bar flicker
  busyHideTimer = setTimeout(() => {
    const el = document.getElementById("jbc-busy");
    if (el) el.classList.remove("on", "slow");
  }, 200);
}

// ── Core API wrapper ─────────────────────────────────────────
async function callAPI(action, data = {}) {
  if (SILENT_ACTIONS.includes(action)) return callAPICore(action, data);

  busyStart(isWriteAction(action) ? "Saving…" : "Loading…");
  try {
    return await callAPICore(action, data);
  } finally {
    busyEnd();
  }
}

async function callAPICore(action, data = {}) {
  const cacheable = CACHEABLE_READS.includes(action);
  const isFast    = FAST_READS.includes(action);
  const key       = cacheable ? `${CACHE_PREFIX}${action}:${JSON.stringify(data)}` : null;

  // 1) Rarely-changing reads: show saved copy instantly, refresh quietly.
  if (isFast) {
    const hit = readCache(key);
    if (hit && Date.now() - hit.t < FAST_READ_MAX_AGE_MS) {
      fetchAPI(action, data, NETWORK_TIMEOUT_MS)
        .then(res => { if (res.status === "ok") writeCache(key, res); })
        .catch(() => {});
      return hit.res;
    }
  }

  // 2) Writes / login / dashboard / admin reads: always live.
  //    No timeout on writes so a slow save is never aborted midway.
  if (!cacheable) {
    if (!navigator.onLine) {
      throw new Error("You are offline. Please reconnect and try again.");
    }
    const res = await fetchAPI(action, data);
    if (isWriteAction(action) && res.status === "ok") invalidateCache(action);
    return res;
  }

  // 3) Other cacheable reads: network first (30s), saved copy as fallback.
  try {
    const res = await fetchAPI(action, data, NETWORK_TIMEOUT_MS);
    if (res.status === "ok") {
      writeCache(key, res);
      showOfflineBadge(false);
    }
    return res;
  } catch (err) {
    const hit = readCache(key);
    if (hit) {
      console.warn("JBC: network unavailable — using saved data for", action);
      showOfflineBadge(true);
      return hit.res;
    }
    throw err;
  }
}

// ── Session: save ────────────────────────────────────────────
function setSession(member, batch) {
  sessionStorage.setItem("jbc_member", JSON.stringify(member));
  if (batch) {
    sessionStorage.setItem("jbc_batch", JSON.stringify(batch));
  }
}

// ── Session: read ────────────────────────────────────────────
function getSessionMember() {
  try { return JSON.parse(sessionStorage.getItem("jbc_member")); }
  catch { return null; }
}

function getSessionBatch() {
  try { return JSON.parse(sessionStorage.getItem("jbc_batch")); }
  catch { return null; }
}

// ── Auth guards ──────────────────────────────────────────────
function requireLogin() {
  if (!getSessionMember()) {
    window.location.href = "index.html";
  }
}

function requireAdmin() {
  const member = getSessionMember();
  if (!member) { window.location.href = "index.html"; return; }
  if (member.role !== "admin") { window.location.href = "stations.html"; }
}

// ── Logout ───────────────────────────────────────────────────
// Also wipes saved data so nothing is left on a shared device.
function logout() {
  clearAllCache();
  sessionStorage.clear();
  window.location.href = "index.html";
}

// ── PWA: register + auto-update service worker ───────────────
if ('serviceWorker' in navigator) {
  // Only auto-reload on an UPDATE, not on the very first install
  // (the first install also fires "controllerchange" and would
  // cause a pointless extra page reload).
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('./service-worker.js')
    .then(registration => {
      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;   // first install — no reload needed
        if (refreshing) return;
        refreshing = true;
        console.log('JBC: New version available — reloading.');
        window.location.reload();
      });
    })
    .catch(err => console.log('JBC SW registration error:', err));
}