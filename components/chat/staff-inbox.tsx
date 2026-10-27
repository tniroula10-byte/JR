'use client';

/**
 * Shared Staff Customer Inbox (`components/chat/staff-inbox.tsx`)
 * Used by both Employee (`/employee/inbox`) and Boss (`/boss/inbox`).
 * - Shows the real employee attribution (`message_attribution`) behind every staff reply.
 * - Replying automatically records the employee as current handler (`handled_by`).
 * - Boss can reassign `handled_by` at any time.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Send, UserCheck, Shield } from 'lucide-react';
import { reassignConversationAction, sendStaffMessageAction } from '@/actions';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import type {
  Conversation,
  EmployeeWithFlags,
  InboxScopeMode,
  StaffMessageView
} from '@/lib/data/types';
import { formatPaiseToINR } from '@/lib/money';
import { formatISTTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export function StaffInboxClient({
  basePath,
  isBoss,
  inboxScope,
  conversations,
  selectedConversation,
  initialMessages,
  employees
}: {
  basePath: '/employee/inbox' | '/boss/inbox';
  isBoss: boolean;
  inboxScope: InboxScopeMode;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  initialMessages: StaffMessageView[];
  employees: EmployeeWithFlags[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<StaffMessageView[]>(initialMessages);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Live Realtime / Polling synchronization for multi-context chat
  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [router]);

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConversation || !body.trim()) return;
    setSending(true);
    setFeedback(null);
    const clientMsgId = `smsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await sendStaffMessageAction({
        conversationId: selectedConversation.id,
        body: body.trim(),
        clientMsgId
      });
      if (!res.ok || !res.data) {
        setFeedback(res.error ?? 'Failed to send reply.');
      } else {
        setMessages((prev) => [...prev, res.data!]);
        setBody('');
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  async function handleReassign(employeeId: string) {
    if (!selectedConversation) return;
    setSending(true);
    try {
      const res = await reassignConversationAction(
        selectedConversation.id,
        employeeId || null
      );
      if (!res.ok) {
        setFeedback(res.error ?? 'Could not reassign handler.');
      } else {
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">
            {isBoss ? 'Master Shared Customer Inbox (With Staff Attribution)' : 'Customer Support Inbox'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Customers see replies as <strong>John Rambo Support</strong>. Staff see the real attributed employee on every message.
          </p>
        </div>
        <Badge tone="violet">Scope Mode: {inboxScope.toUpperCase()}</Badge>
      </div>

      {feedback ? (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Conversation List */}
        <div className="lg:col-span-4 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <EmptyState
              title="No conversations in scope"
              description={
                inboxScope === 'assigned_only'
                  ? 'Employee inbox scope is set to ASSIGNED_ONLY and no conversations are currently assigned to you.'
                  : 'No customer conversations available.'
              }
            />
          ) : (
            conversations.map((conv) => {
              const active = selectedConversation?.id === conv.id;
              return (
                <Card
                  key={conv.id}
                  onClick={() => router.push(`${basePath}?conversationId=${conv.id}`)}
                  className={cn(
                    'p-3.5 cursor-pointer transition space-y-2',
                    active ? 'border-violet-500 bg-midnight-700/90' : 'hover:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white truncate">
                      {conv.customerName}
                    </span>
                    {conv.awaitingStaff ? (
                      <Badge tone="rose">Awaiting Reply</Badge>
                    ) : (
                      <Badge tone="emerald">Replied</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-1">
                    {conv.lastMessagePreview ?? 'No messages yet'}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Handler:{' '}
                      <strong className="text-violet-300">
                        {conv.handledByName
                          ? `${conv.handledByName} (${conv.handledByAlias ?? 'Staff'})`
                          : 'Unassigned'}
                      </strong>
                    </span>
                    <span>{formatISTTime(conv.lastMessageAt)}</span>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Active Conversation Thread */}
        <div className="lg:col-span-8">
          {selectedConversation ? (
            <Card className="flex flex-col h-[600px] overflow-hidden">
              {/* Thread Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-midnight-900/90 p-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    {selectedConversation.customerName}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedConversation.customerEmail} • Handler:{' '}
                    <span className="font-semibold text-violet-300">
                      {selectedConversation.handledByName ?? 'Unassigned'}
                    </span>
                  </p>
                </div>

                {isBoss ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor="handler-reassign-select" className="text-xs text-slate-300">
                      Assign Handler:
                    </label>
                    <select
                      id="handler-reassign-select"
                      value={selectedConversation.handledBy ?? ''}
                      onChange={(e) => handleReassign(e.target.value)}
                      className="h-9 rounded-xl bg-midnight-950 border border-violet-500/40 px-2.5 text-xs text-slate-100"
                    >
                      <option value="">Unassigned</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.staffProfile.publicAlias})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {/* Messages with Staff Attribution */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const isStaff = m.senderKind === 'staff';
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex flex-col max-w-[85%] sm:max-w-[75%]',
                        isStaff ? 'ml-auto items-end' : 'mr-auto items-start'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 mb-1 px-1">
                        <span className="text-[11px] font-bold text-slate-200">
                          {isStaff ? 'John Rambo Support' : selectedConversation.customerName}
                        </span>
                        {isStaff && m.attributedStaffName ? (
                          <span
                            data-testid="staff-attribution-badge"
                            className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                          >
                            <UserCheck className="h-3 w-3" aria-hidden="true" />
                            Sent by {m.attributedStaffName} ({m.attributedStaffAlias ?? 'Staff'})
                          </span>
                        ) : null}
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatISTTime(m.createdAt)}
                        </span>
                      </div>

                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 text-xs sm:text-sm',
                          isStaff
                            ? 'bg-violet-600 text-white rounded-br-sm'
                            : 'bg-midnight-900 border border-slate-800 text-slate-100 rounded-bl-sm'
                        )}
                      >
                        {m.type === 'offer' && m.offerSnapshot ? (
                          <div className="mb-2 rounded-xl border border-white/15 bg-black/30 p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300">
                                <Coins className="h-3 w-3" aria-hidden="true" />
                                Offer #{m.offerSnapshot.id}
                              </span>
                              <Badge tone="amber" className="uppercase text-[10px]">
                                {m.offerSnapshot.status}
                              </Badge>
                            </div>
                            <p className="text-xs font-semibold">
                              {m.offerSnapshot.productTitle} —{' '}
                              {formatPaiseToINR(m.offerSnapshot.offeredPricePaise)}
                            </p>
                          </div>
                        ) : null}
                        <p>{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Input */}
              <form
                onSubmit={handleSendReply}
                className="flex items-center gap-2 border-t border-slate-800 bg-midnight-900 p-3"
              >
                <label htmlFor="staff-chat-reply-input" className="sr-only">
                  Reply as John Rambo Support
                </label>
                <Input
                  id="staff-chat-reply-input"
                  placeholder="Reply as John Rambo Support (attribution recorded internally)..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <Button type="submit" disabled={sending || !body.trim()}>
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reply</span>
                </Button>
              </form>
            </Card>
          ) : (
            <EmptyState
              title="Select a conversation"
              description="Choose a customer conversation on the left to inspect or reply."
            />
          )}
        </div>
      </div>
    </div>
  );
}
