'use client';

/**
 * Responsive Role App Shell (`components/shared/app-shell.tsx`)
 * Section 10: Midnight navy and near-black surfaces, violet accents with soft glow,
 * mobile bottom tab bar (< 768px) and desktop sidebar (>= 768px), plus PWA service worker registration
 * and Mock Mode Persona Switcher.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  Gamepad2,
  Home,
  Inbox,
  Layers,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Package,
  Settings,
  Shield,
  Sparkles,
  Ticket as TicketIcon,
  UserCheck,
  UserPlus,
  Users,
  User
} from 'lucide-react';
import { signOutAction } from '@/actions';
import { Badge, BrandLogo, Button } from '@/components/ui/primitives';
import type { Profile } from '@/lib/data/types';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
}

const CUSTOMER_NAV: NavItem[] = [
  { href: '/home', label: 'Home', shortLabel: 'Home', icon: Home },
  { href: '/topups', label: 'Games & Top-ups', shortLabel: 'Games', icon: Gamepad2 },
  { href: '/chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { href: '/tickets', label: 'Raise ticket (Boka)', shortLabel: 'Raise ticket', icon: TicketIcon },
  { href: '/profile', label: 'My profile', shortLabel: 'My profile', icon: User }
];

const EMPLOYEE_NAV: NavItem[] = [
  { href: '/employee/dashboard', label: 'My Dashboard', shortLabel: 'Desk', icon: Home },
  { href: '/employee/inbox', label: 'Customer Inbox', shortLabel: 'Inbox', icon: Inbox },
  { href: '/employee/topups', label: 'Game Top-ups', shortLabel: 'Top-ups', icon: Gamepad2 },
  { href: '/employee/tickets', label: 'Support Tickets', shortLabel: 'Tickets', icon: TicketIcon },
  { href: '/employee/boss-chat', label: 'JR Family', shortLabel: 'JR Family', icon: Users },
  { href: '/employee/performance', label: 'My Performance', shortLabel: 'Metrics', icon: Activity },
  { href: '/employee/invite-customer', label: 'Invite Customer', shortLabel: 'Invite', icon: UserPlus }
];

const BOSS_NAV: NavItem[] = [
  { href: '/boss/dashboard', label: 'Master Dashboard', shortLabel: 'Master', icon: Shield },
  { href: '/boss/inbox', label: 'Shared Inbox (Real IDs)', shortLabel: 'Inbox', icon: Inbox },
  { href: '/boss/topups', label: 'Game Top-ups', shortLabel: 'Top-ups', icon: Gamepad2 },
  { href: '/boss/tickets', label: 'All Tickets & Assign', shortLabel: 'Tickets', icon: TicketIcon },
  { href: '/boss/analytics', label: 'Staff Analytics & CSV', shortLabel: 'Analytics', icon: FileSpreadsheet },
  { href: '/boss/customers', label: 'Customers & Invites', shortLabel: 'Customers', icon: Users },
  { href: '/boss/employees', label: 'Employee Management', shortLabel: 'Staff', icon: UserCheck },
  { href: '/boss/threads', label: 'JR Family', shortLabel: 'JR Family', icon: Briefcase },
  { href: '/boss/products', label: 'Products Catalog', shortLabel: 'Products', icon: Package },
  { href: '/boss/stories', label: '24h Stories Manager', shortLabel: 'Stories', icon: Sparkles },
  { href: '/boss/announcements', label: 'Announcements Hub', shortLabel: 'Announce', icon: Megaphone },
  { href: '/boss/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
  { href: '/boss/audit', label: 'Immutable Audit Log', shortLabel: 'Audit', icon: BookOpen }
];

export function AppShell({
  profile,
  unreadNotificationsCount = 0,
  children
}: {
  profile: Profile;
  unreadNotificationsCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems =
    profile.role === 'boss'
      ? BOSS_NAV
      : profile.role === 'employee'
        ? EMPLOYEE_NAV
        : CUSTOMER_NAV;

  const mobilePrimaryTabs = navItems.slice(0, 5);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false));
    }
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutAction();
      router.push('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-midnight-950 text-slate-50">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-midnight-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={
                profile.role === 'boss'
                  ? '/boss/dashboard'
                  : profile.role === 'employee'
                    ? '/employee/dashboard'
                    : '/home'
              }
              className="flex items-center gap-2.5 rounded-xl focus:outline-none"
            >
              <BrandLogo size="md" />
            </Link>

            <Badge
              tone={
                profile.role === 'boss'
                  ? 'amber'
                  : profile.role === 'employee'
                    ? 'cyan'
                    : 'violet'
              }
              className="uppercase tracking-wider text-[10px]"
            >
              {profile.role}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {swReady ? (
              <span
                title="PWA Service Worker Active (Static Shell Only)"
                className="hidden lg:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[11px] text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                PWA Ready
              </span>
            ) : null}

            <Link
              href="/notifications"
              aria-label={`Notifications (${unreadNotificationsCount} unread)`}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-midnight-800 text-slate-200 hover:border-violet-500/40 hover:text-white"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadNotificationsCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                  {unreadNotificationsCount}
                </span>
              ) : null}
            </Link>

            <Button
              variant="secondary"
              size="sm"
              className="px-2.5"
              disabled={signingOut}
              onClick={handleSignOut}
              aria-label="Sign Out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline text-[11px]">Sign Out</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="md:hidden px-2.5"
              aria-label="Toggle All Role Screens Menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span className="text-[11px]">Menu</span>
            </Button>
          </div>
        </div>

        {/* Mobile Expandable Full Drawer for Secondary Routes */}
        {mobileMenuOpen ? (
          <nav
            aria-label="Mobile Secondary Navigation"
            className="border-t border-slate-800 bg-midnight-900 px-4 py-3 md:hidden"
          >
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                      active
                        ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        ) : null}
      </header>

      {/* Main Workspace with Desktop Sidebar */}
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Primary Sidebar Navigation"
          className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-800/80 md:bg-midnight-900/40 md:p-4"
        >
          <div className="mb-4 rounded-xl border border-slate-800/90 bg-midnight-800/70 p-3">
            <p className="text-xs font-semibold text-slate-100 truncate">{profile.fullName}</p>
            <p className="text-[11px] text-slate-400 truncate">{profile.email}</p>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-violet-600/20 text-white border border-violet-500/40 shadow-violet-subtle'
                      : 'text-slate-300 hover:bg-midnight-800 hover:text-white'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive ? 'text-violet-300' : 'text-slate-400'
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-slate-800/80 pt-4">
            <button
              type="button"
              disabled={signingOut}
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-midnight-800 px-3 py-2 text-xs font-medium text-slate-300 hover:border-violet-500/40 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
          </div>
        </aside>

        {/* Page Content */}
        <main className="flex-1 min-w-0 px-3 py-5 pb-24 sm:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile Bottom Tab Bar (< 768px) */}
      <nav
        aria-label="Mobile Bottom Tab Bar"
        className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t border-slate-800/90 bg-midnight-950/95 px-1 backdrop-blur-lg md:hidden"
      >
        {mobilePrimaryTabs.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-violet-300' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
