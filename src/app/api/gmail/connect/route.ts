import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { checkOrigin, failure, GmailError, json, origin, requireConfig, seal, userFor } from "@/lib/gmail/server";
import { alertDate } from "@/lib/gmail/alerts";

export async function POST(request: NextRequest) {
  try {
    requireConfig(); checkOrigin(request);
    const sessionResponse = json({}); const user = await userFor(request, sessionResponse);
    const { startDate } = await request.json();
    if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || alertDate(startDate.split("-").reverse().join("/")) !== startDate || startDate > new Date().toISOString().slice(0, 10)) throw new GmailError("Choose a valid start date.");
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${origin()}/api/gmail/callback`, response_type: "code", scope: "https://www.googleapis.com/auth/gmail.readonly", access_type: "offline", prompt: "consent", state, login_hint: user.email ?? "", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const response = json({ url: url.toString() });
    for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
    response.cookies.set("gmail_oauth", seal(JSON.stringify({ state, verifier, userId: user.id, startDate, expires: Date.now() + 600000 }), "oauth"), { httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax", path: "/api/gmail", maxAge: 600 });
    return response;
  } catch (e) { return failure(e); }
}
