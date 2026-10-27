import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Coins,
  Inbox,
  Lock,
  Megaphone,
  Ticket as TicketIcon,
  UserPlus
} from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatPaiseToINR } from '@/lib/money';
import { formatDurationSeconds, formatIST } from '@/lib/time';

export default async function EmployeeDashboardPage() {
  const { profile, caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();

  const [
    settings,
    conversations,
    tickets,
    offers,
    staffAnnouncements,
    perfMetrics
  ] = await Promise.all([
    repo.getAppSettings(caller),
    repo.listConversations(caller),
    repo.listTickets(caller),
    repo.listOffers(caller),
    repo.listStaffAnnouncements(caller),
    repo.getEmployeePerformance(caller, { employeeId: profile.id })
  ]);

  const myPerf = perfMetrics[0];
  const awaitingChats = conversations.filter((c) => c.awaitingStaff);
  const myAssignedTickets = tickets.filter(
    (t) => t.assignedEmployeeId === profile.id && t.status !== 'closed'
  );
  const pendingOffers = offers.filter((o) => o.status === 'pending');
  const unackedAnnouncements = staffAnnouncements.filter(
    (a) => !a.acks.some((ack) => ack.employeeId === profile.id)
  );

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-cyan-950/50 via-midnight-800 to-midnight-950 border-cyan-500/35">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="cyan">STAFF DESK</Badge>
              <Badge tone="violet">
                Inbox Scope: {settings.employeeInboxScope.toUpperCase()}
              </Badge>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-white">
              {profile.fullName} — Specialist Desk
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              All customer replies are sent under the shared identity{' '}
              <strong className="text-violet-300">John Rambo Support</strong> while internal attribution is logged.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/employee/invite-customer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-violet-glow hover:bg-violet-500"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Invite Customer</span>
            </Link>
            <Link
              href="/employee/boss-chat"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-midnight-900 px-3.5 text-xs font-medium text-slate-200 hover:border-violet-500/40"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Boss Thread</span>
            </Link>
          </div>
        </div>
      </Card>

      {/* Unacknowledged Boss Directives Banner */}
      {unackedAnnouncements.length > 0 ? (
        <Card className="p-4 border-rose-500/40 bg-rose-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-rose-300 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase text-rose-200">
                Action Required: {unackedAnnouncements.length} Unacknowledged Staff Directive(s)
              </p>
              <p className="text-xs text-slate-200">{unackedAnnouncements[0]?.title}</p>
            </div>
          </div>
          <Link
            href="/employee/announcements"
            className="shrink-0 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Review & Acknowledge →
          </Link>
        </Card>
      ) : null}

      {/* Work Queue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Chats Awaiting Reply</span>
            <Inbox className="h-4 w-4 text-violet-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{awaitingChats.length}</p>
          <Link href="/employee/inbox" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Open Customer Inbox</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">My Assigned Tickets</span>
            <TicketIcon className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{myAssignedTickets.length}</p>
          <Link href="/employee/tickets" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Work Assigned Tickets</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Pending Price Offers</span>
            <Coins className="h-4 w-4 text-amber-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{pendingOffers.length}</p>
          <Link href="/employee/offers" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Negotiate Offers</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">My Chat Median Response</span>
            <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">
            {formatDurationSeconds(myPerf?.chatFirstResponseMedianSec)}
          </p>
          <Link href="/employee/performance" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Full Personal Metrics</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>
      </div>

      {/* Active Assigned Tickets & Pending Offers Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">My Assigned Support Tickets</h2>
            <Link href="/employee/tickets" className="text-xs text-violet-300 hover:underline">
              All Tickets →
            </Link>
          </div>
          {myAssignedTickets.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No open tickets assigned to you right now.</p>
          ) : (
            myAssignedTickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-midnight-950/70 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      TKT-{t.ticketNo}
                    </span>
                    <Badge tone="cyan" className="uppercase">
                      {t.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-white">{t.subject}</p>
                  <p className="text-[11px] text-slate-400">{t.customerName}</p>
                </div>
                <Link
                  href={`/employee/tickets?ticketId=${t.id}`}
                  className="text-xs font-medium text-violet-300 hover:underline"
                >
                  Open →
                </Link>
              </div>
            ))
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Recent Customer Offers</h2>
            <Link href="/employee/offers" className="text-xs text-violet-300 hover:underline">
              Negotiate →
            </Link>
          </div>
          {offers.slice(0, 4).map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-midnight-950/70 p-3"
            >
              <div>
                <p className="text-xs font-bold text-white">{o.productTitle}</p>
                <p className="text-[11px] text-slate-400">
                  {o.customerName} • Offered{' '}
                  <strong className="font-mono text-violet-300">
                    {formatPaiseToINR(o.offeredPricePaise)}
                  </strong>{' '}
                  • {formatIST(o.createdAt)}
                </p>
              </div>
              <Badge tone={o.status === 'pending' ? 'amber' : 'emerald'} className="uppercase">
                {o.status}
              </Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
