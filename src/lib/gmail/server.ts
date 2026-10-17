import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export class GmailError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function configured(): boolean {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_TOKEN_KEY", "APP_ORIGIN", "CRON_SECRET"].every(k => !!process.env[k])
    && /^[a-f0-9]{64}$/i.test(process.env.GMAIL_TOKEN_KEY ?? "");
}
export function requireConfig() {
  if (!configured()) throw new GmailError("Gmail setup is not finished on the server.", 503);
}
export function admin() {
  requireConfig();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
export function seal(value: string, context: string): string {
  const key = Buffer.from(process.env.GMAIL_TOKEN_KEY ?? "", "hex");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal(value: string, context: string): string {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(process.env.GMAIL_TOKEN_KEY ?? "", "hex"), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
export function origin(): string {
  const url = new URL(process.env.APP_ORIGIN!);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new GmailError("Invalid app origin", 503);
  return url.origin;
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
export async function userFor(request: NextRequest, response = json({})) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new GmailError("Sign in to your cloud account first.", 401);
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: cookies => cookies.forEach(c => response.cookies.set(c.name, c.value, c.options)),
  } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new GmailError("Please sign in again.", 401);
  return data.user;
}
export function checkOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== origin()) throw new GmailError("Request origin rejected.", 403);
}
export function failure(error: unknown) {
  // Do not log or return upstream payloads: they can contain credentials or mail.
  return json({ error: error instanceof GmailError ? error.message : "Gmail sync could not finish. Try again; saved entries will not be duplicated." }, error instanceof GmailError ? error.status : 500);
}
export async function google<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 400 && url.includes("/token")) throw new GmailError("Reconnect Gmail: Google authorization expired or was revoked.", 401);
    throw new GmailError("Google could not complete the request. Try again later.", 502);
  }
  return response.json() as Promise<T>;
}
export function tokenRequest(parameters: Record<string, string>) {
  return google<{ access_token: string; refresh_token?: string; scope?: string }>("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...parameters }),
  });
}
