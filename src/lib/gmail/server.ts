import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export class GmailError extends Error {
  constructor(message: string, public status = 400,public code?:'gmail_reconnect_required'|'gmail_server_setup'|'google_temporary_failure'|'google_rate_limited',public retryAfterSeconds?:number) { super(message); }
}
/** HTTP status only; never retain Google's response body or request token. */
export class GoogleRequestError extends GmailError {
  constructor(public upstreamStatus:number,rateLimited=false,retryAfterSeconds?:number) { super(rateLimited?'Google temporarily limited Gmail requests. Your saved progress is safe; retry later.':'Google could not complete the request. Try again later.',rateLimited?503:502,rateLimited?'google_rate_limited':'google_temporary_failure',retryAfterSeconds); }
}
export function configured(): boolean {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_TOKEN_KEY", "APP_ORIGIN", "CRON_SECRET"].every(k => !!process.env[k])
    && /^[a-f0-9]{64}$/i.test(process.env.GMAIL_TOKEN_KEY ?? "");
}
export function requireConfig() {
  if (!configured()) throw new GmailError("Gmail setup is not finished on the server.", 503,'gmail_server_setup');
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
  const response=json({ error: error instanceof GmailError ? error.message : "Gmail sync could not finish. Try again; saved entries will not be duplicated.",...(error instanceof GmailError?{code:error.code,retryAfterSeconds:error.retryAfterSeconds}:{}) }, error instanceof GmailError ? error.status : 500);
  if(error instanceof GmailError&&error.retryAfterSeconds)response.headers.set('Retry-After',String(error.retryAfterSeconds));return response;
}
export async function google<T>(url: string, init: RequestInit): Promise<T> {
  let response:Response;
  try{response=await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) });}
  catch{throw new GoogleRequestError(0);}
  if (!response.ok) {
    // Inspect only whitelisted error codes. Never retain/return descriptions,
    // message bodies, credentials or raw upstream exceptions.
    let payload:any;try{payload=await response.json();}catch{payload=null;}
    const tokenEndpoint=new URL(url).origin==='https://oauth2.googleapis.com'&&new URL(url).pathname==='/token';
    const code=typeof payload?.error==='string'?payload.error:undefined;
    const reasons:unknown[]=Array.isArray(payload?.error?.errors)?payload.error.errors.map((e:any)=>e?.reason):[];
    if((tokenEndpoint&&code==='invalid_grant')||(!tokenEndpoint&&(response.status===401||reasons.includes('insufficientPermissions'))))
      throw new GmailError('Reconnect Gmail: Google authorization expired, was revoked or needs read-only permission. Saved scan progress is preserved.',401,'gmail_reconnect_required');
    if((tokenEndpoint&&['invalid_client','unauthorized_client','invalid_scope','invalid_request'].includes(code??''))||reasons.includes('accessNotConfigured'))
      throw new GmailError('Gmail server setup needs attention. Check the Google OAuth app configuration; reconnecting alone will not fix it.',503,'gmail_server_setup');
    if(response.status===429||reasons.some(r=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(String(r)))){
      const raw=response.headers.get('retry-after'),parsed=raw&&/^\d+$/.test(raw)?Number(raw):raw?Math.ceil((Date.parse(raw)-Date.now())/1000):30;
      const seconds=Number.isFinite(parsed)&&parsed>0?Math.ceil(parsed):30;
      throw new GoogleRequestError(response.status,true,Math.max(5,Math.min(86400,seconds)));
    }
    throw new GoogleRequestError(response.status);
  }
  try{return await response.json() as T;}catch{throw new GoogleRequestError(502);}
}
export function tokenRequest(parameters: Record<string, string>) {
  return google<{ access_token: string; refresh_token?: string; scope?: string }>("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...parameters }),
  });
}
