import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "next/server" ? pathToFileURL(require.resolve("next/server.js")).href : specifier, context);
} });
const { NextRequest } = await import("next/server.js");
const { seal, unseal, checkOrigin, safeEqual } = await import("../../src/lib/gmail/server");
const { GET: cron } = await import("../../src/app/api/cron/gmail/route");
const { GET: status } = await import("../../src/app/api/gmail/route");
const old = { key: process.env.GMAIL_TOKEN_KEY, origin: process.env.APP_ORIGIN, secret: process.env.CRON_SECRET };
after(() => {
  hook.deregister();
  for (const [key, value] of [["GMAIL_TOKEN_KEY", old.key], ["APP_ORIGIN", old.origin], ["CRON_SECRET", old.secret]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});
test("encrypted tokens reject tampering and a different user's context", () => {
  process.env.GMAIL_TOKEN_KEY = "ab".repeat(32);
  const encrypted = seal("private-token", "user-one");
  assert.ok(!encrypted.includes("private-token"));
  assert.equal(unseal(encrypted, "user-one"), "private-token");
  assert.throws(() => unseal(encrypted, "user-two"));
  const tampered = Buffer.from(encrypted, "base64url"); tampered[30] = tampered[30]! ^ 1;
  assert.throws(() => unseal(tampered.toString("base64url"), "user-one"));
});
test("mutations reject cross-site requests and cron rejects absent/wrong secrets", async () => {
  process.env.APP_ORIGIN = "https://budget.example"; process.env.CRON_SECRET = "cron-private";
  assert.throws(() => checkOrigin(new NextRequest("https://budget.example/api/gmail", { headers: { origin: "https://evil.example" } })));
  checkOrigin(new NextRequest("https://budget.example/api/gmail", { headers: { origin: "https://budget.example" } }));
  for (const token of ["", "Bearer wrong"]) assert.equal((await cron(new NextRequest("https://budget.example/api/cron/gmail", { headers: { authorization: token } }))).status, 401);
  assert.equal(safeEqual("", ""), false); assert.equal(safeEqual("é", "a"), false);
});
test("a signed-out browser cannot inspect the Gmail connection", async () => {
  const response = await status(new NextRequest("https://budget.example/api/gmail"));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
