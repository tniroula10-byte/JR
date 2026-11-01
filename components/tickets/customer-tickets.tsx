'use client';

/**
 * Customer Support Tickets Client (`components/tickets/customer-tickets.tsx`)
 * Supports raising tickets (including against a specific employee, which automatically
 * creates a private 3-member Complaint Chat room with Main Admin/Boss, that Employee, and the Customer),
 * viewing ticket threads & status timelines, and confirming/reopening resolved tickets.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  Ticket as TicketIcon,
  Users
} from 'lucide-react';
import {
  createTicketAction,
  replyTicketAction,
  sendComplaintChatMessageAction,
  transitionTicketAction
} from '@/actions';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Textarea
} from '@/components/ui/primitives';
import type {
  ComplaintChatMessage,
  ComplaintChatRoom,
  CustomerTicketMessageView,
  SelectableStaffAlias,
  Ticket,
  TicketEvent
} from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function CustomerTicketsClient({
  tickets,
  selectedTicket,
  messages,
  events,
  complaintRoom = null,
  complaintMessages = [],
  customerCanPickEmployee,
  selectableAliases
}: {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  messages: CustomerTicketMessageView[];
  events: TicketEvent[];
  complaintRoom?: ComplaintChatRoom | null;
  complaintMessages?: ComplaintChatMessage[];
  customerCanPickEmployee: boolean;
  selectableAliases: SelectableStaffAlias[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<
    'general' | 'points_delivery' | 'offer_inquiry' | 'account_support'
  >('points_delivery');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [requestedEmployeeId, setRequestedEmployeeId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [complaintReplyBody, setComplaintReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await createTicketAction({
        subject,
        description,
        category,
        priority,
        requestedEmployeeId: requestedEmployeeId || null
      });
      if (!res.ok || !res.data) {
        setFeedback(res.error ?? 'Failed to create ticket.');
      } else {
        setSubject('');
        setDescription('');
        setShowCreate(false);
        if (requestedEmployeeId) {
          setFeedback(
            'Ticket raised! A private 3-member Complaint Chat room (Main Admin, selected Employee, and You) has been created automatically.'
          );
        }
        router.push(`/tickets?ticketId=${res.data.id}`);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !replyBody.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await replyTicketAction({
        ticketId: selectedTicket.id,
        body: replyBody.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Could not send reply.');
      } else {
        setReplyBody('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendComplaintMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !complaintReplyBody.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await sendComplaintChatMessageAction({
        ticketId: selectedTicket.id,
        body: complaintReplyBody.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Could not send complaint chat message.');
      } else {
        setComplaintReplyBody('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCustomerTransition(toStatus: 'closed' | 'in_progress') {
    if (!selectedTicket) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await transitionTicketAction({
        ticketId: selectedTicket.id,
        toStatus
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Status transition failed.');
      } else {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">Raise ticket (Boka)</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Raise a support ticket or complaint against a specific employee to automatically open a 3-member private chat room with the Main Admin (Boss), that Employee, and You.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{showCreate ? 'Cancel' : 'Raise New Ticket'}</span>
        </Button>
      </div>

      {feedback ? (
        <div
          role="status"
          className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-200"
        >
          {feedback}
        </div>
      ) : null}

      {showCreate ? (
        <Card className="p-5 space-y-4 border-violet-500/45">
          <h2 className="text-base font-bold text-white">Open a Tracked Support / Complaint Ticket</h2>
          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tkt-category" className="block text-xs font-medium text-slate-300 mb-1">
                  Category
                </label>
                <select
                  id="tkt-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                  className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
                >
                  <option value="points_delivery">Points Delivery / UID Verification</option>
                  <option value="offer_inquiry">Bulk Offer Inquiry</option>
                  <option value="account_support">Account Support / Employee Complaint</option>
                  <option value="general">General Question</option>
                </select>
              </div>
              <div>
                <label htmlFor="tkt-priority" className="block text-xs font-medium text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  id="tkt-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {customerCanPickEmployee && selectableAliases.length > 0 ? (
              <div>
                <label htmlFor="tkt-alias" className="block text-xs font-medium text-violet-300 mb-1">
                  Specific Employee (Selecting an employee automatically creates a 3-member Complaint Chat with Main Admin, that Employee & You)
                </label>
                <select
                  id="tkt-alias"
                  value={requestedEmployeeId}
                  onChange={(e) => setRequestedEmployeeId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-midnight-950 border border-violet-500/40 px-3 text-xs text-slate-100"
                >
                  <option value="">No specific employee (General support queue)</option>
                  {selectableAliases.map((alias) => (
                    <option key={alias.staffId} value={alias.staffId}>
                      Employee Alias: {alias.publicAlias}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="tkt-subject" className="block text-xs font-medium text-slate-300 mb-1">
                Subject
              </label>
              <Input
                id="tkt-subject"
                required
                placeholder="e.g., Issue with specialist delivery or Asia Server UID"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="tkt-desc" className="block text-xs font-medium text-slate-300 mb-1">
                Detailed Description
              </label>
              <Textarea
                id="tkt-desc"
                rows={3}
                required
                placeholder="Include details of your issue, in-game UID, or complaint..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={submitting}>
              <TicketIcon className="h-4 w-4" aria-hidden="true" />
              <span>{submitting ? 'Submitting Ticket...' : 'Submit Ticket'}</span>
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-3">
          {tickets.length === 0 ? (
            <EmptyState
              title="No support tickets yet"
              description="Click 'Raise New Ticket' whenever you need tracked assistance."
            />
          ) : (
            tickets.map((t) => {
              const isSelected = selectedTicket?.id === t.id;
              return (
                <Card
                  key={t.id}
                  onClick={() => router.push(`/tickets?ticketId=${t.id}`)}
                  className={`p-4 cursor-pointer transition ${
                    isSelected ? 'border-violet-500 bg-midnight-700/80' : 'hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-violet-300">
                        TKT-{t.ticketNo}
                      </span>
                      {t.requestedEmployeeAlias ? (
                        <Badge tone="amber">3-Member Room ({t.requestedEmployeeAlias})</Badge>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        t.status === 'resolved'
                          ? 'emerald'
                          : t.status === 'closed'
                            ? 'slate'
                            : 'violet'
                      }
                      className="uppercase"
                    >
                      {t.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <h2 className="mt-1.5 text-sm font-bold text-white">{t.subject}</h2>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Priority: {t.priority.toUpperCase()}</span>
                    <span>{formatIST(t.createdAt)}</span>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Right Detail Thread, 3-Member Complaint Chat & Status Timeline */}
        <div className="lg:col-span-7 space-y-5">
          {selectedTicket ? (
            <>
              {/* 3-Member Private Complaint Chat Room (if ticket raised against a specific employee) */}
              {complaintRoom ? (
                <Card className="p-5 space-y-4 border-amber-500/45 bg-gradient-to-br from-amber-950/25 via-midnight-900 to-midnight-950">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                          Private 3-Member Complaint Chat Room
                        </span>
                        <Badge tone="amber">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          <span>Exactly 3 Members</span>
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        Automatically created for TKT-{selectedTicket.ticketNo}. Strictly private to these three participants:
                      </p>
                    </div>
                  </div>

                  {/* Exact 3 Members Strip */}
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-midnight-950/90 p-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 mr-1">
                      <Users className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                      Members (3):
                    </span>
                    <Badge tone="amber">1. Main Admin (Boss)</Badge>
                    <Badge tone="cyan">2. Employee: {complaintRoom.employeeAlias}</Badge>
                    <Badge tone="violet">3. Customer: {complaintRoom.customerName} (You)</Badge>
                  </div>

                  {/* Complaint Room Messages */}
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {complaintMessages.map((cm) => {
                      const isMe = cm.senderRole === 'customer';
                      return (
                        <div
                          key={cm.id}
                          className={`rounded-xl p-3 text-xs ${
                            isMe
                              ? 'bg-violet-600/20 border border-violet-500/40 text-slate-100'
                              : cm.senderRole === 'boss'
                                ? 'bg-amber-500/15 border border-amber-500/40 text-slate-100'
                                : 'bg-midnight-950 border border-cyan-500/35 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-amber-200">
                              {cm.senderDisplayName}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatIST(cm.createdAt)}
                            </span>
                          </div>
                          <p className="leading-relaxed">{cm.body}</p>
                        </div>
                      );
                    })}
                  </div>

                  {selectedTicket.status !== 'closed' ? (
                    <form onSubmit={handleSendComplaintMessage} className="flex gap-2">
                      <label htmlFor="complaint-room-input" className="sr-only">
                        Message in 3-member complaint room
                      </label>
                      <Input
                        id="complaint-room-input"
                        placeholder={`Message Main Admin (Boss) & ${complaintRoom.employeeAlias} in 3-member room...`}
                        value={complaintReplyBody}
                        onChange={(e) => setComplaintReplyBody(e.target.value)}
                      />
                      <Button
                        type="submit"
                        disabled={submitting || !complaintReplyBody.trim()}
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        <span>Send</span>
                      </Button>
                    </form>
                  ) : null}
                </Card>
              ) : null}

              <Card className="p-5 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-violet-300">
                        TKT-{selectedTicket.ticketNo}
                      </span>
                      <Badge tone="violet" className="uppercase">
                        {selectedTicket.status.replace(/_/g, ' ')}
                      </Badge>
                      {selectedTicket.reopenCount > 0 ? (
                        <Badge tone="amber">Reopened {selectedTicket.reopenCount}x</Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-base font-bold text-white">{selectedTicket.subject}</h2>
                  </div>

                  {selectedTicket.status === 'resolved' ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="emerald"
                        size="sm"
                        disabled={submitting}
                        onClick={() => handleCustomerTransition('closed')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Confirm Resolution (Close)</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={submitting}
                        onClick={() => handleCustomerTransition('in_progress')}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reopen Ticket</span>
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Ticket Messages Thread */}
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl p-3.5 text-xs ${
                        m.senderKind === 'customer'
                          ? 'bg-violet-600/20 border border-violet-500/35 text-slate-100'
                          : 'bg-midnight-950 border border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-violet-300">
                          {m.senderKind === 'staff' ? 'John Rambo Support' : 'You'}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatIST(m.createdAt)}</span>
                      </div>
                      <p className="leading-relaxed">{m.body}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Input (Disabled when Closed) */}
                {selectedTicket.status !== 'closed' ? (
                  <form onSubmit={handleSendReply} className="flex gap-2">
                    <label htmlFor="tkt-reply-input" className="sr-only">
                      Reply to ticket
                    </label>
                    <Input
                      id="tkt-reply-input"
                      placeholder="Reply to John Rambo Support on this ticket..."
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                    <Button type="submit" disabled={submitting || !replyBody.trim()}>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>Reply</span>
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-slate-400 bg-midnight-950 p-3 rounded-xl border border-slate-800">
                    This ticket is closed and final. Raise a new ticket if you need further assistance.
                  </p>
                )}

                {/* Append-Only Status Timeline */}
                <div className="border-t border-slate-800 pt-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Case Timeline</span>
                  </h3>
                  <div className="space-y-1.5">
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between text-[11px] text-slate-300 bg-midnight-950/60 px-3 py-1.5 rounded-lg"
                      >
                        <span>
                          <strong>{ev.actorDisplayName}</strong> • {ev.event.replace(/_/g, ' ')}
                          {ev.toValue ? ` → ${ev.toValue}` : ''}
                        </span>
                        <span className="font-mono text-slate-400">{formatIST(ev.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
