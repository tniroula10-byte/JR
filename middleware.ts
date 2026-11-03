/**
 * Route Guard #1: Next.js Edge Middleware (`middleware.ts`)
 * Architecture Rule 5: Admin and staff routes are guarded three times:
 * 1. middleware.ts
 * 2. Server-side role check in the layout
 * 3. PostgreSQL RLS / Data Repository
 *
 * Live mode trusts only the Supabase Auth session; role and status are read from `profiles`.
 * Demo persona cookies are honoured only when `isDemoAuthAllowed()` (never in a live deployment).
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasLiveSupabaseKeys, isDemoAuthAllowed } from '@/lib/supabase/env';

type GuardIdentity = { role: 'boss' | 'employee' | 'customer'; status: string };

const DEMO_SESSION_COOKIE = 'jr_mock_user_id';

const DEMO_ROLE_MAP: Record<string, GuardIdentity> = {
  'boss-1': { role: 'boss', status: 'active' },
  'cust-suspended': { role: 'customer', status: 'suspended' }
};

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/offline') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    // API routes authenticate and authorize every request themselves
    pathname.startsWith('/api/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  );
}

function redirectTo(request: NextRequest, target: string, carryCookiesFrom?: NextResponse) {
  const res = NextResponse.redirect(new URL(target, request.url));
  carryCookiesFrom?.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

function applyRoleGuard(
  request: NextRequest,
  identity: GuardIdentity | null,
  passThrough: NextResponse
): NextResponse {
  const { pathname } = request.nextUrl;

  if (!identity) {
    return redirectTo(request, '/login', passThrough);
  }
  if (identity.status === 'suspended') {
    return redirectTo(request, '/login?error=account_suspended', passThrough);
  }
  if (identity.status !== 'active') {
    return redirectTo(request, '/login', passThrough);
  }
  if (pathname.startsWith('/boss') && identity.role !== 'boss') {
    const fallback = identity.role === 'employee' ? '/employee/dashboard' : '/home';
    return redirectTo(request, fallback, passThrough);
  }
  if (pathname.startsWith('/employee') && identity.role !== 'employee' && identity.role !== 'boss') {
    return redirectTo(request, '/home', passThrough);
  }
  return passThrough;
}

async function liveGuard(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // getUser() validates the JWT with Supabase Auth; never trust getSession() for authorization
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (isPublicPath(request.nextUrl.pathname)) {
    return response;
  }
  if (!user) {
    return applyRoleGuard(request, null, response);
  }

  // RLS only returns the caller's own row while they are active
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  return applyRoleGuard(request, (profile as GuardIdentity | null) ?? null, response);
}

function demoGuard(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isDemoAuthAllowed()) {
    // No Supabase keys in a production deployment: fail closed
    return redirectTo(request, '/login?error=not_configured');
  }

  // Demo-only persona switch via ?as=<userId> for local testing & Playwright contexts
  const asParam = request.nextUrl.searchParams.get('as');
  if (asParam) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('as');
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set(DEMO_SESSION_COOKIE, asParam, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    });
    return res;
  }

  const demoUserId = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  if (!demoUserId || demoUserId === 'anon' || demoUserId === 'none') {
    return redirectTo(request, '/login');
  }

  const identity: GuardIdentity =
    DEMO_ROLE_MAP[demoUserId] ??
    (demoUserId.startsWith('emp-')
      ? { role: 'employee', status: 'active' }
      : { role: 'customer', status: 'active' });

  return applyRoleGuard(request, identity, NextResponse.next());
}

export async function middleware(request: NextRequest) {
  if (hasLiveSupabaseKeys()) {
    return liveGuard(request);
  }
  return demoGuard(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
