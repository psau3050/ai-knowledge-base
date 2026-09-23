import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from './lib/env';

const PUBLIC_PATHS = ['/login'];

/**
 * Refreshes the Supabase session cookie on every navigation and keeps signed-out users on /login.
 * This is a UX gate only: the API verifies the token and RLS enforces access on every request.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    },
  });

  // Must run before deciding anything: it is what refreshes an expired access token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!signedIn && !isPublic) return redirect(request, response, '/login');
  if (signedIn && isPublic) return redirect(request, response, '/documents');
  return response;
}

/** Redirects while keeping any refreshed session cookies. */
function redirect(request: NextRequest, withCookies: NextResponse, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  for (const cookie of withCookies.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
