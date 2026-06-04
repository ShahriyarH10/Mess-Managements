/* ═══════════════════════════════════════════════
   CORE — Config: Supabase client, global state, constants
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   SUPABASE
═══════════════════════════════════════════ */
const SUPABASE_URL = "https://lrzotklutnyzcadutgwf.supabase.co";
const SUPABASE_KEY = "sb_publishable__22c2PXW3UFp8RGF_C1rpQ_uvcyFXnb";

// Anon client — used ONLY during login and mess creation (before JWT exists)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Returns a mess-scoped authenticated client using the signed session JWT.
// Falls back to anon client if no token (during login flow).
function getClient() {
  const token = _getSessionToken();
  if (!token) return sb;
  return supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function _getSessionToken() {
  try {
    const raw = localStorage.getItem("mm_session");
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload.jwt || null;
  } catch { return null; }
}

/* ═══════════════════════════════════════════
   SECURITY — Password hashing
   Passwords are hashed with PBKDF2-SHA-256 +
   per-user salt before storing. Plain text
   never leaves the browser.
═══════════════════════════════════════════ */

/**
 * Hash a password with PBKDF2-SHA-256.
 * Returns "pbkdf2:<salt_hex>:<hash_hex>".
 * If a stored value is a legacy SHA-256 hex (64 chars, no prefix),
 * pass it directly to comparePassword for backward compat.
 */
async function hashPassword(plain, saltHex) {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(plain), "PBKDF2", false, ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  const hashHex = bytesToHex(new Uint8Array(derived));
  const saltOut = bytesToHex(salt);
  return `pbkdf2:${saltOut}:${hashHex}`;
}

async function comparePassword(plain, stored) {
  if (!stored) return false;
  if (stored.startsWith("pbkdf2:")) {
    const [, saltHex] = stored.split(":");
    const rehashed = await hashPassword(plain, saltHex);
    return rehashed === stored;
  }
  // Legacy SHA-256 fallback (64-char hex)
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const legacyHash = bytesToHex(new Uint8Array(buf));
  return legacyHash === stored;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return arr;
}

/* ═══════════════════════════════════════════
   SUPERADMIN
   Hash stored as PBKDF2. To rotate:
     hashPassword("yourNewPassword").then(console.log)
   Then paste the result below.
═══════════════════════════════════════════ */
const SUPERADMIN = {
  username: "superadmin",
  // PBKDF2-SHA-256 of "super@admin2025"
  passwordHash: "pbkdf2:a3f1b2c4d5e6f708a9b0c1d2e3f40516:7fb3ccf24ee474f31ef17a269c153be6f58febae8d39de86b4259227a01529d2",
  role: "superadmin",
};

/* ═══════════════════════════════════════════
   SESSION — 30-day expiry, localStorage only
   (sessionStorage copy removed — shared devices
    should always sign out explicitly)
═══════════════════════════════════════════ */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════
   LOGIN RATE LIMITING CONSTANTS
═══════════════════════════════════════════ */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 minutes
const LOGIN_LOCKOUT_KEY  = "mm_login_lock";
const LOGIN_ATTEMPTS_KEY = "mm_login_attempts";
const LATE_NIGHT_HOUR    = 23; // hour at which to show "tomorrow" for meal entry

/* ═══════════════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════════════ */
let currentUser = null;
let currentMess = null;
let members = [];
let currentPage = "";

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const PALETTE = [
  { bg: "#1a2a3a", fg: "#5b9bd5" },  // blue
  { bg: "#1a2e25", fg: "#4caf82" },  // green
  { bg: "#2e1a1a", fg: "#e05252" },  // red
  { bg: "#2a2218", fg: "#d4a853" },  // amber
  { bg: "#251a2e", fg: "#9b7fd4" },  // purple
  { bg: "#1e2a2a", fg: "#4cb8b8" },  // teal
  { bg: "#2e1f1a", fg: "#d47a4c" },  // orange
  { bg: "#1a1a2e", fg: "#7a7dd4" },  // indigo
  { bg: "#1e2a1e", fg: "#6abf6a" },  // lime
  { bg: "#2e2420", fg: "#c49a6c" },  // brown
  { bg: "#2a1a24", fg: "#d47aaa" },  // pink
  { bg: "#1a2428", fg: "#5bbbd4" },  // cyan
];
