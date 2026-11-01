'use client';

/**
 * Employee Dashboard Login Pop-up (`components/shared/employee-boss-popup.tsx`)
 * Automatically displays the Boss's latest announcements, the All-Employees + Boss Group Chat,
 * and the employee's 1-on-1 Boss Thread as a modal pop-up when an employee logs in / visits their dashboard.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Lock,
  Megaphone,
  Send,
  Users,
  X
} from 'lucide-react';
import {
  acknowledgeStaffPostAction,
  sendStaffThreadMessageAction
} from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type {
  StaffAnnouncement,
  StaffThread,
  StaffThreadMessage
} from '@/lib/data/types';
import { formatIST, formatISTTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export function EmployeeBossPopupModal({
  employeeId,
  employeeName,
  announcements,
  bossThread,
  bossThreadMessages,
  groupThreadMessages = []
}: {
  employeeId: string;
  employeeName: string;
  announcements: StaffAnnouncement[];
  bossThread: StaffThread | null;
  bossThreadMessages: StaffThreadMessage[];
  groupThreadMessages?: StaffThreadMessage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [groupReplyBody, setGroupReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [sendingGroupReply, setSendingGroupReply] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleAcknowledge(annId: string) {
    setBusyId(annId);
    setFeedback(null);
    try {
      const res = await acknowledgeStaffPostAction(annId);
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to acknowledge announcement.');
      } else {
        setFeedback('Directive acknowledged.');
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendThreadReply(e: React.FormEvent) {
    e.preventDefault();
    if (!bossThread || !replyBody.trim()) return;
    setSendingReply(true);
    setFeedback(null);
    try {
      const res = await sendStaffThreadMessageAction({
        threadId: bossThread.id,
        body: replyBody.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Could not send message to Boss thread.');
      } else {
        setReplyBody('');
        setFeedback('Message posted to Boss thread.');
        router.refresh();
      }
    } finally {
      setSendingReply(false);
    }
  }

  async function handleSendGroupReply(e: React.FormEvent) {
    e.preventDefault();
    if (!groupReplyBody.trim()) return;
    setSendingGroupReply(true);
    setFeedback(null);
    try {
      const res = await sendStaffThreadMessageAction({
        threadId: 'sthread-group',
        body: groupReplyBody.trim()
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Could not send message to Group Chat.');
      } else {
        setGroupReplyBody('');
        setFeedback('Message posted to All-Employees & Boss Group Chat.');
        router.refresh();
      }
    } finally {
      setSendingGroupReply(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Megaphone className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
        <span>JR Family & Boss Pop-up</span>
      </Button>

      {open && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="boss-popup-title"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-sm"
            >
              <Card className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden border-violet-500/50 bg-midnight-900 shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-gradient-to-r from-violet-950/80 via-midnight-900 to-midnight-900 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/25 border border-violet-500/40 shadow-violet-glow">
                      <Megaphone className="h-5 w-5 text-violet-300" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 id="boss-popup-title" className="text-base sm:text-lg font-extrabold text-white">
                          BOKA Announcements & JR Family
                        </h2>
                        <Badge tone="amber">LOGIN BRIEFING</Badge>
                      </div>
                      <p className="text-xs text-slate-300">
                        Latest BOKA directives, JR Family Group Chat, and your thread for {employeeName}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Close Boss Announcements Pop-up"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                {feedback ? (
                  <div className="border-b border-violet-500/30 bg-violet-500/15 px-5 py-2 text-xs text-violet-200">
                    {feedback}
                  </div>
                ) : null}

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                  {/* Section 1: Boss Announcements */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Megaphone className="h-4 w-4" aria-hidden="true" />
                        <span>Latest BOKA Announcements ({announcements.length})</span>
                      </h3>
                      <Link
                        href="/employee/boss-chat"
                        onClick={() => setOpen(false)}
                        className="text-xs text-violet-300 hover:underline"
                      >
                        Open JR Family →
                      </Link>
                    </div>

                    <div className="space-y-2.5">
                      {announcements.length === 0 ? (
                        <p className="text-xs text-slate-400">No announcements posted by BOKA yet.</p>
                      ) : (
                        announcements.map((ann) => {
                          const myAck = ann.acks.find((a) => a.employeeId === employeeId);
                          return (
                            <div
                              key={ann.id}
                              className="rounded-xl border border-slate-800 bg-midnight-950/90 p-4 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    tone={
                                      ann.priority === 'urgent'
                                        ? 'rose'
                                        : ann.priority === 'important'
                                          ? 'amber'
                                          : 'violet'
                                    }
                                    className="uppercase"
                                  >
                                    {ann.priority}
                                  </Badge>
                                  <span className="text-[11px] text-slate-400">
                                    {ann.authorName} • {formatIST(ann.createdAt)}
                                  </span>
                                </div>

                                {myAck ? (
                                  <Badge tone="emerald">
                                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                    <span>Acknowledged</span>
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    disabled={busyId === ann.id}
                                    onClick={() => handleAcknowledge(ann.id)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Acknowledge Directive</span>
                                  </Button>
                                )}
                              </div>
                              <p className="text-sm font-bold text-white">{ann.title}</p>
                              <p className="text-xs text-slate-300 leading-relaxed">{ann.body}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Section 2: JR Family Group Chat */}
                  <div className="space-y-3 border-t border-slate-800 pt-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>JR Family Group Chat (All Employees & BOKA)</span>
                      </h3>
                      <Link
                        href="/employee/boss-chat?threadId=sthread-group"
                        onClick={() => setOpen(false)}
                        className="text-xs text-violet-300 hover:underline"
                      >
                        Open JR Family →
                      </Link>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-midnight-950/90 p-3.5 space-y-2.5 max-h-48 overflow-y-auto">
                      {groupThreadMessages.length === 0 ? (
                        <p className="text-xs text-slate-400">No group messages yet.</p>
                      ) : (
                        groupThreadMessages.map((m) => {
                          const isMine = m.senderId === employeeId;
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                'flex flex-col max-w-[85%]',
                                isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                              )}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[11px] font-bold text-slate-300">
                                  {m.senderName}
                                </span>
                                <Badge
                                  tone={m.senderRole === 'boss' ? 'amber' : 'cyan'}
                                  className="text-[9px]"
                                >
                                  {m.senderRole.toUpperCase()}
                                </Badge>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {formatISTTime(m.createdAt)}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  'rounded-xl px-3 py-2 text-xs',
                                  isMine
                                    ? 'bg-violet-600 text-white'
                                    : m.senderRole === 'boss'
                                      ? 'bg-amber-500/15 border border-amber-500/40 text-slate-100'
                                      : 'bg-midnight-800 border border-slate-700 text-slate-100'
                                )}
                              >
                                {m.body}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form onSubmit={handleSendGroupReply} className="flex gap-2">
                      <label htmlFor="popup-group-thread-input" className="sr-only">
                        Message all employees and Boss in group chat
                      </label>
                      <Input
                        id="popup-group-thread-input"
                        placeholder="Message all Employees & Boss in Group Chat..."
                        value={groupReplyBody}
                        onChange={(e) => setGroupReplyBody(e.target.value)}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={sendingGroupReply || !groupReplyBody.trim()}
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{sendingGroupReply ? 'Sending...' : 'Send'}</span>
                      </Button>
                    </form>
                  </div>

                  {/* Section 3: The Boss Thread (Direct Boss <-> Employee Thread) */}
                  {bossThread ? (
                    <div className="space-y-3 border-t border-slate-800 pt-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                          <Lock className="h-4 w-4" aria-hidden="true" />
                          <span>
                            Your 1-on-1 Boss Thread (Boss ↔ {bossThread.employeeName} / {bossThread.employeeAlias})
                          </span>
                        </h3>
                        <Link
                          href={`/employee/boss-chat?threadId=${bossThread.id}`}
                          onClick={() => setOpen(false)}
                          className="text-xs text-violet-300 hover:underline"
                        >
                          Open Full Thread →
                        </Link>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-midnight-950/90 p-3.5 space-y-2.5 max-h-48 overflow-y-auto">
                        {bossThreadMessages.length === 0 ? (
                          <p className="text-xs text-slate-400">No messages in your Boss thread yet.</p>
                        ) : (
                          bossThreadMessages.map((m) => {
                            const isMine = m.senderId === employeeId;
                            return (
                              <div
                                key={m.id}
                                className={cn(
                                  'flex flex-col max-w-[85%]',
                                  isMine ? 'ml-auto items-end' : 'mr-auto items-start'
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[11px] font-bold text-slate-300">
                                    {m.senderName}
                                  </span>
                                  <Badge
                                    tone={m.senderRole === 'boss' ? 'amber' : 'cyan'}
                                    className="text-[9px]"
                                  >
                                    {m.senderRole.toUpperCase()}
                                  </Badge>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {formatISTTime(m.createdAt)}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    'rounded-xl px-3 py-2 text-xs',
                                    isMine
                                      ? 'bg-violet-600 text-white'
                                      : 'bg-midnight-800 border border-slate-700 text-slate-100'
                                  )}
                                >
                                  {m.body}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <form onSubmit={handleSendThreadReply} className="flex gap-2">
                        <label htmlFor="popup-boss-thread-input" className="sr-only">
                          Reply to Boss in thread
                        </label>
                        <Input
                          id="popup-boss-thread-input"
                          placeholder="Quick reply to Boss in your 1-on-1 Boss Thread..."
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                        />
                        <Button type="submit" size="sm" disabled={sendingReply || !replyBody.trim()}>
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{sendingReply ? 'Sending...' : 'Reply'}</span>
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-midnight-950 px-5 py-3">
                  <Button onClick={() => setOpen(false)}>
                    <span>Continue to Dashboard</span>
                  </Button>
                </div>
              </Card>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
