/**
 * Documented Performance Metric Definitions Panel (`components/analytics/performance-definitions.tsx`)
 * Section 9 Requirement: "All figures are computed from activity_events and ticket_events...
 * Never from cached counters. Document these definitions on the dashboard itself."
 */
import React from 'react';
import { BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/primitives';

export function PerformanceDefinitionsPanel() {
  return (
    <Card className="p-5 space-y-3 border-slate-800 bg-midnight-900/70">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300">
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        <span>Official Performance Metric Definitions (Computed Live from Append-Only Ledgers)</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">1. Messages Sent (Chat & Ticket Replies)</p>
          <p className="mt-1 text-slate-400">
            Number of chat replies and ticket replies sent by the employee, shown separately.
          </p>
        </div>

        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">2. First Response Time — Chat (Avg / Median / P90)</p>
          <p className="mt-1 text-slate-400">
            Time from a customer message that is waiting for staff to the first staff reply. Credited to the employee who sent that reply.
          </p>
        </div>

        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">3. First Response Time — Ticket (Avg / Median / P90)</p>
          <p className="mt-1 text-slate-400">
            Time from when the ticket was created to the first staff reply on that ticket. Credited to the replier.
          </p>
        </div>

        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">4. Ticket Resolution Time (Avg / Median)</p>
          <p className="mt-1 text-slate-400">
            Time from when the ticket was created to its most recent resolution. Credited to the employee assigned at the moment of resolution.
          </p>
        </div>

        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">5. Tickets Assigned, Resolved, Pending & Reopened</p>
          <p className="mt-1 text-slate-400">
            Assigned: assignment events in range. Resolved: resolutions credited. Pending: live tickets in Open, Assigned, In Progress, or Waiting for Customer. Reopened: reopen events on tickets resolved by the employee.
          </p>
        </div>

        <div className="rounded-xl bg-midnight-950/70 p-3 border border-slate-800/80">
          <p className="font-bold text-white">6. Offers & Conversations Handled</p>
          <p className="mt-1 text-slate-400">
            Distinct offers where the employee sent a response or changed status (with breakdown by Countered, Accepted, Rejected), and distinct customer conversations where the employee sent at least one staff reply.
          </p>
        </div>
      </div>
    </Card>
  );
}
