import type { NextRequest } from "next/server";
import { checkOrigin, failure, json, userFor } from "@/lib/gmail/server";
import { syncMailbox } from "@/lib/gmail/sync";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const session = json({}); const user = await userFor(request, session);
    const response = json(await syncMailbox(user.id));
    for (const cookie of session.cookies.getAll()) response.cookies.set(cookie);
    return response;
  } catch (e) { return failure(e); }
}
