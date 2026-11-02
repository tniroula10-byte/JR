import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Coins,
  Inbox,
  Shield,
  Ticket as TicketIcon,
  Users
} from 'lucide-react';
import { PendingCustomersQueueClient } from '@/components/shared/pending-customers-queue';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatPaiseToINR } from '@/lib/money';
import { formatDurationSeconds } from '@/lib/time';

export default async function BossMasterDashboardPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();

  const [
    profiles,
    conversations,
    tickets,
    offers,
    perfMetrics,
    settings,
    auditLogs
  ] = await Promise.all([
    repo.listAllProfiles(caller),
    repo.listConversations(caller),
    repo.listTickets(caller),
    repo.listOffers(caller),
    repo.getEmployeePerformance(caller),
    repo.getAppSettings(caller),
    repo.listAuditLogs(caller)
  ]);

  const activeCustomers = profiles.filter((p) => p.role === 'customer' && p.status === 'active');
  const pendingCustomers = profiles.filter(
    (p) => p.role === 'customer' && p.status === 'pending_approval'
  );
  const activeEmployees = profiles.filter((p) => p.role === 'employee' && p.status === 'active');
  const staffLookup: Record<string, string> = {};
  for (const p of profiles) {
    if (p.role !== 'customer') staffLookup[p.id] = p.fullName;
  }
  const awaitingChats = conversations.filter((c) => c.awaitingStaff);
  const pendingOffers = offers.filter((o) => o.status === 'pending' || o.status === 'countered');

  const ticketsByStatus = {
    open: tickets.filter((t) => t.status === 'open').length,
    assigned: tickets.filter((t) => t.status === 'assigned').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    waiting_for_customer: tickets.filter((t) => t.status === 'waiting_for_customer').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    closed: tickets.filter((t) => t.status === 'closed').length
  };

  return (
    <div className="space-y-6">
      {/* Master Command Header */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-amber-950/40 via-midnight-800 to-midnight-950 border-amber-500/35">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber">SINGLETON BOSS COMMAND</Badge>
              <Badge tone="violet">Inbox Scope: {settings.employeeInboxScope.toUpperCase()}</Badge>
              <Badge tone="cyan">
                Customer Pick Employee: {settings.customerCanPickEmployee ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-white">
              Dashboard
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Full oversight of {activeCustomers.length} active customers, {activeEmployees.length} specialists, real-time attribution, negotiations, and append-only audit logs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/boss/inbox"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-violet-glow hover:bg-violet-500"
            >
              <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Shared Inbox (Real IDs)</span>
            </Link>
            <Link
              href="/boss/analytics"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-midnight-900 px-3.5 text-xs font-medium text-slate-200 hover:border-violet-500/40"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Staff Analytics & CSV</span>
            </Link>
          </div>
        </div>
      </Card>

      {/* Top Live Counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Accounts</span>
            <Users className="h-4 w-4 text-violet-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">
            {1 + activeEmployees.length + activeCustomers.length}
          </p>
          <p className="text-[11px] text-slate-400">
            1 Boss • {activeEmployees.length} Staff • {activeCustomers.length} Customers
          </p>
        </Card>

        <Card className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Chats Awaiting Staff</span>
            <Inbox className="h-4 w-4 text-rose-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{awaitingChats.length}</p>
          <Link href="/boss/inbox" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Inspect conversations</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Price Offers</span>
            <Coins className="h-4 w-4 text-amber-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{pendingOffers.length}</p>
          <p className="text-[11px] text-slate-400">Total Offers: {offers.length}</p>
        </Card>

        <Card className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Audit Log Entries</span>
            <BookOpen className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-white">{auditLogs.length}</p>
          <Link href="/boss/audit" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
            <span>Inspect audit trail</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Card>
      </div>

      {/* Pending Customers Queue (Visible to BOKA & All Employees) */}
      <PendingCustomersQueueClient
        pendingCustomers={pendingCustomers}
        staffLookup={staffLookup}
      />

      {/* Tickets by Status Breakdown */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <TicketIcon className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            <span>Support Tickets by Status</span>
          </h2>
          <Link href="/boss/tickets" className="text-xs font-medium text-violet-300 hover:underline">
            Assign / Manage Tickets →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          {Object.entries(ticketsByStatus).map(([st, count]) => (
            <div
              key={st}
              className="rounded-xl border border-slate-800 bg-midnight-950/80 p-3 text-center"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {st.replace(/_/g, ' ')}
              </span>
              <span className="mt-1 text-xl font-extrabold text-white block">{count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Employee Performance Leaderboard */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span>Employee Performance Leaderboard (Live from activity_events)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Compare response times, messages sent, tickets resolved, and offers handled across all 4 employees.
            </p>
          </div>
          <Link
            href="/boss/analytics"
            className="text-xs font-semibold text-violet-300 hover:underline"
          >
            Full Analytics & CSV Export →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4">Employee (Alias)</th>
                <th className="py-2.5 px-3">Chat Replies</th>
                <th className="py-2.5 px-3">Ticket Replies</th>
                <th className="py-2.5 px-3">Chat 1st Resp (Med)</th>
                <th className="py-2.5 px-3">Tickets Resolved</th>
                <th className="py-2.5 px-3">Offers Handled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {perfMetrics.map((m) => (
                <tr key={m.employeeId} className="text-slate-200">
                  <td className="py-3 pr-4 font-bold text-white">
                    {m.employeeName}{' '}
                    <span className="text-violet-300 font-normal">({m.publicAlias})</span>
                  </td>
                  <td className="py-3 px-3 font-mono">{m.chatMessagesSent}</td>
                  <td className="py-3 px-3 font-mono">{m.ticketRepliesSent}</td>
                  <td className="py-3 px-3 font-mono text-emerald-300">
                    {formatDurationSeconds(m.chatFirstResponseMedianSec)}
                  </td>
                  <td className="py-3 px-3 font-mono">{m.ticketsResolved}</td>
                  <td className="py-3 px-3 font-mono">{m.offersHandledTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending Offers Snapshot */}
      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">Active Customer Offers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pendingOffers.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-midnight-950/70 p-3.5"
            >
              <div>
                <p className="text-xs font-bold text-white">{o.productTitle}</p>
                <p className="text-[11px] text-slate-400">
                  {o.customerName} • Offered{' '}
                  <strong className="font-mono text-violet-300">
                    {formatPaiseToINR(o.offeredPricePaise)}
                  </strong>{' '}
                  (Listed: {formatPaiseToINR(o.listedPricePaise)})
                </p>
              </div>
              <Badge tone="amber" className="uppercase">
                {o.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
