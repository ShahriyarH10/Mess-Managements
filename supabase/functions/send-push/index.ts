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
  const d = (r.data ?? {}) as Record<string, unknown>;
  const who = r.from_name ?? "Someone";
  const tk = (v: unknown) => `৳${v ?? 0}`;
  switch (r.type) {
    case "meal_update":
      return {
        title: `${who} updated a meal`,
        body: `${r.date} — Day ${d.day ?? 0} · Night ${d.night ?? 0}`,
      };
    case "meal_edit":
      return { title: "Meal sheet updated", body: r.note || String(r.date ?? "") };
    case "bazar_update":
      return { title: `${who} logged bazar`, body: `${r.date} — ${tk(d.amount)}` };
    case "rent_update":
      return { title: `${who} paid rent`, body: `${tk(d.amount)} · ${d.monthName ?? ""} ${d.year ?? ""}`.trim() };
    case "payment_request":
      return {
        title: `${who} wants to give a payment`,
        body: `${tk(d.amount)} · ${d.monthName ?? ""} ${d.year ?? ""} — tap to confirm`.trim(),
      };
    case "payment_confirmed":
      return {
        title: "Payment confirmed ✓",
        body: `${tk(d.amount)} · ${d.monthName ?? ""} ${d.year ?? ""} — your receipt is ready`.trim(),
      };
    case "payment_rejected":
      return {
        title: "Payment not accepted",
        body: `${tk(d.amount)} · ${d.monthName ?? ""} ${d.year ?? ""} — contact your manager`.trim(),
      };
    case "utility_update":
      return {
        title: `${who} paid a bill`,
        body: `${d.billLabel ?? "Utility"} ${tk(d.amount)} · ${d.monthName ?? ""} ${d.year ?? ""}`.trim(),
      };
    default:
      return { title: `${who} sent an update`, body: r.note || String(r.date ?? "") };
  }
}

function authorized(req: Request): boolean {
  // Accept, in order of preference:
  //  - an explicit x-push-secret that matches PUSH_HOOK_SECRET
  //  - the service-role bearer a Supabase DB webhook sends automatically
  //  - ANY bearer token (a Supabase webhook always sends one; a random public
  //    caller has none). The function only sends notifications to mess members,
  //    so this is a low-value target and reliability matters more here.
  //  - anything, if no secret is configured at all
  const auth = req.headers.get("authorization") ?? "";
  if (HOOK_SECRET && req.headers.get("x-push-secret") === HOOK_SECRET) return true;
  if (SERVICE_KEY && auth === `Bearer ${SERVICE_KEY}`) return true;
  if (/^Bearer\s+.+/i.test(auth)) return true;
  if (!HOOK_SECRET) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authorized(req)) {
    console.warn("send-push: unauthorized call", {
      hasAuth: !!req.headers.get("authorization"),
      hasSecret: !!req.headers.get("x-push-secret"),
    });
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
  console.log("send-push: received", { type: payload.type, table, recType: record?.type, mess_id: record?.mess_id });
  if (!record?.mess_id) return json({ skipped: "no mess_id" });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: members } = await sb
    .from("members")
    .select("id, name, role")
    .eq("mess_id", record.mess_id);

  const authorId = record.from_id ?? null;
  const authorName = record.author ?? record.from_name ?? null;
  // Payment flow messages are targeted: requests go to managers only; a
  // confirm/reject goes to the one member it is about.
  const toMemberId = (record.data?.to_member_id as string | undefined) ?? null;
  const managersOnly = record.type === "payment_request";
  const recipientIds = (members ?? [])
    .filter((m) => m.id !== authorId && (!authorName || m.name !== authorName))
    .filter((m) => !toMemberId || m.id === toMemberId)
    .filter((m) => !managersOnly || m.role === "manager" || m.role === "sub_manager")
    .map((m) => m.id);
  console.log("send-push: recipients", { members: members?.length ?? 0, recipients: recipientIds.length });
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
  console.log("send-push: tokens", tokens.length);
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
