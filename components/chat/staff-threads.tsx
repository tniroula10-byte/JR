'use client';

/**
 * Shared Boss–Employee Private Threads (`components/chat/staff-threads.tsx`)
 * Decision 8: One thread per employee.
 * - The Boss and THAT employee can read and write it.
 * - The other employees can read it (`SELECT`) for transparency, but CANNOT write (`INSERT`).
 * - Customers have zero access.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Lock, Send } from 'lucide-react';
import { sendStaffThreadMessageAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { StaffThread, StaffThreadMessage, UserRole } from '@/lib/data/types';
import { formatISTTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export function StaffThreadsClient({
  basePath,
  callerId,
  callerRole,
  threads,
  selectedThread,
  messages
}: {
  basePath: '/employee/boss-chat' | '/boss/threads';
  callerId: string;
  callerRole: UserRole;
  threads: StaffThread[];
  selectedThread: StaffThread | null;
  messages: StaffThreadMessage[];
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canWriteThread = Boolean(
    selectedThread &&
      (callerRole === 'boss' ||
        (callerRole === 'employee' && selectedThread.employeeId === callerId))
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedThread || !body.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await sendStaffThreadMessageAction({
        threadId: selectedThread.id,
        body: body.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to post message.');
      } else {
        setBody('');
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Lock className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>
            {callerRole === 'boss'
              ? 'Internal Boss–Employee Threads (4 Specialists)'
              : 'Boss Direct Line & Colleague Thread Transparency'}
          </span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          One thread per employee. The Boss and that employee can read and write; colleagues have read-only access.
        </p>
      </div>

      {feedback ? (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-2.5">
          {threads.map((t) => {
            const isOwn = t.employeeId === callerId;
            const active = selectedThread?.id === t.id;
            return (
              <Card
                key={t.id}
                onClick={() => router.push(`${basePath}?threadId=${t.id}`)}
                className={cn(
                  'p-4 cursor-pointer transition space-y-1.5',
                  active ? 'border-violet-500 bg-midnight-700/90' : 'hover:border-slate-700'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">
                    {t.employeeName} ({t.employeeAlias})
                  </span>
                  {callerRole === 'boss' || isOwn ? (
                    <Badge tone="emerald">Read & Write</Badge>
                  ) : (
                    <Badge tone="slate">
                      <Eye className="h-3 w-3" aria-hidden="true" />
                      <span>Read-Only</span>
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 line-clamp-1">
                  {t.lastMessagePreview ?? 'No messages yet'}
                </p>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-8">
          {selectedThread ? (
            <Card className="flex flex-col h-[520px] overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 bg-midnight-900 p-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Boss ↔ {selectedThread.employeeName} ({selectedThread.employeeAlias})
                  </h2>
                  <p className="text-xs text-slate-400">
                    {canWriteThread
                      ? 'You have Read & Write authority in this thread.'
                      : "Colleague Thread: Read-Only View (Posting disabled by RLS & RPC)."}
                  </p>
                </div>
                <Badge tone={canWriteThread ? 'emerald' : 'amber'}>
                  {canWriteThread ? 'WRITABLE' : 'READ-ONLY'}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const isMine = m.senderId === callerId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex flex-col max-w-[80%]',
                        isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[11px] font-bold text-slate-300">
                          {m.senderName}
                        </span>
                        <Badge tone={m.senderRole === 'boss' ? 'amber' : 'cyan'} className="text-[9px]">
                          {m.senderRole.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatISTTime(m.createdAt)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-xs sm:text-sm',
                          isMine
                            ? 'bg-violet-600 text-white rounded-br-sm'
                            : 'bg-midnight-950 border border-slate-800 text-slate-100 rounded-bl-sm'
                        )}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>

              {canWriteThread ? (
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 border-t border-slate-800 bg-midnight-900 p-3"
                >
                  <label htmlFor="staff-thread-input" className="sr-only">
                    Message in private staff thread
                  </label>
                  <Input
                    id="staff-thread-input"
                    placeholder={`Message ${
                      callerRole === 'boss' ? selectedThread.employeeName : 'Boss'
                    }...`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <Button type="submit" disabled={sending || !body.trim()}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Send</span>
                  </Button>
                </form>
              ) : (
                <div className="border-t border-slate-800 bg-midnight-950 p-3 text-center text-xs text-amber-300">
                  Read-only colleague thread — you can read this thread for operational alignment, but only the Boss and {selectedThread.employeeName} can post messages here.
                </div>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
