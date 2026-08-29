// supabase/functions/send-push/index.ts
//
// Fans a new `broadcasts` / `notifications` row out to every mess member's
// devices via Expo's push service. Triggered by a Database Webhook or the
// public.tg_send_push() trigger (see supabase/push-notifications.sql).
//
// DEPLOY:
//   supabase functions deploy send-push --no-verify-jwt
//
// SECRETS (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   PUSH_HOOK_SECRET = <random string; also sent by the webhook/trigger>
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOOK_SECRET = Deno.env.get("PUSH_HOOK_SECRET") ?? "";
const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface Row {
  id?: string;
  mess_id?: string;
  from_id?: string | null;
  from_name?: string | null;
  author?: string | null;
  type?: string;
  date?: string;
  message?: string;
  priority?: string;
  note?: string;
  data?: Record<string, unknown>;
}

function buildMessage(table: string, r: Row): { title: string; body: string } {
  if (table === "broadcasts") {
    return {
      title: r.priority === "urgent" ? "🔴 Urgent broadcast" : "New broadcast",
      body: r.message ?? "",
    };
  }
  const d = r.data ?? {};
  const who = r.from_name ?? "Someone";
  switch (r.type) {
    case "meal_update":
      return {
        title: `${who} updated a meal`,
        body: `${r.date} — Day ${d.day ?? 0} · Night ${d.night ?? 0}`,
      };
    case "meal_edit":
      return { title: "Meal sheet updated", body: r.note || String(r.date ?? "") };
    case "bazar_update":
      return { title: `${who} logged bazar`, body: `${r.date} — ৳${d.amount ?? 0}` };
    default:
      return { title: `${who} — ${r.type ?? "update"}`, body: r.note || String(r.date ?? "") };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (HOOK_SECRET && req.headers.get("x-push-secret") !== HOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  let payload: { table?: string; type?: string; record?: Row };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  // Dashboard webhook: { type:"INSERT", table:"broadcasts", record:{...} }
  // SQL trigger:        { table:"broadcasts", record:{...} }
  const table = payload.table ?? "";
  const record = payload.record;
  if (!record?.mess_id) return json({ skipped: "no mess_id" });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: members } = await sb
    .from("members")
    .select("id, name")
    .eq("mess_id", record.mess_id);

  const authorId = record.from_id ?? null;
  const authorName = record.author ?? record.from_name ?? null;
  const recipientIds = (members ?? [])
    .filter((m) => m.id !== authorId && (!authorName || m.name !== authorName))
    .map((m) => m.id);
  if (recipientIds.length === 0) return json({ sent: 0, reason: "no recipients" });

  const { data: tokenRows } = await sb
    .from("push_tokens")
    .select("token")
    .in("member_id", recipientIds);

  const uniq = new Set<string>();
  for (const row of tokenRows ?? []) {
    const t = String(row.token ?? "");
    if (t.startsWith("ExponentPushToken")) uniq.add(t);
  }
  const tokens = [...uniq];
  if (tokens.length === 0) return json({ sent: 0, reason: "no tokens" });

  const { title, body } = buildMessage(table, record);
  const data = { rowId: record.id ?? "", table };
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    channelId: "broadcasts",
  }));

  const chunks: (typeof messages)[] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  const dead: string[] = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const out = await res.json();
      (out.data ?? []).forEach((d: { status?: string; details?: { error?: string } }, i: number) => {
        if (d.status === "error" && d.details?.error === "DeviceNotRegistered") {
          dead.push(chunk[i].to);
        }
      });
    } catch (e) {
      console.error("expo push failed", e);
    }
  }

  if (dead.length) await sb.from("push_tokens").delete().in("token", dead);

  return json({ sent: tokens.length, pruned: dead.length });
});
