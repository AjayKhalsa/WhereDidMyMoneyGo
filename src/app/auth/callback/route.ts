import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Exchanges the one-time email code for the existing user's session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const destination = new URL("/", request.url);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  function failed() {
    const failure = NextResponse.redirect(new URL("/login?error=sign-in-link", request.url));
    // Preserve cookie deletions from an unsuccessful exchange, too.
    for (const cookie of response.cookies.getAll()) failure.cookies.set(cookie);
    failure.headers.set("Cache-Control", "private, no-store");
    failure.headers.set("Referrer-Policy", "no-referrer");
    return failure;
  }

  if (!code || !url || !key) return failed();

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed();
    return response;
  } catch {
    return failed();
  }
}
