// supabase/functions/sign-session-jwt/index.ts
//
// DEPLOY:
//   supabase functions deploy sign-session-jwt
//
// SECRETS (set in Supabase dashboard → Edge Functions → Secrets):
//   SESSION_JWT_SECRET = <64-char random hex>
//   Generate one with: openssl rand -hex 32
//
// This function signs a JWT containing { mess_id, member_id, role }
// Supabase RLS policies read mess_id from the JWT to enforce row-level isolation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const secret = Deno.env.get("SESSION_JWT_SECRET");
  if (!secret || secret.length < 32) {
    console.error("SESSION_JWT_SECRET is missing or too short");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let body: { memberId?: string; messId?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const { memberId, messId, role } = body;

  if (!memberId || !messId || !role) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: memberId, messId, role" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Validate role is one of the known values
  const validRoles = ["manager", "member", "superadmin"];
  if (!validRoles.includes(role)) {
    return new Response(
      JSON.stringify({ error: "Invalid role" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    // Import HMAC-SHA256 signing key from the secret
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 30; // 30 days (matches SESSION_TTL_MS)

    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: memberId,
      mess_id: messId,
      member_id: memberId,
      role: role,
      iat: now,
      exp: exp,
    };

    // Base64url encode without padding
    const b64url = (obj: unknown) =>
      btoa(JSON.stringify(obj))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const headerB64  = b64url(header);
    const payloadB64 = b64url(payload);
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signingInput)
    );

    // Convert signature to base64url
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const jwt = `${signingInput}.${sigB64}`;

    return new Response(
      JSON.stringify({ token: jwt }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("JWT signing error:", e);
    return new Response(
      JSON.stringify({ error: "Signing failed" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
