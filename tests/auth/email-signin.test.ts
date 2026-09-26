import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const nextServerHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "next/server" ? pathToFileURL(require.resolve("next/server.js")).href : specifier, context);
  },
});
const { NextRequest } = await import("next/server.js");
const { GET } = await import("../../src/app/auth/callback/route");
const { middleware } = await import("../../src/middleware");
const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const verifierCookie = `sb-email-test-auth-token-code-verifier=base64-${Buffer.from(JSON.stringify("test-verifier")).toString("base64url")}`;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://email-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request in auth test");
  });
});
afterEach(() => {
  mock.restoreAll();
  if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
  if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
});
after(() => nextServerHook.deregister());

test("missing or rejected email links return to login without caching credentials", async () => {
  for (const query of ["", "?error=access_denied&error_code=otp_expired"]) {
    const response = await GET(new NextRequest(`https://budget.example/auth/callback${query}`));
    assert.equal(response.headers.get("location"), "https://budget.example/login?error=sign-in-link");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.cookies.getAll().length, 0);
  }
});

test("a successful code exchange sets session cookies and only redirects home", async () => {
  mock.restoreAll();
  const payload = Buffer.from(JSON.stringify({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const requests: unknown[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/auth\/v1\/token\?grant_type=pkce$/);
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      access_token: `header.${payload}.signature`,
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-1", email: "existing@example.com" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const request = new NextRequest("https://budget.example/auth/callback?code=one-time-code&next=https://untrusted.example", {
    headers: { cookie: verifierCookie },
  });
  const response = await GET(request);
  assert.equal(response.headers.get("location"), "https://budget.example/");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], { auth_code: "one-time-code", code_verifier: "test-verifier" });
  assert.ok(response.cookies.getAll().some(cookie => cookie.name.startsWith("sb-email-test-auth-token") && cookie.value));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("invalid codes cannot create a session", async () => {
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ error: "invalid_grant", error_description: "expired" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  ));
  const response = await GET(new NextRequest("https://budget.example/auth/callback?code=expired", {
    headers: { cookie: verifierCookie },
  }));
  assert.equal(response.headers.get("location"), "https://budget.example/login?error=sign-in-link");
  assert.ok(!response.cookies.getAll().some(cookie => cookie.name === "sb-email-test-auth-token" && cookie.value));
});

test("callback is reachable before login and root redirects retain only the code", async () => {
  const callback = await middleware(new NextRequest("https://budget.example/auth/callback?code=example"));
  assert.equal(callback.headers.get("x-middleware-next"), "1");
  for (const path of ["/", "/login"]) {
    const response = await middleware(new NextRequest(`https://budget.example${path}?code=example&next=https://untrusted.example`));
    assert.equal(response.headers.get("location"), "https://budget.example/auth/callback?code=example");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("private pages remain protected and only the exact login path is public", async () => {
  for (const path of ["/", "/money", "/login/anything"]) {
    const response = await middleware(new NextRequest(`https://budget.example${path}`));
    assert.equal(response.headers.get("location"), "https://budget.example/login");
  }
  const login = await middleware(new NextRequest("https://budget.example/login"));
  assert.equal(login.headers.get("x-middleware-next"), "1");
});
