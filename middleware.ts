/**
 * Route Guard #1: Next.js Edge Middleware (`middleware.ts`)
 * Architecture Rule 5: Admin and staff routes are guarded three times:
 * 1. middleware.ts
 * 2. Server-side role check in the layout
 * 3. PostgreSQL RLS / Data Repository
 */
import { NextResponse, type NextRequest } from 'next/server';

const MOCK_ROLE_MAP: Record<string, { role: 'boss' | 'employee' | 'customer'; status: 'active' | 'suspended' }> = {
  'boss-1': { role: 'boss', status: 'active' },
  'emp-1': { role: 'employee', status: 'active' },
  'emp-2': { role: 'employee', status: 'active' },
  'emp-3': { role: 'employee', status: 'active' },
  'emp-4': { role: 'employee', status: 'active' },
  'cust-1': { role: 'customer', status: 'active' },
  'cust-2': { role: 'customer', status: 'active' },
  'cust-3': { role: 'customer', status: 'active' },
  'cust-suspended': { role: 'customer', status: 'suspended' }
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public/auth/static/manifest/sw routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/offline') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/session') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Allow quick persona switch via ?as=<userId> for testing & Playwright contexts
  const asParam = request.nextUrl.searchParams.get('as');
  if (asParam) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('as');
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set('jr_mock_user_id', asParam, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax'
    });
    return res;
  }

  const mockUserId = request.cookies.get('jr_mock_user_id')?.value ?? 'cust-1';

  if (mockUserId === 'anon' || mockUserId === 'none') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const known = MOCK_ROLE_MAP[mockUserId] ?? (
    mockUserId.startsWith('emp-')
      ? { role: 'employee' as const, status: 'active' as const }
      : mockUserId.startsWith('cust-')
        ? { role: 'customer' as const, status: 'active' as const }
        : { role: 'customer' as const, status: 'active' as const }
  );

  // Immediately bounce suspended accounts
  if (known.status === 'suspended') {
    return NextResponse.redirect(new URL('/login?error=account_suspended', request.url));
  }

  // Guard /boss/* routes
  if (pathname.startsWith('/boss') && known.role !== 'boss') {
    const fallback = known.role === 'employee' ? '/employee/dashboard' : '/home';
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  // Guard /employee/* routes
  if (pathname.startsWith('/employee') && known.role !== 'employee' && known.role !== 'boss') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
