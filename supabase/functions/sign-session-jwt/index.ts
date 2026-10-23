// supabase/functions/sign-session-jwt/index.ts — RETIRED
//
// This function used to sign a session token for whatever memberId / messId / role it was
// sent, without checking a password — anyone could ask it for a manager token. Sign-in now
// goes through supabase/functions/mm-auth, which verifies the password on the server.
//
// Redeploy this stub (or delete the function) so the old endpoint can never mint tokens:
//   supabase functions deploy sign-session-jwt     — or —     supabase functions delete sign-session-jwt

Deno.serve(() =>
  new Response(JSON.stringify({ error: "Retired — use the mm-auth function" }), {
    status: 410,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
);
