'use client';

/**
 * Staff Channel Announcements (`components/shared/staff-channel.tsx`)
 * Decision 9: Only the Boss can post. Employees read it, get notified, and acknowledge each post
 * (recorded with timestamp). No employee replies.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Megaphone } from 'lucide-react';
import { acknowledgeStaffPostAction } from '@/actions';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { StaffAnnouncement } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function EmployeeStaffChannelClient({
  employeeId,
  announcements
}: {
  employeeId: string;
  announcements: StaffAnnouncement[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleAcknowledge(annId: string) {
    setBusyId(annId);
    setFeedback(null);
    try {
      const res = await acknowledgeStaffPostAction(annId);
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to acknowledge post.');
      } else {
        setFeedback('Directive acknowledged and timestamp recorded.');
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Staff Broadcast Channel</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Boss-only directives. Review and click <strong>Acknowledge</strong> on each announcement (no replies).
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {feedback}
        </div>
      ) : null}

      <div className="space-y-4">
        {announcements.map((ann) => {
          const myAck = ann.acks.find((a) => a.employeeId === employeeId);
          return (
            <Card key={ann.id} className="p-5 space-y-3">
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
                  <span className="text-xs text-slate-400">
                    Posted by {ann.authorName} • {formatIST(ann.createdAt)}
                  </span>
                </div>

                {myAck ? (
                  <Badge tone="emerald">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Acknowledged at {formatIST(myAck.acknowledgedAt)}</span>
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

              <h2 className="text-base font-bold text-white">{ann.title}</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{ann.body}</p>

              <div className="border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                Team Acknowledgements ({ann.acks.length}/4):{' '}
                {ann.acks.map((a) => a.employeeName).join(', ') || 'None yet'}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
