'use client';

/**
 * JR Family — All-Staff Group Chat & Member Threads (`components/chat/staff-threads.tsx`)
 * Includes:
 * 1. JR Family Group Chat between all Employees (GUZ, NOX, BSTURN, ANKY) and Boss (BOKA).
 * 2. Direct member threads where every employee can text every other employee and Boss (BOKA).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Shield, Users } from 'lucide-react';
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

  const isGroupSelected = selectedThread?.id === 'sthread-group';

  // Every employee and Boss can message in the group chat and in every member thread
  const canWriteThread = Boolean(
    selectedThread && (callerRole === 'boss' || callerRole === 'employee')
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
          <Users className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <span>JR Family</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          JR Family Group Chat plus direct messaging between every employee (GUZ, NOX, BSTURN, ANKY) and Boss (BOKA).
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
            const isGroup = t.id === 'sthread-group';
            const isBossThread = t.employeeId === 'boss-1';
            const active = selectedThread?.id === t.id;
            return (
              <Card
                key={t.id}
                onClick={() => router.push(`${basePath}?threadId=${t.id}`)}
                className={cn(
                  'p-4 cursor-pointer transition space-y-1.5',
                  active
                    ? 'border-emerald-500 bg-midnight-700/90'
                    : isGroup
                      ? 'border-amber-500/40 bg-amber-950/15 hover:border-amber-400'
                      : 'hover:border-slate-700'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    {isGroup ? (
                      <Users className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                    ) : isBossThread ? (
                      <Shield className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                    ) : null}
                    <span>
                      {isGroup
                        ? t.employeeName
                        : isBossThread
                          ? `${t.employeeName} (Boss)`
                          : t.employeeName}
                    </span>
                  </span>
                  {isGroup ? (
                    <Badge tone="amber">JR Family Group</Badge>
                  ) : isBossThread ? (
                    <Badge tone="amber">Boss (BOKA)</Badge>
                  ) : (
                    <Badge tone="emerald">Message</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 line-clamp-1">
                  {t.lastMessagePreview ?? 'Tap to message in JR Family'}
                </p>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-8">
          {selectedThread ? (
            <Card className="flex flex-col h-[540px] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-midnight-900 p-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    {isGroupSelected ? (
                      <>
                        <Users className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        <span>JR Family Group Chat</span>
                      </>
                    ) : (
                      <span>
                        JR Family — {selectedThread.employeeName}
                        {selectedThread.employeeId === 'boss-1' ? ' (Boss)' : ''}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isGroupSelected
                      ? 'Shared group chat for BOKA (Boss), GUZ, NOX, BSTURN, and ANKY.'
                      : `Every JR Family member (GUZ, NOX, BSTURN, ANKY, BOKA) can text ${selectedThread.employeeName} here.`}
                  </p>
                </div>
                <Badge tone="emerald">
                  {isGroupSelected ? 'JR FAMILY GROUP' : 'DIRECT THREAD'}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">
                    No messages yet. Start the conversation below!
                  </p>
                ) : (
                  messages.map((m) => {
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
                          <Badge
                            tone={m.senderRole === 'boss' ? 'amber' : 'cyan'}
                            className="text-[9px]"
                          >
                            {m.senderRole === 'boss' ? 'BOKA (BOSS)' : m.senderName}
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
                              : m.senderRole === 'boss'
                                ? 'bg-amber-500/15 border border-amber-500/40 text-slate-100 rounded-bl-sm'
                                : 'bg-midnight-950 border border-slate-800 text-slate-100 rounded-bl-sm'
                          )}
                        >
                          {m.body}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {canWriteThread ? (
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 border-t border-slate-800 bg-midnight-900 p-3"
                >
                  <label htmlFor="staff-thread-input" className="sr-only">
                    Message in JR Family
                  </label>
                  <Input
                    id="staff-thread-input"
                    placeholder={
                      isGroupSelected
                        ? 'Message everyone in JR Family Group Chat...'
                        : `Message ${selectedThread.employeeName}...`
                    }
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <Button type="submit" disabled={sending || !body.trim()}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Send</span>
                  </Button>
                </form>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
