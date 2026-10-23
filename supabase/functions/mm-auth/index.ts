// supabase/functions/mm-auth/index.ts
//
// Server-side sign-in for MessManager. Replaces checking passwords in the browser.
//
//   POST { action: "login",           username, password }
//   POST { action: "create_mess",     messName, location, name, username, password }
//   POST { action: "change_password", current, next }        (Authorization: Bearer <session token>)
//
// → { token, user: { name, username, role, memberId }, mess }   or   { error }
//
// Passwords never leave this function: members.password is read with the service role
// (supabase/security-lockdown.sql hides that column from browsers). Failed sign-ins are
// rate-limited per username in the auth_attempts table (5 per 15 minutes).
//
// The session token is a Supabase-compatible JWT: role "authenticated" (the Postgres
// role PostgREST switches to) plus the app's own claims — mess_id, member_id, app_role —
// which the RLS policies in security-lockdown.sql read with auth.jwt().
//
// DEPLOY:   supabase functions deploy mm-auth --no-verify-jwt
// SECRETS (Dashboard → Edge Functions → Secrets):
//   MM_JWT_SECRET             = the project's JWT secret (Settings → API → JWT Settings → "Legacy JWT secret")
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to edge functions automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TTL_SECONDS = 60 * 60 * 24 * 30;      // 30 days, same as the app's SESSION_TTL_MS
const MAX_FAILS = 5, WINDOW_MIN = 15;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

/* ── Password hashing — identical format to js/core/config.js ("pbkdf2:<salt>:<hash>") ── */
const enc = new TextEncoder();
const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map(x => parseInt(x, 16)));

async function hashPassword(plain: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("pbkdf2:")) return safeEqual(await hashPassword(plain, stored.split(":")[1]), stored);
  // legacy unsalted SHA-256 (upgraded to PBKDF2 on the next successful sign-in)
  const legacy = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(plain))));
  return safeEqual(legacy, stored);
}

/* ── JWT (HS256) ── */
const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmacKey() {
  const secret = Deno.env.get("MM_JWT_SECRET") || "";
  if (secret.length < 32) throw new Error("MM_JWT_SECRET is not set");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ aud: "authenticated", role: "authenticated", iat: now, exp: now + TTL_SECONDS, ...claims }));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}
async function verifyToken(token: string): Promise<Record<string, any> | null> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sig, enc.encode(`${h}.${p}`));
  if (!ok) return null;
  const claims = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  return claims.exp > Date.now() / 1000 ? claims : null;
}

/* ── Rate limiting (auth_attempts: key, ok, created_at) ── */
// If auth_attempts doesn't exist yet (supabase/auth-attempts.sql not run), sign-in still
// works — just without rate limiting — instead of failing for everyone.
async function tooManyFailures(key: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const { count, error } = await db.from("auth_attempts").select("id", { count: "exact", head: true })
    .eq("key", key).eq("ok", false).gte("created_at", since);
  if (error) { console.warn("[mm-auth] rate limiting off:", error.message); return false; }
  return (count ?? 0) >= MAX_FAILS;
}
async function recordAttempt(key: string, ok: boolean) {
  const { error } = await db.from("auth_attempts").insert({ key, ok });
  if (error) console.warn("[mm-auth] attempt not recorded:", error.message);
}

const sessionFor = async (m: any, mess: any) => ({
  token: await signToken({ sub: m.id, member_id: m.id, mess_id: m.mess_id, app_role: m.role }),
  user: { name: m.name, username: m.username, role: m.role, memberId: m.id },
  mess,
});
const clean = (v: unknown, max = 80) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

/* ── Actions ── */
async function login(body: any) {
  const username = clean(body.username, 40), password = String(body.password ?? "");
  if (!username || !password) return json({ error: "Enter username and password." }, 400);
  const key = "login:" + username.toLowerCase();
  if (await tooManyFailures(key)) return json({ error: `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.` }, 429);

  // Usernames are unique per mess; try every match so two messes can't lock each other out.
  const { data: rows, error } = await db.from("members").select("*, messes(*)").ilike("username", username);
  if (error) return json({ error: "Sign-in is unavailable right now." }, 500);
  for (const m of rows || []) {
    if (!(await verifyPassword(password, m.password))) continue;
    if (!String(m.password).startsWith("pbkdf2:")) {
      await db.from("members").update({ password: await hashPassword(password) }).eq("id", m.id);
    }
    await recordAttempt(key, true);
    const { password: _drop, messes, ...member } = m;
    return json(await sessionFor(member, messes));
  }
  await recordAttempt(key, false);
  return json({ error: "Invalid username or password." }, 401);
}

async function createMess(body: any, ip: string) {
  const messName = clean(body.messName), name = clean(body.name), username = clean(body.username, 40);
  const location = clean(body.location), password = String(body.password ?? "");
  if (!messName || !name) return json({ error: "Mess name and your name are required." }, 400);
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) return json({ error: "Username must be 3–40 letters, numbers, _ . or -." }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
  // at most 5 new messes per address per 15 minutes (each create counts as an attempt)
  const key = "create:" + ip;
  if (await tooManyFailures(key)) return json({ error: "Too many attempts — try again later." }, 429);
  await recordAttempt(key, false);
  const { count } = await db.from("members").select("id", { count: "exact", head: true }).ilike("username", username);
  if ((count ?? 0) > 0) return json({ error: "That username is already taken — choose another." }, 409);

  const { data: mess, error: e1 } = await db.from("messes").insert({ name: messName, location }).select().single();
  if (e1) return json({ error: "Could not create the mess." }, 500);
  const { data: m, error: e2 } = await db.from("members")
    .insert({ mess_id: mess.id, name, username, password: await hashPassword(password), role: "manager", joined: new Date().toISOString().slice(0, 10) })
    .select("id, mess_id, name, username, role").single();
  if (e2) { await db.from("messes").delete().eq("id", mess.id); return json({ error: "Could not create your account." }, 500); }
  return json(await sessionFor(m, mess));
}

async function changePassword(body: any, auth: string | null) {
  const claims = auth ? await verifyToken(auth.replace(/^Bearer\s+/i, "")) : null;
  if (!claims?.member_id) return json({ error: "Please sign in again." }, 401);
  const current = String(body.current ?? ""), next = String(body.next ?? "");
  if (next.length < 6) return json({ error: "New password must be at least 6 characters." }, 400);
  if (next === current) return json({ error: "New password must be different from the current one." }, 400);
  const key = "pw:" + claims.member_id;
  if (await tooManyFailures(key)) return json({ error: `Too many attempts. Try again in ${WINDOW_MIN} minutes.` }, 429);
  const { data: m } = await db.from("members").select("id, password").eq("id", claims.member_id).maybeSingle();
  if (!m || !(await verifyPassword(current, m.password))) { await recordAttempt(key, false); return json({ error: "Current password is incorrect." }, 401); }
  const { error } = await db.from("members").update({ password: await hashPassword(next) }).eq("id", m.id);
  if (error) return json({ error: "Could not save the new password." }, 500);
  await recordAttempt(key, true);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  try {
    switch (body?.action) {
      case "login":           return await login(body);
      case "create_mess":     return await createMess(body, (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim());
      case "change_password": return await changePassword(body, req.headers.get("authorization"));
      default:                return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("[mm-auth]", e);
    return json({ error: "Sign-in is unavailable right now." }, 500);
  }
});
