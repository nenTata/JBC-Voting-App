// ============================================================
//  JBC VOTING APP — SHARED API HELPER
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyxPnZRtC-lFbSGuEk7R1cRO1ux-G-nxUiYsxpJ0zqHzh1LkVJpwflbasceoKj_pUfZ/exec'; // 👈 replace this
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
//   logout()                — clears session and redirects to login
// ============================================================

// ── YOUR APPS SCRIPT DEPLOYMENT URL ─────────────────────────
// Replace with your actual Web App URL after deploying Code.gs
//const API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec";

// ── Core fetch wrapper ───────────────────────────────────────
// Uses text/plain to bypass Apps Script CORS preflight.
// Reads response as text first, then parses JSON safely.
async function callAPI(action, data = {}) {
  const response = await fetch(API_URL, {
    method:   "POST",
    redirect: "follow",
    headers:  { "Content-Type": "text/plain;charset=utf-8" },
    body:     JSON.stringify({ action, data })
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("API response parse error:", text);
    throw new Error("Server returned an invalid response.");
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
function logout() {
  sessionStorage.clear();
  window.location.href = "index.html";
}