import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Coins,
  Megaphone,
  MessageSquare,
  Package,
  ShieldCheck,
  Sparkles,
  Ticket as TicketIcon
} from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatPaiseToINR, formatPointsQty } from '@/lib/money';
import { formatIST } from '@/lib/time';

export default async function CustomerHomePage() {
  const { profile, caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();

  const [stories, announcements, products, offers, tickets, conv] = await Promise.all([
    repo.listStories(caller),
    repo.listCustomerAnnouncements(caller),
    repo.listProducts(caller),
    repo.listOffers(caller),
    repo.listTickets(caller),
    repo.getCustomerConversation(caller)
  ]);

  const pinnedAnnouncement = announcements.find((a) => a.pinned) ?? announcements[0];
  const activeOffers = offers.filter((o) => o.status === 'pending' || o.status === 'countered');
  const openTickets = tickets.filter((t) => t.status !== 'closed');

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-violet-950/70 via-midnight-800 to-midnight-950 border-violet-500/35">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="violet">VIP MEMBER</Badge>
              <span className="text-xs text-slate-400">Invitation-Only Trading Desk</span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-white">
              Welcome back, {profile.fullName}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-xl">
              Browse verified game-point allocations, submit exact rupee offers, and negotiate directly with{' '}
              <span className="font-semibold text-violet-300">John Rambo Support</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/products"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs sm:text-sm font-semibold text-white shadow-violet-glow hover:bg-violet-500"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              <span>Browse Points Catalog</span>
            </Link>
            <Link
              href="/chat"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-500/40 bg-midnight-900/90 px-4 text-xs sm:text-sm font-medium text-violet-200 hover:bg-violet-500/15"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Support Chat</span>
              {conv && conv.customerUnreadCount > 0 ? (
                <span className="ml-1 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {conv.customerUnreadCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </Card>

      {/* Live 24h Stories Strip */}
      {stories.length > 0 ? (
        <section aria-labelledby="stories-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 id="stories-heading" className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" aria-hidden="true" />
              <span>Live 24-Hour Vault Stories ({stories.length})</span>
            </h2>
            <Link href="/stories" className="text-xs font-medium text-violet-300 hover:underline">
              Open Fullscreen Viewer →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stories.map((st) => (
              <Link
                key={st.id}
                href={`/stories?storyId=${st.id}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-violet-500/35 bg-midnight-800/90 p-3.5 transition hover:border-violet-400"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-fuchsia-500 p-0.5 shadow-violet-glow">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-midnight-950 text-xs font-bold text-violet-200">
                    JR
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={st.viewedByCaller ? 'slate' : 'violet'}>
                      {st.viewedByCaller ? 'Viewed' : 'New Drop'}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      Expires {formatIST(st.expiresAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs sm:text-sm font-medium text-slate-100 group-hover:text-white">
                    {st.caption}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Pinned Announcement */}
      {pinnedAnnouncement ? (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Megaphone className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="amber">PINNED ANNOUNCEMENT</Badge>
                  <span className="text-[11px] text-slate-400">
                    {formatIST(pinnedAnnouncement.publishedAt)}
                  </span>
                </div>
                <h2 className="mt-1 text-sm font-bold text-white">{pinnedAnnouncement.title}</h2>
                <p className="mt-1 text-xs text-slate-300">{pinnedAnnouncement.body}</p>
              </div>
            </div>
            <Link
              href="/announcements"
              className="shrink-0 text-xs font-medium text-amber-300 hover:underline"
            >
              All →
            </Link>
          </div>
        </Card>
      ) : null}

      {/* Quick Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Active Price Offers</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{activeOffers.length}</p>
            <Link href="/offers" className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
              <span>View negotiations</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
            <Coins className="h-5 w-5" aria-hidden="true" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Open Support Tickets</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{openTickets.length}</p>
            <Link href="/tickets" className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
              <span>Track or raise ticket</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
            <TicketIcon className="h-5 w-5" aria-hidden="true" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">John Rambo Support</p>
            <p className="mt-1 text-base font-bold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Direct Line Active</span>
            </p>
            <Link href="/chat" className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
              <span>Open private chat</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </div>
        </Card>
      </div>

      {/* Featured Catalog */}
      <section aria-labelledby="featured-catalog-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="featured-catalog-heading" className="text-base font-bold text-white">
            Available Game-Point Allocations
          </h2>
          <Link href="/products" className="text-xs font-semibold text-violet-300 hover:underline">
            View Full Catalog ({products.length}) →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.slice(0, 4).map((product) => (
            <Card key={product.id} className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="violet">{product.gameName}</Badge>
                  <Badge tone="emerald">{formatPointsQty(product.pointsQty)}</Badge>
                </div>
                <h3 className="text-base font-bold text-white">{product.title}</h3>
                <p className="text-xs text-slate-400 line-clamp-2">{product.description}</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
                <div>
                  <span className="text-[11px] text-slate-400 block">Listed Price</span>
                  <span className="font-mono text-lg font-extrabold text-white">
                    {formatPaiseToINR(product.pricePaise)}
                  </span>
                </div>
                <Link
                  href={`/products?offerProduct=${product.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-violet-glow hover:bg-violet-500"
                >
                  <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Make Offer in ₹</span>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
