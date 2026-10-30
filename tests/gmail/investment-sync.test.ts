import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "next/server" ? pathToFileURL(require.resolve("next/server.js")).href : specifier, context);
} });
const { syncMailbox } = await import("@/lib/gmail/sync");
const { seal } = await import("@/lib/gmail/server");
const { ALERT_PARSER_VERSION } = await import("@/lib/gmail/alerts");
const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_TOKEN_KEY", "APP_ORIGIN", "CRON_SECRET"];
const previous = Object.fromEntries(names.map(k => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; hook.deregister(); for (const k of names) {
  if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
} });

test("three equal-value allocations stay separate, reminders create no payment and repeat sync is safe", async () => {
  for (const name of names) process.env[name] = "synthetic";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example";
  process.env.GMAIL_TOKEN_KEY = "ab".repeat(32);
  const user = "11111111-1111-4111-8111-111111111111";
  const rows: Record<string, any> = Object.fromEntries(["allocation1", "allocation2", "allocation3", "reminder"].map(id => [id, { message_id: id, status: "pending", parser_version: 0 }]));
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "content-range": Array.isArray(value) ? `0-${Math.max(0,value.length-1)}/${value.length}` : "*/0" } });
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    if (url.hostname === "oauth2.googleapis.com") return json({ access_token: "synthetic" });
    if (url.hostname === "gmail.googleapis.com") {
      if (url.pathname.endsWith("/messages")) {
        if(url.searchParams.get('q')?.includes('noreply@zomato.com'))return json({messages:[]});
        assert.match(url.searchParams.get("q")!, /from:noreply@groww.in/);
        return json({ messages: Object.keys(rows).map(id => ({ id })) });
      }
      const id = url.pathname.split("/").at(-1)!;
      const text = id === "reminder"
        ? "SCHEME NAME Example Fund SIP AMOUNT ₹10,000.00 DUE DATE 26 Oct'26 BANK ICICI BANK LIMITED BANK ACCOUNT NO. 999991234"
        : `Mutual fund units have been allocated to your portfolio. SCHEME NAME Fund ${id} SIP AMOUNT ₹9,999.50 UNITS ALLOCATED 50.125 NAV 199.4913 ORDER ID GME261026EXAMPLE${id.slice(-1)}00001 VIEW ORDER`;
      return json({ internalDate: "1793120000000", payload: { mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") }, headers: [
        { name: "From", value: "noreply@groww.in" },
        { name: "Subject", value: id === "reminder" ? "SIP: Instalment due in 2 days" : "SIP: Units allocated" },
        { name: "Authentication-Results", value: "mx.google.com; dmarc=pass header.from=groww.in" },
      ] } });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname.endsWith("/rpc/gmail_acquire_lease")) return json(true);
    assert.ok(!url.pathname.includes("/rpc/"), "Investment notices must not call a cash-commit or bank matcher RPC");
    if (url.pathname.endsWith("/gmail_connections")) return json(method === "GET" ? { refresh_token: seal("synthetic", user), start_date: "2026-10-01", aliases: {} } : body?.receipt_scan?{user_id:user}:null);
    if (url.pathname.endsWith("/gmail_messages")) {
      if (method === "POST") { assert.match(url.searchParams.get("on_conflict")!, /user_id,message_id/); return json(null); }
      if (method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
      if (method === "PATCH") {
        calls++;
        const id = url.searchParams.get("message_id")!.slice(3);
        Object.assign(rows[id], body);
        return json(url.searchParams.has("select") ? { message_id: id } : null);
      }
      return json(url.searchParams.get("select") === "message_id" ? Object.values(rows).filter(r => r.status === "pending" || (r.status === "review" && r.parser_version < ALERT_PARSER_VERSION)).map(r => ({ message_id: r.message_id })) : []);
    }
    assert.equal(method, "GET", "No financial writes for provider evidence alone");
    return json(url.pathname.endsWith("/profiles") ? null : []);
  };
  assert.deepEqual(await syncMailbox(user), { logged: 0, reviewed: 3, matched: 0, more: false, receiptsChecked:0,receiptsLinked:0 });
  assert.equal(rows.reminder.status, "ignored");
  for (const id of ["allocation1", "allocation2", "allocation3"]) {
    assert.equal(rows[id].status, "review");
    assert.equal(rows[id].candidate.netAmount, 999950);
    assert.equal(rows[id].candidate.scheduledAmount, undefined);
  }
  const writes = calls;
  assert.deepEqual(await syncMailbox(user), { logged: 0, reviewed: 0, matched: 0, more: false, receiptsChecked:0,receiptsLinked:0 });
  assert.equal(calls, writes, "Resolved parser attempts are not repeated each sync");
});
