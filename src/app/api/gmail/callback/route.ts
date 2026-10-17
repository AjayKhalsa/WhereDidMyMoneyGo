import { NextResponse, type NextRequest } from "next/server";
import { admin, google, origin, requireConfig, safeEqual, seal, tokenRequest, unseal, userFor } from "@/lib/gmail/server";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    requireConfig();
    response = NextResponse.redirect(`${origin()}/settings?gmail=connected`);
    const user = await userFor(request, response);
    const saved = JSON.parse(unseal(request.cookies.get("gmail_oauth")?.value ?? "", "oauth"));
    if (saved.userId !== user.id || saved.expires < Date.now() || !safeEqual(saved.state, request.nextUrl.searchParams.get("state") ?? "")) throw new Error("Invalid state");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error")) throw new Error("Denied");
    const tokens = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: saved.verifier, redirect_uri: `${origin()}/api/gmail/callback` });
    if (!tokens.refresh_token || !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/gmail.readonly")) throw new Error("Missing permission");
    const profile = await google<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (profile.emailAddress.toLowerCase() !== user.email?.toLowerCase()) throw new Error("Use your app email");
    const result = await admin().from("gmail_connections").upsert({ user_id: user.id, email: profile.emailAddress, refresh_token: seal(tokens.refresh_token, user.id), start_date: saved.startDate, page_token: null, scan_after: null, scan_started_at: null, last_synced_at: null, last_error: null });
    if (result.error) throw result.error;
  } catch {
    response = NextResponse.redirect(new URL("/settings?gmail=failed", process.env.APP_ORIGIN || request.url));
  }
  response.cookies.set("gmail_oauth", "", { path: "/api/gmail", maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
