import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const hook = registerHooks({ resolve(s, c, n) { return n(s === "next/server" ? pathToFileURL(require.resolve("next/server.js")).href : s, c); } });
const { syncStatementEvidence } = await import("@/lib/gmail/statement-sync");
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; hook.deregister(); });
const user = "11111111-1111-4111-8111-111111111111", clock = Date.parse("2026-11-19T10:00:00Z");
const db = createClient("https://database.example", "synthetic", { auth: { persistSession: false, autoRefreshToken: false } });
function fixture() {
  let state: any = {}, fail = "", lost = false, failAck = false, listStatus = 200;
  const saved = new Map<string, unknown>(), fetched: string[] = [], queries: string[] = [];
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), method = init?.method ?? "GET";
    if (url.hostname === "gmail.googleapis.com") {
      if (url.pathname.endsWith("/messages")) {
        queries.push(url.search); if (listStatus !== 200) return json({}, listStatus);
        return json(url.searchParams.has("pageToken") ? { messages: [{ id: "older" }] } : { messages: [{ id: "bill" }, { id: "spoof" }], nextPageToken: "next" });
      }
      const id = url.pathname.split("/").at(-1)!; fetched.push(id); if (id === fail) return json({}, 503);
      return json({ internalDate: String(clock), payload: { mimeType: "text/plain", headers: [
        { name: "From", value: "statements@hdfcbank.net" }, { name: "Subject", value: "Your card statement" },
        { name: "Authentication-Results", value: `mx.google.com; dmarc=${id === "spoof" ? "fail" : "pass"} header.from=hdfcbank.net` },
      ], body: { data: Buffer.from("Total amount due INR 100.00").toString("base64url") } } });
    }
    assert.equal(url.hostname, "database.example");
    if (url.pathname.endsWith("/gmail_connections")) {
      assert.equal(method, "PATCH"); assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
      assert.equal(url.searchParams.get("lease_id"), "eq.lease"); assert.ok(url.searchParams.get("lease_until")?.startsWith("gt."));
      if (lost) return json(null);
      const next = JSON.parse(String(init?.body)).statement_scan;
      if (failAck && state.pending?.length > next.pending?.length) { failAck = false; return json({}, 503); }
      state = next; return json({ user_id: user });
    }
    assert.ok(url.pathname.endsWith("/financial_mail_evidence"), "Statement scanning must never write a transaction or bill amount");
    if (method === "GET") {
      assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
      return json(saved.has(url.searchParams.get("message_id")!.slice(3)) ? { message_id: "saved" } : null);
    }
    assert.equal(method, "POST"); const row = JSON.parse(String(init?.body)); assert.equal(row.user_id, user);
    assert.ok(new Headers(init?.headers).get("prefer")?.includes("ignore-duplicates")); saved.set(row.message_id, row); return json(null);
  };
  return { saved, fetched, queries, get state() { return state; }, set state(v) { state = v; },
    fail(id: string) { fail = id; }, loseLease() { lost = true; }, failAck() { failAck = true; }, listStatus(s: number) { listStatus = s; },
    run() { return syncStatementEvidence({ db, userId: user, lease: "lease", accessToken: "synthetic", state, startDate: "2026-09-01", deadline: clock + 45000, now: () => clock }); } };
}
test("statement discovery captures authenticated evidence across pages without any ledger writes", async () => {
  const f = fixture(); assert.deepEqual(await f.run(), { checked: 2, more: true }); assert.equal(f.state.token, "next");
  assert.deepEqual(await f.run(), { checked: 1, more: false }); assert.deepEqual([...f.saved.keys()], ["bill", "older"]);
  assert.ok(f.state.completedAt); assert.equal(f.saved.has("spoof"), false);
});
test("failed reads retain pending IDs; replay after acknowledgement failure is idempotent", async () => {
  const f = fixture(); f.fail("spoof"); await assert.rejects(f.run()); assert.deepEqual(f.state.pending, ["spoof"]);
  f.fail(""); await f.run(); assert.equal(f.queries.length, 1); assert.equal(f.saved.size, 1);
  const g = fixture(); g.failAck(); await assert.rejects(g.run()); assert.deepEqual(g.state.pending, ["bill", "spoof"]);
  await g.run(); assert.equal(g.saved.size, 1); assert.equal(g.fetched.filter(x => x === "bill").length, 1);
});
test("lost leases and quota failures cannot advance a statement scan", async () => {
  const f = fixture(); f.loseLease(); await assert.rejects(f.run(), /paused safely/); assert.equal(f.queries.length, 0);
  for (const status of [403, 429, 503]) { const g = fixture(); g.state = { after: 10, before: 20, token: "old" }; g.listStatus(status);
    await assert.rejects(g.run()); assert.equal(g.state.token, "old"); assert.equal(g.queries.length, 1); }
});
