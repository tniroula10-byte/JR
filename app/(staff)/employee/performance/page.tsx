import React from 'react';
import { Activity } from 'lucide-react';
import { PerformanceDefinitionsPanel } from '@/components/analytics/performance-definitions';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatDurationSeconds, formatIST } from '@/lib/time';

export default async function EmployeePerformancePage() {
  const { profile, caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();

  const [metricsList, myEvents] = await Promise.all([
    repo.getEmployeePerformance(caller, { employeeId: profile.id }),
    repo.listActivityEvents(caller, { employeeId: profile.id })
  ]);

  const m = metricsList[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <span>My Performance Statistics ({profile.fullName})</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Computed dynamically from append-only <code>activity_events</code> and <code>ticket_events</code>. Employees can only view their own statistics.
          </p>
        </div>
        {m ? <Badge tone="cyan">Public Alias: {m.publicAlias}</Badge> : null}
      </div>

      {m ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-slate-400">Chat Messages Sent</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{m.chatMessagesSent}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Conversations Handled: {m.conversationsHandled}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-400">Ticket Replies Sent</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{m.ticketRepliesSent}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Assigned: {m.ticketsAssigned} • Resolved: {m.ticketsResolved}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-400">Chat 1st Response (Avg / Med / P90)</p>
            <p className="mt-1 font-mono text-sm font-bold text-emerald-300">
              {formatDurationSeconds(m.chatFirstResponseAvgSec)} /{' '}
              {formatDurationSeconds(m.chatFirstResponseMedianSec)} /{' '}
              {formatDurationSeconds(m.chatFirstResponseP90Sec)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Calendar time (IST)</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-400">Ticket 1st Response (Avg / Med / P90)</p>
            <p className="mt-1 font-mono text-sm font-bold text-cyan-300">
              {formatDurationSeconds(m.ticketFirstResponseAvgSec)} /{' '}
              {formatDurationSeconds(m.ticketFirstResponseMedianSec)} /{' '}
              {formatDurationSeconds(m.ticketFirstResponseP90Sec)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Resolution Med: {formatDurationSeconds(m.ticketResolutionMedianSec)}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-400">Offers Handled</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{m.offersHandledTotal}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Accepted: {m.offersAccepted} • Countered: {m.offersCountered} • Rejected: {m.offersRejected}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-400">Live Pending Tickets</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-300">{m.ticketsPending}</p>
            <p className="mt-1 text-[11px] text-slate-400">Reopened: {m.ticketsReopened}</p>
          </Card>
        </div>
      ) : null}

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">My Recent Activity Ledger ({myEvents.length})</h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {myEvents.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-midnight-950/70 px-3.5 py-2 text-xs"
            >
              <span className="text-slate-200 font-medium">{ev.eventType}</span>
              <span className="font-mono text-slate-400">{formatIST(ev.occurredAt)}</span>
            </div>
          ))}
        </div>
      </Card>

      <PerformanceDefinitionsPanel />
    </div>
  );
}
