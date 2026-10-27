'use client';

/**
 * Shared Staff Support Tickets Workspace (`components/tickets/staff-tickets.tsx`)
 * Used by both Employee (`/employee/tickets`) and Boss (`/boss/tickets`).
 * - Boss can assign/reassign any ticket and reply/transition any ticket.
 * - Employee can reply and transition ONLY tickets assigned to them; other employees' tickets
 *   are strictly read-only (Decision 6 & Section 7 Permission Matrix).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Lock, Send, UserCheck } from 'lucide-react';
import {
  assignTicketAction,
  replyTicketAction,
  transitionTicketAction
} from '@/actions';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import type {
  EmployeeWithFlags,
  StaffTicketMessageView,
  Ticket,
  TicketEvent,
  TicketStatus,
  UserRole
} from '@/lib/data/types';
import { getAllowedNextStatuses } from '@/lib/tickets/state-machine';
import { formatIST } from '@/lib/time';

export function StaffTicketsClient({
  basePath,
  callerId,
  callerRole,
  tickets,
  selectedTicket,
  messages,
  events,
  employees
}: {
  basePath: '/employee/tickets' | '/boss/tickets';
  callerId: string;
  callerRole: UserRole;
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  messages: StaffTicketMessageView[];
  events: TicketEvent[];
  employees: EmployeeWithFlags[];
}) {
  const router = useRouter();
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>(
    callerRole === 'employee' ? 'mine' : 'all'
  );
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const visibleTickets =
    filterMode === 'mine' && callerRole === 'employee'
      ? tickets.filter((t) => t.assignedEmployeeId === callerId)
      : tickets;

  const isAssignedToCaller = Boolean(
    selectedTicket && selectedTicket.assignedEmployeeId === callerId
  );
  const canWriteSelected =
    callerRole === 'boss' || (callerRole === 'employee' && isAssignedToCaller);

  const allowedTransitions: TicketStatus[] = selectedTicket
    ? getAllowedNextStatuses(selectedTicket.status, callerRole, isAssignedToCaller)
    : [];

  async function handleAssign(employeeId: string) {
    if (!selectedTicket || !employeeId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await assignTicketAction({
        ticketId: selectedTicket.id,
        employeeId
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to assign ticket.');
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !replyBody.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await replyTicketAction({
        ticketId: selectedTicket.id,
        body: replyBody.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Reply rejected.');
      } else {
        setReplyBody('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusTransition(toStatus: TicketStatus) {
    if (!selectedTicket) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await transitionTicketAction({
        ticketId: selectedTicket.id,
        toStatus
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Status transition rejected.');
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">
            {callerRole === 'boss'
              ? 'All Support Tickets & Assignment Queue'
              : 'Support Tickets (Assigned & Colleague Read-Only)'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Strict status machine enforced. Only the assigned employee or the Boss can reply or change status.
          </p>
        </div>

        {callerRole === 'employee' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filterMode === 'mine' ? 'primary' : 'secondary'}
              onClick={() => setFilterMode('mine')}
            >
              My Assigned ({tickets.filter((t) => t.assignedEmployeeId === callerId).length})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'all' ? 'primary' : 'secondary'}
              onClick={() => setFilterMode('all')}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>All Tickets Read-Only ({tickets.length})</span>
            </Button>
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Ticket Queue */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
          {visibleTickets.length === 0 ? (
            <EmptyState
              title="No tickets in this view"
              description="Switch to 'All Tickets' to inspect colleagues' tickets in read-only mode."
            />
          ) : (
            visibleTickets.map((t) => {
              const active = selectedTicket?.id === t.id;
              return (
                <Card
                  key={t.id}
                  onClick={() => router.push(`${basePath}?ticketId=${t.id}`)}
                  className={`p-4 cursor-pointer transition space-y-1.5 ${
                    active ? 'border-violet-500 bg-midnight-700/90' : 'hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      TKT-{t.ticketNo}
                    </span>
                    <Badge
                      tone={
                        t.status === 'resolved'
                          ? 'emerald'
                          : t.status === 'open'
                            ? 'amber'
                            : 'cyan'
                      }
                      className="uppercase"
                    >
                      {t.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <h2 className="text-sm font-bold text-white">{t.subject}</h2>
                  <p className="text-xs text-slate-400">
                    Customer: <span className="text-slate-200">{t.customerName}</span> • Assignee:{' '}
                    <span className="text-violet-300 font-semibold">
                      {t.assignedEmployeeName
                        ? `${t.assignedEmployeeName} (${t.assignedEmployeeAlias})`
                        : 'Unassigned'}
                    </span>
                  </p>
                </Card>
              );
            })
          )}
        </div>

        {/* Right Ticket Thread & Controls */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-violet-300">
                      TKT-{selectedTicket.ticketNo}
                    </span>
                    <Badge tone="cyan" className="uppercase">
                      {selectedTicket.status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge tone="slate">Priority: {selectedTicket.priority.toUpperCase()}</Badge>
                  </div>
                  <h2 className="mt-1 text-base font-bold text-white">{selectedTicket.subject}</h2>
                  <p className="text-xs text-slate-400">
                    Customer: {selectedTicket.customerName} • Assigned:{' '}
                    <strong className="text-violet-300">
                      {selectedTicket.assignedEmployeeName ?? 'Unassigned'}
                    </strong>
                  </p>
                </div>

                {/* Boss Assignment Dropdown */}
                {callerRole === 'boss' && selectedTicket.status !== 'closed' ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor="boss-ticket-assign" className="text-xs text-slate-300">
                      Assign:
                    </label>
                    <select
                      id="boss-ticket-assign"
                      disabled={busy}
                      value={selectedTicket.assignedEmployeeId ?? ''}
                      onChange={(e) => handleAssign(e.target.value)}
                      className="h-9 rounded-xl bg-midnight-950 border border-violet-500/40 px-2.5 text-xs text-slate-100"
                    >
                      <option value="">Select employee...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.staffProfile.publicAlias})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {/* Status Machine Transition Controls */}
              {canWriteSelected && allowedTransitions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-midnight-950/80 p-3 border border-slate-800">
                  <span className="text-xs font-medium text-slate-300 mr-1">
                    Transition Status:
                  </span>
                  {allowedTransitions.map((nextSt) => (
                    <Button
                      key={nextSt}
                      size="sm"
                      variant={nextSt === 'resolved' ? 'emerald' : 'secondary'}
                      disabled={busy}
                      onClick={() => handleStatusTransition(nextSt)}
                    >
                      → {nextSt.replace(/_/g, ' ').toUpperCase()}
                    </Button>
                  ))}
                </div>
              ) : null}

              {!canWriteSelected ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Read-Only Mode: Only the assigned specialist (
                    {selectedTicket.assignedEmployeeName ?? 'Unassigned'}) or the Boss can reply or transition this ticket.
                  </span>
                </div>
              ) : null}

              {/* Ticket Messages with Staff Attribution */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3.5 text-xs ${
                      m.senderKind === 'staff'
                        ? 'bg-violet-600/20 border border-violet-500/35 text-slate-100'
                        : 'bg-midnight-950 border border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-violet-300">{m.senderDisplayName}</span>
                        {m.senderKind === 'staff' && m.attributedStaffName ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/35 px-2 py-0.5 text-[10px] text-cyan-200">
                            <UserCheck className="h-3 w-3" aria-hidden="true" />
                            {m.attributedStaffName} ({m.attributedStaffAlias})
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[11px] text-slate-400">{formatIST(m.createdAt)}</span>
                    </div>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>

              {/* Reply Input */}
              {canWriteSelected && selectedTicket.status !== 'closed' ? (
                <form onSubmit={handleReply} className="flex gap-2">
                  <label htmlFor="staff-ticket-reply" className="sr-only">
                    Reply to ticket
                  </label>
                  <Input
                    id="staff-ticket-reply"
                    placeholder="Send ticket reply as John Rambo Support..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                  />
                  <Button type="submit" disabled={busy || !replyBody.trim()}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Reply</span>
                  </Button>
                </form>
              ) : null}

              {/* Append-Only Event Trail */}
              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Append-Only Ticket Event Ledger ({events.length})
                </p>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between text-[11px] text-slate-300 bg-midnight-950/60 px-3 py-1.5 rounded-lg"
                  >
                    <span>
                      <strong>{ev.event.toUpperCase()}</strong> ({ev.fromValue ?? 'init'} →{' '}
                      {ev.toValue ?? '—'})
                    </span>
                    <span className="font-mono text-slate-400">{formatIST(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
