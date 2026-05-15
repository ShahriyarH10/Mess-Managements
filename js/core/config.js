/* ═══════════════════════════════════════════════
   CORE — Config: Supabase client, global state, constants
   ═══════════════════════════════════════════════ */
"use strict";

/* ═══════════════════════════════════════════
   SUPABASE
═══════════════════════════════════════════ */
const SUPABASE_URL = "https://lrzotklutnyzcadutgwf.supabase.co";
const SUPABASE_KEY = "sb_publishable__22c2PXW3UFp8RGF_C1rpQ_uvcyFXnb";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ═══════════════════════════════════════════
   SECURITY — Password hashing
   All passwords are SHA-256 hashed before
   storing or comparing. Plain text never
   leaves the browser.
═══════════════════════════════════════════ */
async function hashPassword(plain) {
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ═══════════════════════════════════════════
   SUPERADMIN
   Credentials stored as SHA-256 hash only.
   Change by hashing your new password:
     hashPassword("yourNewPassword").then(console.log)
   Then paste the result below.
═══════════════════════════════════════════ */
const SUPERADMIN = {
  username: "superadmin",
  // SHA-256 of "" — change this hash to change the password
  passwordHash: "7fb3ccf24ee474f31ef17a269c153be6f58febae8d39de86b4259227a01529d2",
  role: "superadmin",
};

/* ═══════════════════════════════════════════
   SESSION — 24-hour expiry
═══════════════════════════════════════════ */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
  { bg: "#1a2a3a", fg: "#5b9bd5" },
  { bg: "#1a2e25", fg: "#4caf82" },
  { bg: "#2e1a1a", fg: "#e05252" },
  { bg: "#2a2218", fg: "#d4a853" },
  { bg: "#251a2e", fg: "#9b7fd4" },
  { bg: "#1e2a2a", fg: "#4cb8b8" },
  { bg: "#2e1f1a", fg: "#d47a4c" },
  { bg: "#1a1a2e", fg: "#7a7dd4" },
];
