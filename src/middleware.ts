import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The auth gate.
 *
 * Only active when Supabase is configured — a deployment running purely on
 * local IndexedDB (no `NEXT_PUBLIC_SUPABASE_URL`) has no session to check and
 * stays fully open, matching the original "no auth" V1 design. Once Supabase
 * is configured, this is what actually protects the data: the app's own
 * screens don't check auth themselves, they just assume a session exists.
 *
 * No `/signup` route exists anywhere in the app — the one user is created by
 * hand in the Supabase dashboard (Authentication -> Users -> Add user).
 */
export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  // A callback must reach the exchange before a session exists. Some Supabase
  // projects use the site's root as their allowed email redirect URL.
  const pathname = request.nextUrl.pathname;
  if (pathname === "/auth/callback") return NextResponse.next();
  if ((pathname === "/" || pathname === "/login") && request.nextUrl.searchParams.has("code")) {
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("code", request.nextUrl.searchParams.get("code")!);
    const redirect = NextResponse.redirect(callback);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Referrer-Policy", "no-referrer");
    return redirect;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = pathname === "/login";

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|swe-worker-.*\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
