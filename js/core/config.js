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
   GLOBAL STATE
═══════════════════════════════════════════ */
let currentUser = null;
let currentMess = null;
let members = [];
let currentPage = "";

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const SUPERADMIN = {
  username: "superadmin",
  password: "super@admin2025",
  role: "superadmin",
};

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
