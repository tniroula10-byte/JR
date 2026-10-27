'use client';

/**
 * Boss Staff Performance Analytics & Comparison (`components/analytics/boss-analytics-client.tsx`)
 * Section 9:
 * - Filters by employee and date range
 * - Side-by-side comparison table across all metrics (Avg, Median, P90)
 * - Chronological employee activity timeline
 * - Server-side CSV export (`/api/exports/performance`, logged in `audit_log`)
 * - Documented metric definitions on the dashboard itself
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Filter } from 'lucide-react';
import { PerformanceDefinitionsPanel } from '@/components/analytics/performance-definitions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type {
  ActivityEvent,
  EmployeePerformanceMetrics,
  EmployeeWithFlags
} from '@/lib/data/types';
import { formatDurationSeconds, formatIST } from '@/lib/time';

export function BossAnalyticsClient({
  employees,
  metrics,
  activityEvents,
  selectedEmployeeId,
  startDateIso,
  endDateIso
}: {
  employees: EmployeeWithFlags[];
  metrics: EmployeePerformanceMetrics[];
  activityEvents: ActivityEvent[];
  selectedEmployeeId: string;
  startDateIso: string;
  endDateIso: string;
}) {
  const router = useRouter();
  const [empFilter, setEmpFilter] = useState(selectedEmployeeId);
  const [startDate, setStartDate] = useState(startDateIso);
  const [endDate, setEndDate] = useState(endDateIso);

  function handleApplyFilter(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (empFilter) params.set('employeeId', empFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    router.push(`/boss/analytics?${params.toString()}`);
  }

  const csvParams = new URLSearchParams();
  if (empFilter) csvParams.set('employeeId', empFilter);
  if (startDate) csvParams.set('startDate', startDate);
  if (endDate) csvParams.set('endDate', endDate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-violet-400" aria-hidden="true" />
            <span>Staff Performance Analytics & Side-by-Side Comparison</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Computed dynamically from append-only <code>activity_events</code> and <code>ticket_events</code>.
          </p>
        </div>

        <a
          href={`/api/exports/performance?${csvParams.toString()}`}
          download="john-rambo-staff-performance.csv"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Export CSV (Logged to Audit)</span>
        </a>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="analytics-emp-filter" className="block text-xs font-medium text-slate-300 mb-1">
              Filter by Employee
            </label>
            <select
              id="analytics-emp-filter"
              value={empFilter}
              onChange={(e) => setEmpFilter(e.target.value)}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              <option value="">All 4 Employees (Side-by-Side)</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.staffProfile.publicAlias})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="analytics-start-date" className="block text-xs font-medium text-slate-300 mb-1">
              From Date (UTC/IST)
            </label>
            <Input
              id="analytics-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="analytics-end-date" className="block text-xs font-medium text-slate-300 mb-1">
              To Date (UTC/IST)
            </label>
            <Input
              id="analytics-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <Button type="submit">
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span>Apply Filters</span>
          </Button>
        </form>
      </Card>

      {/* Side-by-Side Comparison Matrix */}
      <Card className="p-5 space-y-3 overflow-hidden">
        <h2 className="text-base font-bold text-white">
          Side-by-Side Employee Comparison Matrix
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-3">Employee</th>
                <th className="py-2.5 px-2">Chat Msgs</th>
                <th className="py-2.5 px-2">Tkt Replies</th>
                <th className="py-2.5 px-2">Chat 1st Resp (Avg / Med / P90)</th>
                <th className="py-2.5 px-2">Tkt 1st Resp (Avg / Med / P90)</th>
                <th className="py-2.5 px-2">Tkt Resolution (Avg / Med)</th>
                <th className="py-2.5 px-2">Assigned / Resolved / Pending / Reopen</th>
                <th className="py-2.5 px-2">Offers (Tot: Acc/Cnt/Rej)</th>
                <th className="py-2.5 pl-2">Convs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {metrics.map((m) => (
                <tr key={m.employeeId} className="text-slate-200">
                  <td className="py-3 pr-3 font-bold text-white">
                    {m.employeeName}
                    <span className="block text-[11px] font-normal text-violet-300">
                      Alias: {m.publicAlias}
                    </span>
                  </td>
                  <td className="py-3 px-2 font-mono">{m.chatMessagesSent}</td>
                  <td className="py-3 px-2 font-mono">{m.ticketRepliesSent}</td>
                  <td className="py-3 px-2 font-mono text-emerald-300">
                    {formatDurationSeconds(m.chatFirstResponseAvgSec)} /{' '}
                    {formatDurationSeconds(m.chatFirstResponseMedianSec)} /{' '}
                    {formatDurationSeconds(m.chatFirstResponseP90Sec)}
                  </td>
                  <td className="py-3 px-2 font-mono text-cyan-300">
                    {formatDurationSeconds(m.ticketFirstResponseAvgSec)} /{' '}
                    {formatDurationSeconds(m.ticketFirstResponseMedianSec)} /{' '}
                    {formatDurationSeconds(m.ticketFirstResponseP90Sec)}
                  </td>
                  <td className="py-3 px-2 font-mono">
                    {formatDurationSeconds(m.ticketResolutionAvgSec)} /{' '}
                    {formatDurationSeconds(m.ticketResolutionMedianSec)}
                  </td>
                  <td className="py-3 px-2 font-mono">
                    {m.ticketsAssigned} / {m.ticketsResolved} / {m.ticketsPending} /{' '}
                    {m.ticketsReopened}
                  </td>
                  <td className="py-3 px-2 font-mono">
                    {m.offersHandledTotal} ({m.offersAccepted}/{m.offersCountered}/{m.offersRejected})
                  </td>
                  <td className="py-3 pl-2 font-mono">{m.conversationsHandled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Chronological Activity Timeline */}
      <Card className="p-5 space-y-3">
        <h2 className="text-base font-bold text-white">
          Employee Activity Timeline ({activityEvents.length} Events)
        </h2>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {activityEvents.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-midnight-950/70 px-3.5 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <Badge tone="cyan">{ev.actorName ?? ev.actorId}</Badge>
                <span className="font-semibold text-white">{ev.eventType}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {JSON.stringify(ev.meta)}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {formatIST(ev.occurredAt)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Documented Definitions on the Dashboard Itself */}
      <PerformanceDefinitionsPanel />
    </div>
  );
}
