// ============================================================
// JBC VOTING SYSTEM — index.js  (Phase 3: Login)
// ============================================================
// Depends on: api.js  (callAPI, setSession, getSessionMember)
// On success: saves session → redirects to stations.html
// ============================================================

// ── DOM refs ─────────────────────────────────────────────────
const emailInput  = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnSignin   = document.getElementById("btnSignin");
const btnLabel    = document.getElementById("btnLabel");
const btnSpinner  = document.getElementById("btnSpinner");
const errorBanner = document.getElementById("errorBanner");
const errorText   = document.getElementById("errorText");
const togglePw    = document.getElementById("togglePw");

// ── If already logged in, skip to stations ───────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (getSessionMember()) {
    window.location.href = "stations.html";
    return;
  }

  // Wire up events
  btnSignin.addEventListener("click", handleLogin);
  togglePw.addEventListener("click", togglePassword);

  // Allow Enter key on both fields
  emailInput.addEventListener("keydown",    e => { if (e.key === "Enter") handleLogin(); });
  passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });

  // Clear error styling when user types
  emailInput.addEventListener("input",    clearError);
  passwordInput.addEventListener("input", clearError);

  // Focus email on load
  emailInput.focus();
});

// ── Toggle password visibility ───────────────────────────────
function togglePassword() {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";

  // Swap icon
  const icon = document.getElementById("eyeIcon");
  if (isHidden) {
    // Eye-off icon
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    `;
  } else {
    // Eye icon
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
  }
}

// ── Main login handler ───────────────────────────────────────
async function handleLogin() {
  // Read and trim values directly from the input elements
  const email    = emailInput.value.trim();
  const password = passwordInput.value.trim();

  // Client-side validation before hitting the server
  if (!email || !password) {
    showError("Please enter both your email and password.");
    if (!email) emailInput.classList.add("error");
    if (!password) passwordInput.classList.add("error");
    return;
  }

  setLoading(true);
  clearError();

  try {
    // callAPI sends: { action: "login", data: { email, password } }
    // Apps Script receives body.data.email and body.data.password
    const res = await callAPI("login", { email, password });

    if (res.status !== "ok") {
      showError(res.message || "Invalid email or password.");
      passwordInput.value = "";
      passwordInput.focus();
      return;
    }

    // Save member and active batch to sessionStorage
    setSession(res.member, res.active_batch);

    // Redirect based on role
    if (res.member.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "stations.html";
    }

  } catch (err) {
    showError("Network error. Please check your connection and try again.");
    console.error("Login error:", err);
  } finally {
    setLoading(false);
  }
}

// ── UI helpers ───────────────────────────────────────────────
function setLoading(on) {
  btnSignin.disabled = on;
  btnLabel.textContent = on ? "Signing in…" : "Sign In";
  btnSpinner.classList.toggle("hidden", !on);
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove("hidden");
  // Re-trigger shake animation
  errorBanner.style.animation = "none";
  void errorBanner.offsetWidth; // reflow
  errorBanner.style.animation = "";
}

function clearError() {
  errorBanner.classList.add("hidden");
  emailInput.classList.remove("error");
  passwordInput.classList.remove("error");
}